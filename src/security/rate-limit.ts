import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';

const UNAUTHENTICATED_ROUTES = new Set(['/health', '/metrics']);

export interface RateLimitPluginOptions {
  max: number;
  windowMs: number;
}

/**
 * Rate-limits per caller identity (API key) rather than per IP, since this
 * router sits behind other OLNOO services that may share an outbound IP.
 * Falls back to IP only for requests that have no key yet (they will be
 * rejected by the API key guard regardless). Client IP resolution respects
 * Fastify's global `trustProxy` setting.
 */
export const rateLimitPlugin = fp(
  async function rateLimitPluginImpl(app: FastifyInstance, options: RateLimitPluginOptions) {
    await app.register(rateLimit, {
      max: options.max,
      timeWindow: options.windowMs,
      allowList: (request: FastifyRequest) =>
        UNAUTHENTICATED_ROUTES.has(request.url.split('?')[0] ?? ''),
      keyGenerator: (request: FastifyRequest) => {
        const header = request.headers['x-api-key'];
        const apiKey = Array.isArray(header) ? header[0] : header;
        return apiKey ?? request.ip;
      },
      errorResponseBuilder: (request) => {
        const error = new AppError('RATE_LIMITED', 'Too many requests, please slow down');
        return {
          error: { code: error.code, message: error.message, requestId: request.id },
        };
      },
    });
  },
  { name: 'olnoo-rate-limit' },
);
