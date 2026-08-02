export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_QUOTA_EXHAUSTED'
  | 'PROVIDER_AUTHENTICATION_ERROR'
  | 'PROVIDER_BILLING_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_SAFETY_REJECTION'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'STRUCTURED_OUTPUT_VALIDATION_ERROR'
  | 'ALL_PROVIDERS_FAILED'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  MODEL_NOT_FOUND: 404,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_AUTH_FAILED: 502,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_QUOTA_EXHAUSTED: 429,
  PROVIDER_AUTHENTICATION_ERROR: 502,
  PROVIDER_BILLING_ERROR: 502,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_SAFETY_REJECTION: 422,
  PROVIDER_INVALID_RESPONSE: 502,
  INVALID_PROVIDER_RESPONSE: 502,
  STRUCTURED_OUTPUT_VALIDATION_ERROR: 502,
  ALL_PROVIDERS_FAILED: 503,
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
  readonly retryable: boolean;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.cause = options?.cause;
    this.retryable = options?.retryable ?? RETRYABLE_CODES.has(code);
  }
}

const RETRYABLE_CODES = new Set<AppErrorCode>([
  'RATE_LIMITED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'ALL_PROVIDERS_FAILED',
]);
