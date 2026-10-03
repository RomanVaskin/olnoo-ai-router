import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createBearerTokenGuard } from '../../security/bearer-token.guard.js';
import { errorResponseSchema } from '../../types/chat.js';
import {
  imageGenerateRequestSchema,
  imageGenerateResponseSchema,
  type ImageGenerateResponse,
} from '../../types/image-generate.js';
import { AppError } from '../../errors/app-error.js';
import { OpenAIProvider } from '../../providers/openai/openai.provider.js';
import { resolveServicePreset } from '../../router/service-presets.js';
import type { AppDependencies } from '../dependencies.js';

export function registerImageGenerateRoute(app: FastifyInstance, deps: AppDependencies): void {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/images/generate',
    preHandler: createBearerTokenGuard(deps.env.OLNOO_ROUTER_TOKEN),
    schema: {
      tags: ['Generation'],
      summary: 'Generate a single image from a text prompt via the OpenAI provider',
      body: imageGenerateRequestSchema,
      response: {
        200: imageGenerateResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
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
      const body = request.body;
      // With `service` the provider/model/quality come from the fixed preset; the client cannot choose them.
      const preset = body.service ? resolveServicePreset(body.service, 'image') : undefined;
      if (body.service && !preset) {
        throw new AppError(
          'VALIDATION_ERROR',
          `No image preset is configured for service "${body.service}"`,
        );
      }
      const provider = deps.registry.get(preset?.provider ?? 'openai');
      if (!(provider instanceof OpenAIProvider)) {
        throw new AppError('PROVIDER_NOT_CONFIGURED', 'OpenAI provider is not configured');
      }

      const controller = new AbortController();
      const abortOnDisconnect = (): void => controller.abort();
      request.raw.once('close', abortOnDisconnect);

      try {
        const output = await provider.generateImageFromPrompt(
          {
            prompt: body.prompt,
            ...(body.size ? { size: body.size } : {}),
            ...(preset ? { model: preset.model, quality: preset.quality } : {}),
          },
          { signal: controller.signal },
        );
        const latencyMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
        request.log.info(
          {
            service: body.service,
            provider: provider.name,
            model: output.model,
            latencyMs,
            status: 'success',
          },
          'text-to-image request completed',
        );
        const response: ImageGenerateResponse = {
          requestId: request.id,
          provider: provider.name,
          model: output.model,
          imageBase64: output.imageBase64,
          mimeType: output.mimeType,
          latencyMs,
          createdAt: new Date().toISOString(),
        };
        return response;
      } catch (error) {
        const latencyMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
        request.log.warn(
          { service: body.service, provider: provider.name, latencyMs, status: 'error' },
          'text-to-image request failed',
        );
        throw error;
      } finally {
        request.raw.off('close', abortOnDisconnect);
      }
    },
  });
}
