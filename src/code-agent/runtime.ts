import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { CodexCodeAgentProvider } from './codex.provider.js';
import type { CodeAgentCheck, CodeAgentJob, CodeAgentStatus } from './types.js';

const execFileAsync = promisify(execFile);
const PROJECT = {
  projectId: 'a-istra' as const,
  repositoryPath: '/opt/olnoo/projects/a-istra',
  defaultBranch: 'redesign/3-red-maloe-isakovo',
  packageManager: 'npm',
  installCommand: ['npm', 'install', '--ignore-scripts', '--no-package-lock'],
  testCommand: null,
  lintCommand: ['npm', 'run', 'lint'],
  typecheckCommand: null,
  buildCommand: ['npm', 'run', 'build:static'],
  previewCommand: ['npm', 'run', 'preview:static'],
  previewPortStrategy: '4200-4699',
  allowedPaths: ['**'],
  forbiddenPaths: ['.env*', '.git', '.ssh', '*.pem', '*.key', 'credentials*', 'secrets*'],
  projectRulesPaths: ['AGENTS.md', 'README.md', 'docs/**'],
  publishStrategy: 'existing-safe-flow-pending-approval',
  checks: [['lint', 'lint'], ['build', 'build:static']] as const,
};
const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|\.git|\.ssh|credentials?|secrets?|.*\.(?:pem|key|p12|pfx))(\/|$)/i;

export class CodeAgentRuntime {
  private readonly jobs = new Map<string, CodeAgentJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly previews = new Map<string, ChildProcess>();
  private readonly provider: CodexCodeAgentProvider;
  constructor(private readonly env: Env, private readonly logger: { info: (data: object, message: string) => void; error: (data: object, message: string) => void }) {
    this.provider = new CodexCodeAgentProvider(env.CODE_AGENT_MAX_LOG_BYTES);
  }

  create(input: { projectId: string; instruction: string; attachments: string[]; provider: 'auto' | 'codex'; mode: 'preview_only'; requestId: string }): Promise<CodeAgentJob> {
    if (!this.env.CODE_AGENT_ENABLED) throw new Error('CODE_AGENT_DISABLED');
    if (input.projectId !== PROJECT.projectId) throw new Error('PROJECT_NOT_ALLOWED');
    if ([...this.jobs.values()].some((job) => job.projectId === input.projectId && !isTerminal(job.status))) throw new Error('PROJECT_BUSY');
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: CodeAgentJob = { jobId, requestId: input.requestId, projectId: PROJECT.projectId, provider: 'codex', mode: input.mode, status: 'queued', createdAt: now, updatedAt: now, changedFiles: [], checks: [], events: [], attachments: [...input.attachments] };
    this.jobs.set(jobId, job);
    this.event(job, 'queued', 'Задача поставлена в очередь.');
    void this.run(job, input.instruction);
    return Promise.resolve(job);
  }

  get(jobId: string): CodeAgentJob | undefined { return this.jobs.get(jobId); }

  async discard(jobId: string): Promise<CodeAgentJob> {
    const job = this.required(jobId);
    this.controllers.get(jobId)?.abort();
    this.event(job, 'discarding', 'Рабочая версия удаляется.');
    await this.stopPreview(jobId);
    await this.removeWorktree(jobId);
    delete job.diff; delete job.previewUrl;
    this.event(job, 'discarded', 'Изменения отменены.');
    return job;
  }

  publish(jobId: string): Promise<CodeAgentJob> {
    const job = this.required(jobId);
    if (job.status !== 'ready_for_preview' && job.status !== 'publish_pending') throw new Error('JOB_NOT_READY');
    this.event(job, 'publish_pending', 'Публикация ожидает отдельного production-подтверждения.');
    return Promise.resolve(job);
  }

  previewTarget(jobId: string, path: string): string {
    const job = this.required(jobId);
    if (job.status !== 'ready_for_preview' || !job.previewUrl) throw new Error('PREVIEW_NOT_READY');
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return `${job.previewUrl}${safePath}`;
  }

