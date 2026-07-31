import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CodeAgentProvider } from './types.js';

export class CodexCodeAgentProvider implements CodeAgentProvider {
  private readonly runs = new Map<string, ChildProcessWithoutNullStreams>();
  constructor(private readonly maxLogBytes: number) {}

  async start(input: { worktreePath: string; prompt: string; signal: AbortSignal; onEvent: (message: string) => void }): Promise<{ summary: string }> {
    const args = ['exec', '--sandbox', 'workspace-write', '--cd', input.worktreePath, '--json', '--ephemeral', '-'];
    const child = spawn('/usr/bin/codex', args, { cwd: input.worktreePath, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const runId = String(child.pid ?? Date.now());
    this.runs.set(runId, child);
    let stdout = '';
    let stderr = '';
    const append = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(-this.maxLogBytes);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
          if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) input.onEvent(event.item.text.slice(0, 500));
        } catch { /* incomplete JSONL chunk; retained in bounded stdout */ }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const abort = () => { try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* exited */ } };
    input.signal.addEventListener('abort', abort, { once: true });
    child.stdin.end(input.prompt);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }).finally(() => {
      input.signal.removeEventListener('abort', abort);
      this.runs.delete(runId);
    });
    if (input.signal.aborted) throw new Error('CODE_AGENT_CANCELLED');
    if (code !== 0) throw new Error(`Codex завершился с кодом ${code}: ${redact(stderr).slice(-2000)}`);
    return { summary: lastAgentMessage(stdout) ?? 'Codex выполнил задачу.' };
  }

  cancel(runId: string): Promise<void> {
    const child = this.runs.get(runId);
    try { if (child?.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* exited */ }
    return Promise.resolve();
  }
}

function lastAgentMessage(stdout: string): string | undefined {
  let result: string | undefined;
  for (const line of stdout.split('\n')) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) result = event.item.text;
    } catch { /* ignore partial/non-JSON output */ }
  }
  return result?.slice(0, 4000);
}

function redact(value: string): string {
  return value.replace(/(?:sk|key|token|secret)[-_][A-Za-z0-9._-]{8,}/gi, '[redacted]').replace(/\/opt\/olnoo\/[A-Za-z0-9/_.-]+/g, '[workspace]');
}
