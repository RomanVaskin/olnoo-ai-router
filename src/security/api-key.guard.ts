import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';

const API_KEY_HEADER = 'x-api-key';

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Builds a Fastify preHandler that authenticates callers against the
 * configured API keys. Scoped to individual routes/plugins rather than
 * applied globally, so operational endpoints (health, metrics) stay
 * reachable by infrastructure without a key.
 */
export function createApiKeyGuard(allowedKeys: readonly string[]) {
  // Fastify identifies a 2-argument hook as promise-returning; it must stay
  // `async` (even with no internal `await`) or the request hangs forever.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async function apiKeyGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers[API_KEY_HEADER];
    const providedKey = Array.isArray(header) ? header[0] : header;

    if (!providedKey) {
      throw new AppError('UNAUTHORIZED', `Missing "${API_KEY_HEADER}" header`);
    }

    const isValid = allowedKeys.some((key) => safeEqual(key, providedKey));
    if (!isValid) {
      throw new AppError('UNAUTHORIZED', 'Invalid API key');
    }
  };
}
