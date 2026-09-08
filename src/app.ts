import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from './config/env.js';
import { packageInfo } from './config/package-info.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { generateRequestId, REQUEST_ID_HEADER } from './middleware/request-id.js';
import { loggerOptions } from './observability/logger.js';
import { Metrics } from './observability/metrics.js';
import { createProviderRegistry } from './providers/bootstrap.js';
import type { ProviderRegistry } from './providers/provider.registry.js';
import { ModelRouter } from './router/model-router.js';
import { registerChatRoute } from './api/routes/chat.route.js';
import { registerHealthRoute } from './api/routes/health.route.js';
import { registerMetricsRoute } from './api/routes/metrics.route.js';
import { registerProvidersRoute } from './api/routes/providers.route.js';
import { registerGenerationRoutes } from './api/routes/generation.route.js';
import { registerGenerateRoute } from './api/routes/generate.route.js';
import { registerImageGenerateRoute } from './api/routes/image-generate.route.js';
import { registerCodeAgentRoutes } from './api/routes/code-agent.route.js';
import { CodeAgentRuntime } from './code-agent/runtime.js';
import { rateLimitPlugin } from './security/rate-limit.js';
import type { AppDependencies } from './api/dependencies.js';

export interface BuildAppOptions {
  /** Override the provider registry — used by tests to avoid real provider SDKs/network calls. */
  registry?: ProviderRegistry;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: generateRequestId,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.BODY_LIMIT_BYTES,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    return payload;
  });

  await app.register(sensible);

  await app.register(rateLimitPlugin, {
    max: env.RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OLNOO AI Router',
        description: 'The single entry point to every AI model used across the OLNOO platform.',
        version: packageInfo.version,
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'x-api-key', in: 'header' },
        },
      },
      tags: [
        { name: 'Chat', description: 'Unified chat completion endpoint' },
        { name: 'Generation', description: 'Multimodal image and structured generation endpoints' },
        { name: 'Operations', description: 'Health, discovery, and metrics endpoints' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  const metrics = new Metrics();
  app.addHook('onResponse', async (request, reply) => {
    metrics.httpRequestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        status_code: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });

  const registry = options.registry ?? createProviderRegistry(env);
  const router = new ModelRouter(registry);

  const deps: AppDependencies = {
    env,
    registry,
    router,
    metrics,
    startedAt: Date.now(),
    codeAgentRuntime: new CodeAgentRuntime(env, app.log),
  };

  registerHealthRoute(app, deps);
  registerMetricsRoute(app, deps);
  registerProvidersRoute(app, deps);
  registerChatRoute(app, deps);
  registerGenerationRoutes(app, deps);
  registerGenerateRoute(app, deps);
  registerImageGenerateRoute(app, deps);
  registerCodeAgentRoutes(app, deps);

  return app;
}
