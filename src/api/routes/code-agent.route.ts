import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createApiKeyGuard } from '../../security/api-key.guard.js';
import type { AppDependencies } from '../dependencies.js';
import type { CodeAgentJob } from '../../code-agent/types.js';

const requestSchema = z.object({ taskType: z.literal('code_edit'), projectId: z.literal('a-istra'), instruction: z.string().min(1).max(32_000), attachments: z.array(z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/)).max(10).default([]), provider: z.enum(['auto', 'codex']).default('auto'), mode: z.literal('preview_only'), requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/) });

export function registerCodeAgentRoutes(app: FastifyInstance, deps: AppDependencies): void {
  const guard = createApiKeyGuard(deps.env.API_KEYS);
  app.withTypeProvider<ZodTypeProvider>().post('/api/code-agent/jobs', { preHandler: guard, schema: { body: requestSchema } }, async (request, reply) => {
    try { const job = await deps.codeAgentRuntime.create(request.body); return reply.code(202).send({ jobId: job.jobId, status: job.status, provider: job.provider }); }
    catch (error) { return safeFailure(reply, error); }
  });
  app.get<{ Params: { jobId: string } }>('/api/code-agent/jobs/:jobId', { preHandler: guard }, async (request, reply) => { const job = deps.codeAgentRuntime.get(request.params.jobId); return job ? reply.send(publicJob(job)) : reply.code(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Задача не найдена.', requestId: request.id } }); });
  app.get<{ Params: { jobId: string } }>('/api/code-agent/jobs/:jobId/events', { preHandler: guard }, async (request, reply) => { const job = deps.codeAgentRuntime.get(request.params.jobId); return job ? reply.send({ events: job.events }) : reply.code(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Задача не найдена.', requestId: request.id } }); });
  app.post<{ Params: { jobId: string } }>('/api/code-agent/jobs/:jobId/discard', { preHandler: guard }, async (request, reply) => { try { return reply.send(publicJob(await deps.codeAgentRuntime.discard(request.params.jobId))); } catch (error) { return safeFailure(reply, error); } });
  app.post<{ Params: { jobId: string } }>('/api/code-agent/jobs/:jobId/publish', { preHandler: guard }, async (request, reply) => { try { return reply.send(publicJob(await deps.codeAgentRuntime.publish(request.params.jobId))); } catch (error) { return safeFailure(reply, error); } });
  app.get<{ Params: { jobId: string; '*': string } }>('/api/code-agent/jobs/:jobId/preview/*', { preHandler: guard }, async (request, reply) => {
    try { const response = await fetch(deps.codeAgentRuntime.previewTarget(request.params.jobId, request.params['*'])); const contentType = response.headers.get('content-type'); if (contentType) reply.header('content-type', contentType); let body = Buffer.from(await response.arrayBuffer()); if (contentType?.includes('text/html')) { const prefix = `/api/code-agent/jobs/${request.params.jobId}/preview`; body = Buffer.from(body.toString('utf8').replaceAll('src="/', `src="${prefix}/`).replaceAll('href="/', `href="${prefix}/`)); } return reply.send(body); }
    catch (error) { return safeFailure(reply, error); }
  });
}

function publicJob(job: CodeAgentJob) { const { previewUrl: _internal, attachments: _attachments, ...safe } = job; return { ...safe, previewUrl: job.previewUrl ? `/api/code-agent/jobs/${job.jobId}/preview/` : undefined }; }
function safeFailure(reply: FastifyReply, error: unknown) { const code = error instanceof Error ? error.message : 'RUNTIME_FAILED'; const status = code === 'PROJECT_BUSY' ? 409 : code === 'JOB_NOT_FOUND' ? 404 : code === 'CODE_AGENT_DISABLED' ? 503 : 400; const message = code === 'PROJECT_BUSY' ? 'Для проекта уже выполняется задача.' : code === 'CODE_AGENT_DISABLED' ? 'Свободное редактирование временно недоступно.' : code === 'PROJECT_NOT_ALLOWED' ? 'Проект не разрешён.' : code === 'JOB_NOT_FOUND' ? 'Задача не найдена.' : 'Code Agent Runtime отклонил запрос.'; return reply.code(status).send({ error: { code, message } }); }
