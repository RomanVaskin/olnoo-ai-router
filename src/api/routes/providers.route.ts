import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createApiKeyGuard } from '../../security/api-key.guard.js';
import type { AppDependencies } from '../dependencies.js';

const modelInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  contextWindow: z.number().int().positive().optional(),
});

const providersResponseSchema = z.object({
  providers: z.array(
    z.object({
      name: z.string(),
      models: z.array(modelInfoSchema),
    }),
  ),
});

export function registerProvidersRoute(app: FastifyInstance, deps: AppDependencies): void {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/providers',
    preHandler: createApiKeyGuard(deps.env.API_KEYS),
    schema: {
      tags: ['Operations'],
      summary: 'List registered AI providers and the models they serve',
      security: [{ apiKey: [] }],
      response: { 200: providersResponseSchema },
    },
    handler: () => ({
      providers: deps.registry.list().map((provider) => ({
        name: provider.name,
        models: provider.listModels(),
      })),
    }),
  });
}
