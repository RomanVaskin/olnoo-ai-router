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

export function registerGenerationRoutes(app: FastifyInstance, deps: AppDependencies): void {
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
    handler: async (request) =>
      runProviderRequest(request, request.body, deps, async (provider, signal, startedAt) => {
        const body = request.body;
        const output = await provider.generateStructured(
          {
            model: body.model,
            prompt: body.prompt,
            images: body.images,
            jsonSchema: body.jsonSchema,
            ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
          },
          { signal },
        );
        const response: StructuredGenerationResponse = {
          requestId: request.id,
          provider: provider.name,
          model: output.model,
          content: output.content,
          latencyMs: elapsedMs(startedAt),
          createdAt: new Date().toISOString(),
        };
        return response;
      }),
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
