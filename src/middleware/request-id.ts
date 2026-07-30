import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_INBOUND_ID_LENGTH = 128;

/**
 * Reuses a caller-supplied x-request-id (for cross-service trace
 * correlation) when present and well-formed, otherwise mints a fresh one.
 * Used as Fastify's `genReqId` option, which is called with the raw Node
 * request — not the wrapped FastifyRequest.
 */
export function generateRequestId(request: IncomingMessage): string {
  const inbound = request.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(inbound) ? inbound[0] : inbound;

  if (value && value.length > 0 && value.length <= MAX_INBOUND_ID_LENGTH) {
    return value;
  }

  return randomUUID();
}

export { REQUEST_ID_HEADER };
