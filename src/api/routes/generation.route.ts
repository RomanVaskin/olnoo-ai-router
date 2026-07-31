import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createApiKeyGuard } from '../../security/api-key.guard.js';
import { errorResponseSchema } from '../../types/chat.js';
import {
  imageGenerationRequestSchema,
  imageGenerationResponseSchema,
  structuredGenerationRequestSchema,
  structuredGenerationResponseSchema,
  type ImageGenerationResponse,
  type StructuredGenerationResponse,
} from '../../types/generation.js';
import type { AIProvider } from '../../providers/provider.interface.js';
import type { AppDependencies } from '../dependencies.js';
import { StructuredRouter } from '../../router/structured-router.js';
import { RoutingPolicy } from '../../router/routing-policy.js';

export function registerGenerationRoutes(app: FastifyInstance, deps: AppDependencies): void {
  const structuredRouter = new StructuredRouter(
    deps.registry,
    {
      gemini: deps.env.GEMINI_DEFAULT_MODEL,
      openai: deps.env.OPENAI_DEFAULT_MODEL,
      anthropic: deps.env.ANTHROPIC_DEFAULT_MODEL,
    },
    new RoutingPolicy(deps.env.AI_DEFAULT_PROVIDER),
    deps.env.AI_FALLBACK_ENABLED,
  );
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/api/images/generate',
    preHandler: createApiKeyGuard(deps.env.API_KEYS),
    schema: {
      tags: ['Generation'],
      summary: 'Generate an image from a prompt and inline source images',
      security: [{ apiKey: [] }],
      body: imageGenerationRequestSchema,
      response: responseSchemas(imageGenerationResponseSchema),
    },
    handler: async (request) =>
      runProviderRequest(request, request.body, deps, async (provider, signal, startedAt) => {
        const body = request.body;
        const output = await provider.generateImage(
          { model: body.model, prompt: body.prompt, images: body.images },
          { signal },
        );
        const response: ImageGenerationResponse = {
          requestId: request.id,
          provider: provider.name,
          model: output.model,
          imageBase64: output.imageBase64,
          mimeType: output.mimeType,
          warnings: output.warnings,
          latencyMs: elapsedMs(startedAt),
          createdAt: new Date().toISOString(),
        };
        return response;
      }),
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/api/structured',
    preHandler: createApiKeyGuard(deps.env.API_KEYS),
    schema: {
      tags: ['Generation'],
      summary: 'Generate schema-constrained JSON from a prompt and inline source images',
      security: [{ apiKey: [] }],
      body: structuredGenerationRequestSchema,
      response: responseSchemas(structuredGenerationResponseSchema),
    },
    handler: async (request) => {
      const startedAt = process.hrtime.bigint();
      const controller = new AbortController();
      const abortOnDisconnect = (): void => controller.abort();
      request.raw.once('close', abortOnDisconnect);
      try {
        const result = await structuredRouter.generate(request.body, controller.signal);
        const output = result.output;
        const response: StructuredGenerationResponse = {
          requestId: request.id,
          provider: result.provider,
          model: output.model,
          content: output.content,
          output: result.parsed,
          usage: {
            inputTokens: output.usage.promptTokens,
            outputTokens: output.usage.completionTokens,
            totalTokens: output.usage.totalTokens,
          },
          finishReason: output.finishReason,
          fallback: { used: result.attempts.length > 1, attempts: result.attempts },
          latencyMs: elapsedMs(startedAt),
          createdAt: new Date().toISOString(),
        };
        request.log.info(
          {
            module: request.body.metadata?.module,
            projectId: request.body.metadata?.projectId,
            provider: result.provider,
            model: output.model,
            taskType: request.body.taskType ?? 'general',
            duration: response.latencyMs,
            status: 'success',
            inputTokens: output.usage.promptTokens,
            outputTokens: output.usage.completionTokens,
            fallbackAttempts: result.attempts.length,
            providerRequestId: output.providerRequestId,
          },
          'structured generation completed',
        );
        return response;
      } finally {
        request.raw.off('close', abortOnDisconnect);
      }
    },
  });
}

function responseSchemas(
  successSchema: typeof imageGenerationResponseSchema | typeof structuredGenerationResponseSchema,
) {
  return {
    200: successSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
    422: errorResponseSchema,
    429: errorResponseSchema,
    500: errorResponseSchema,
    502: errorResponseSchema,
    503: errorResponseSchema,
    504: errorResponseSchema,
  };
}

interface GenerationRequestContext {
  id: string;
  raw: IncomingMessage;
  log: FastifyBaseLogger;
}

async function runProviderRequest<TResult>(
  request: GenerationRequestContext,
  body: { provider?: string | undefined; model: string },
  deps: AppDependencies,
  run: (provider: AIProvider, signal: AbortSignal, startedAt: bigint) => Promise<TResult>,
): Promise<TResult> {
  const startedAt = process.hrtime.bigint();
  const provider = deps.router.resolve({
    ...(body.provider ? { provider: body.provider } : {}),
    model: body.model,
  });
  const controller = new AbortController();
  const abortOnDisconnect = (): void => controller.abort();
  request.raw.once('close', abortOnDisconnect);
  try {
    const result = await run(provider, controller.signal, startedAt);
    request.log.info(
      {
        provider: provider.name,
        model: body.model,
        latencyMs: elapsedMs(startedAt),
        status: 'success',
      },
      'generation request completed',
    );
    return result;
  } catch (error) {
    request.log.warn(
      {
        provider: provider.name,
        model: body.model,
        latencyMs: elapsedMs(startedAt),
        status: 'error',
      },
      'generation request failed',
    );
    throw error;
  } finally {
    request.raw.off('close', abortOnDisconnect);
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}
