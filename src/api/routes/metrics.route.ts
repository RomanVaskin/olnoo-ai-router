import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../dependencies.js';

/**
 * Prometheus exposition endpoint. Left unauthenticated by default, matching
 * standard scrape-target practice — access is expected to be restricted at
 * the network layer, not the application layer. Revisit if this router is
 * ever exposed directly to the public internet.
 */
export function registerMetricsRoute(app: FastifyInstance, deps: AppDependencies): void {
  app.route({
    method: 'GET',
    url: '/metrics',
    handler: async (_request, reply) => {
      const body = await deps.metrics.registry.metrics();
      reply.header('content-type', deps.metrics.registry.contentType).send(body);
    },
  });
}
