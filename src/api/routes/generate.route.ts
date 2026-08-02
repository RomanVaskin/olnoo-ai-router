import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createBearerTokenGuard } from '../../security/bearer-token.guard.js';
import { errorResponseSchema } from '../../types/chat.js';
import {
  generateRequestSchema,
  generateResponseSchema,
  type GenerateResponse,
} from '../../types/generate.js';
import { GenerateRouter } from '../../router/generate-router.js';
import type { AppDependencies } from '../dependencies.js';

export function registerGenerateRoute(app: FastifyInstance, deps: AppDependencies): void {
  const router = new GenerateRouter(deps.registry, {
    anthropic: deps.env.ANTHROPIC_DEFAULT_MODEL,
    openai: deps.env.OPENAI_DEFAULT_MODEL,
    gemini: deps.env.GEMINI_DEFAULT_MODEL,
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/generate',
    preHandler: createBearerTokenGuard(deps.env.OLNOO_ROUTER_TOKEN),
    schema: {
      tags: ['Generation'],
      summary: 'Generate text using task-aware provider routing and bounded fallback',
      body: generateRequestSchema,
      response: {
        200: generateResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        422: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
        502: errorResponseSchema,
        503: errorResponseSchema,
        504: errorResponseSchema,
      },
    },
    handler: async (request) => {
      const startedAt = process.hrtime.bigint();
      const controller = new AbortController();
      const abortOnDisconnect = (): void => controller.abort();
      request.raw.once('close', abortOnDisconnect);

      try {
        const result = await router.generate(request.body, controller.signal);
        const latencyMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
        const requestId = request.body.metadata?.requestId ?? request.id;
        request.log.info(
          {
            requestId,
            application: request.body.metadata?.application ?? 'unknown',
            provider: result.provider,
            model: result.output.model,
            latencyMs,
            status: 'success',
            fallbackUsed: result.fallbackUsed,
          },
          'generate request completed',
        );
        const response: GenerateResponse = {
          id: requestId,
          requestId,
          provider: result.provider,
          model: result.output.model,
          content: result.output.content,
          usage: {
            inputTokens: result.output.usage.promptTokens,
            outputTokens: result.output.usage.completionTokens,
            totalTokens: result.output.usage.totalTokens,
          },
          latencyMs,
          fallbackUsed: result.fallbackUsed,
          ...(result.output.providerRequestId
            ? { providerRequestId: result.output.providerRequestId }
            : {}),
        };
        return response;
      } catch (error) {
        request.log.warn(
          {
            requestId: request.body.metadata?.requestId ?? request.id,
            application: request.body.metadata?.application ?? 'unknown',
            provider: request.body.provider,
            model: request.body.model ?? 'default',
            latencyMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
            status: 'error',
            fallbackUsed: false,
          },
          'generate request failed',
        );
        throw error;
      } finally {
        request.raw.off('close', abortOnDisconnect);
      }
    },
  });
}
