import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';

export function createBearerTokenGuard(expectedToken: string) {
  // Fastify treats a two-argument async hook as promise-returning.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async function bearerTokenGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const authorization = request.headers.authorization;
    const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expected = Buffer.from(expectedToken);
    const actual = Buffer.from(provided);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid bearer token');
    }
  };
}
