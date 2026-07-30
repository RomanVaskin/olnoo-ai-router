import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { chatRequestSchema, chatResponseSchema, errorResponseSchema } from '../../types/chat.js';
import type { ChatResponse } from '../../types/chat.js';
import { createApiKeyGuard } from '../../security/api-key.guard.js';
import type { AppDependencies } from '../dependencies.js';

export function registerChatRoute(app: FastifyInstance, deps: AppDependencies): void {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/api/chat',
    preHandler: createApiKeyGuard(deps.env.API_KEYS),
    schema: {
      tags: ['Chat'],
      summary: 'Send a chat completion request through the router to an AI provider',
      security: [{ apiKey: [] }],
      body: chatRequestSchema,
      response: {
        200: chatResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
        502: errorResponseSchema,
        504: errorResponseSchema,
      },
    },
    handler: async (request, _reply) => {
      const body = request.body;
      const startedAt = process.hrtime.bigint();
      let providerName: string | undefined;

      try {
        const provider = deps.router.resolve({
          ...(body.provider !== undefined ? { provider: body.provider } : {}),
          model: body.model,
        });
        providerName = provider.name;

        const controller = new AbortController();
        const abortOnDisconnect = (): void => controller.abort();
        request.raw.once('close', abortOnDisconnect);

        const output = await provider
          .chat(
            {
              model: body.model,
              messages: body.messages,
              ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
              ...(body.maxOutputTokens !== undefined
                ? { maxOutputTokens: body.maxOutputTokens }
                : {}),
              ...(body.topP !== undefined ? { topP: body.topP } : {}),
            },
            { signal: controller.signal },
          )
          .finally(() => request.raw.off('close', abortOnDisconnect));

        const latencyMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

        deps.metrics.chatRequestsTotal.inc({
          provider: provider.name,
          model: body.model,
          status: 'success',
        });
        deps.metrics.chatRequestDuration.observe(
          { provider: provider.name, model: body.model, status: 'success' },
          latencyMs / 1000,
        );
        request.log.info(
          { provider: provider.name, model: body.model, latencyMs, status: 'success' },
          'chat request completed',
        );

        const response: ChatResponse = {
          requestId: request.id,
          provider: provider.name,
          model: output.model,
          content: output.content,
          finishReason: output.finishReason,
          usage: output.usage,
          latencyMs,
          createdAt: new Date().toISOString(),
        };
        return response;
      } catch (error) {
        const latencyMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
        const labels = { provider: providerName ?? 'unknown', model: body.model, status: 'error' };
        deps.metrics.chatRequestsTotal.inc(labels);
        deps.metrics.chatRequestDuration.observe(labels, latencyMs / 1000);
        request.log.warn({ ...labels, latencyMs }, 'chat request failed');
        throw error;
      }
    },
  });
}
