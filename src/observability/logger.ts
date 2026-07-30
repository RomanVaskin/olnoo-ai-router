import type { LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * Base pino configuration shared by the Fastify logger.
 *
 * Redaction is defensive: routes must never log message content in the
 * first place, but this ensures a future mistake cannot leak user prompts
 * or completions into logs or log-shipping pipelines.
 */
export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: env.SERVICE_NAME },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      '*.messages',
      '*.content',
      '*.prompt',
      '*.images',
      '*.data',
      '*.imageBase64',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
    : {}),
};
