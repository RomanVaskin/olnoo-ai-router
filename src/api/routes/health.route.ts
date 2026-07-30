import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { packageInfo } from '../../config/package-info.js';
import type { AppDependencies } from '../dependencies.js';

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export function registerHealthRoute(app: FastifyInstance, deps: AppDependencies): void {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/health',
    schema: {
      tags: ['Operations'],
      summary: 'Liveness and readiness probe',
      response: { 200: healthResponseSchema },
    },
    handler: () => ({
      status: 'ok' as const,
      service: packageInfo.name,
      version: packageInfo.version,
      uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }),
  });
}
