import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { ErrorResponse } from '../types/chat.js';

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError('VALIDATION_ERROR', 'Request failed schema validation', { cause: error });
  }

  // fastify-type-provider-zod / fastify's own schema validation errors carry
  // a `validation` array and a 4xx statusCode; treat those as client errors too.
  if (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    'statusCode' in error
  ) {
    return new AppError('VALIDATION_ERROR', 'Request failed schema validation', { cause: error });
  }

  return new AppError('INTERNAL_ERROR', 'Internal server error', { cause: error });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const appError = toAppError(error);

    if (appError.code === 'INTERNAL_ERROR' || appError.code === 'PROVIDER_ERROR') {
      request.log.error({ err: appError.cause ?? appError, code: appError.code }, appError.message);
    } else {
      request.log.warn({ code: appError.code }, appError.message);
    }

    const body: ErrorResponse = {
      error: {
        code: appError.code,
        message: appError.message,
        requestId: request.id,
        retryable: appError.retryable,
      },
    };

    reply.status(appError.statusCode).send(body);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const body: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    };
    reply.status(404).send(body);
  });
}