  private async run(job: CodeAgentJob, instruction: string): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.jobId, controller);
    const timeout = setTimeout(() => controller.abort(), this.env.CODE_AGENT_TIMEOUT_MS);
    try {
      this.event(job, 'preparing', 'Подготовка изолированной копии проекта.');
      await this.prepareWorktree(job.jobId);
      this.event(job, 'running', 'Codex изучает проект и вносит изменения.');
      const result = await this.provider.start({ worktreePath: this.worktree(job.jobId), prompt: buildPrompt(instruction), signal: controller.signal, onEvent: (message) => this.event(job, 'running', safeText(message)) });
      job.summary = safeText(result.summary);
      this.event(job, 'validating', 'Проверка изменений.');
      await this.collectDiff(job);
      job.checks = await this.runChecks(job.jobId);
      this.event(job, 'starting_preview', 'Запуск Preview из изолированной копии.');
      await this.startPreview(job);
      this.event(job, 'ready_for_preview', 'Готово к просмотру.');
      this.logger.info({ requestId: job.requestId, jobId: job.jobId, projectId: job.projectId, provider: job.provider, status: job.status }, 'code-agent job ready');
    } catch (error) {
      await this.stopPreview(job.jobId);
      const timedOut = controller.signal.aborted;
      this.event(job, timedOut ? 'timed_out' : 'failed', timedOut ? 'Задача превысила допустимое время.' : safeError(error));
      this.logger.error({ requestId: job.requestId, jobId: job.jobId, status: job.status, errorCode: timedOut ? 'TIMEOUT' : 'RUNTIME_FAILED' }, 'code-agent job failed');
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(job.jobId);
      await this.persist(job);
    }
  }

  private async prepareWorktree(jobId: string): Promise<void> {
    const status = (await git(PROJECT.repositoryPath, ['status', '--porcelain'])).stdout.trim();
    if (status) throw new Error('Production checkout содержит незакоммиченные изменения.');
    const branch = (await git(PROJECT.repositoryPath, ['branch', '--show-current'])).stdout.trim();
    if (branch !== PROJECT.defaultBranch) throw new Error('Production checkout находится не на разрешённой ветке.');
    await mkdir(join(this.env.CODE_AGENT_WORKTREE_ROOT, PROJECT.projectId), { recursive: true });
    await execFileAsync('git', ['-c', `safe.directory=${PROJECT.repositoryPath}`, '-C', PROJECT.repositoryPath, 'worktree', 'add', '--detach', this.worktree(jobId), 'HEAD'], { timeout: 60_000 });
    await execFileAsync('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], {
      cwd: this.worktree(jobId), timeout: 300_000, maxBuffer: this.env.CODE_AGENT_MAX_LOG_BYTES,
      env: { ...process.env, NODE_ENV: 'development', npm_config_production: 'false' },
    });
  }

  private async collectDiff(job: CodeAgentJob): Promise<void> {
    const root = this.worktree(job.jobId);
    const status = (await git(root, ['status', '--porcelain'])).stdout;
    const files = status.split('\n').filter(Boolean).map((line) => line.slice(3).trim());
    if (!files.length) throw new Error('Codex не создал изменений.');
    if (files.length > this.env.CODE_AGENT_MAX_CHANGED_FILES || files.some((file) => SECRET_PATH.test(file) || file.startsWith('../'))) throw new Error('Изменения нарушают ограничения проекта.');
    const tracked = (await git(root, ['diff', '--no-ext-diff', '--'])).stdout;
    const untrackedParts: string[] = [];
    for (const file of files.filter((name) => status.includes(`?? ${name}`))) {
      const full = resolve(root, file);
      if (!full.startsWith(`${root}${sep}`)) throw new Error('Недопустимый путь изменения.');
      const content = await readFile(full, 'utf8');
      untrackedParts.push(`--- /dev/null\n+++ b/${file}\n${content}`);
    }
    const diff = [tracked, ...untrackedParts].join('\n');
    if (Buffer.byteLength(diff) > this.env.CODE_AGENT_MAX_DIFF_BYTES) throw new Error('Diff превышает допустимый размер.');
    job.changedFiles = files; job.diff = diff;
  }

  private async runChecks(jobId: string): Promise<CodeAgentCheck[]> {
    const root = this.worktree(jobId);
    const results: CodeAgentCheck[] = [];
    for (const [name, script] of PROJECT.checks) {
      try {
        const output = await execFileAsync('npm', ['run', script], { cwd: root, timeout: 300_000, maxBuffer: this.env.CODE_AGENT_MAX_LOG_BYTES, env: { ...process.env, PATH: `${PROJECT.repositoryPath}/node_modules/.bin:${process.env.PATH ?? ''}` } });
        results.push({ name, ok: true, output: safeText(output.stdout + output.stderr).slice(-4000) });
      } catch (error) { results.push({ name, ok: false, output: safeError(error).slice(-4000) }); }
    }
    return results;
  }

  private async startPreview(job: CodeAgentJob): Promise<void> {
    const port = 4200 + [...this.jobs.keys()].indexOf(job.jobId) % 500;
    const child = spawn(join(this.worktree(job.jobId), 'node_modules/.bin/vite'), ['preview', '--config', 'vite.static.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: this.worktree(job.jobId), shell: false, detached: true, stdio: 'ignore' });
    child.unref(); this.previews.set(job.jobId, child); job.previewUrl = `http://127.0.0.1:${port}`;
    await waitForUrl(job.previewUrl, 20_000);
  }

  private stopPreview(jobId: string): Promise<void> { const child = this.previews.get(jobId); try { if (child?.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* exited */ } this.previews.delete(jobId); return Promise.resolve(); }
  private async removeWorktree(jobId: string): Promise<void> { const path = this.worktree(jobId); await execFileAsync('git', ['-c', `safe.directory=${PROJECT.repositoryPath}`, '-C', PROJECT.repositoryPath, 'worktree', 'remove', '--force', path], { timeout: 60_000 }).catch(() => rm(path, { recursive: true, force: true })); await git(PROJECT.repositoryPath, ['worktree', 'prune']); }
  private worktree(jobId: string) { return join(this.env.CODE_AGENT_WORKTREE_ROOT, PROJECT.projectId, jobId); }
  private required(jobId: string) { const job = this.jobs.get(jobId); if (!job) throw new Error('JOB_NOT_FOUND'); return job; }
  private event(job: CodeAgentJob, status: CodeAgentStatus, message: string) { job.status = status; job.updatedAt = new Date().toISOString(); job.events.push({ id: job.events.length + 1, at: job.updatedAt, status, message }); void this.persist(job); }
  private async persist(job: CodeAgentJob) { const directory = join(this.env.CODE_AGENT_WORKTREE_ROOT, '.jobs'); await mkdir(directory, { recursive: true }); await writeFile(join(directory, `${job.jobId}.json`), JSON.stringify(job), { mode: 0o600 }); }
}

function isTerminal(status: CodeAgentStatus) { return ['published', 'discarded', 'failed', 'timed_out', 'cancelled'].includes(status); }
async function git(cwd: string, args: string[]) { return execFileAsync('git', ['-c', `safe.directory=${cwd}`, '-C', cwd, ...args], { timeout: 60_000, maxBuffer: 4_000_000 }); }
function safeText(value: string) { return value.replace(/\/opt\/olnoo\/[A-Za-z0-9/_.-]+/g, '[workspace]').replace(/(?:sk|key|token|secret)[-_][A-Za-z0-9._-]{8,}/gi, '[redacted]'); }
function safeError(error: unknown) { const value = error as Error & { stdout?: string; stderr?: string }; return safeText(value?.stderr || value?.stdout || value?.message || 'Code Agent Runtime завершился ошибкой.'); }
function buildPrompt(instruction: string) { return `Ты работаешь в изолированном git worktree сайта a-istra. Выполни только пользовательскую задачу. Перед изменениями изучи AGENTS.md, README, docs и релевантный код. Можно изменять код только внутри worktree. Нельзя читать или менять .env и секреты, использовать sudo, systemctl, Docker, SSH, менять другие проекты, выполнять git commit/push, публиковать сайт или устанавливать глобальные пакеты. Не изменяй production. После изменения проверь diff и доступные проверки, исправь ошибки своей правки, выдай краткое резюме, изменённые файлы и проверки.\n\nПользовательская задача:\n${instruction}`; }
async function waitForUrl(url: string, timeoutMs: number) { const until = Date.now() + timeoutMs; while (Date.now() < until) { try { const response = await fetch(url); if (response.ok) return; } catch { /* retry */ } await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error('Preview не запустился вовремя.'); }
