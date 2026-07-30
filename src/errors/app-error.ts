export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  MODEL_NOT_FOUND: 404,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
  NOT_FOUND: 404,
};

/**
 * Application-level error with a stable machine-readable code and a message
 * that is always safe to return to a caller. Raw upstream provider errors
 * (which may contain provider-internal details) must be wrapped into this
 * type before crossing the API boundary — never forwarded as-is.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  override readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.cause = options?.cause;
  }
}
