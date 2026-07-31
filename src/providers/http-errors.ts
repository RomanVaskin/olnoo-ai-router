import { AppError } from '../errors/app-error.js';

export function mapProviderHttpError(provider: string, status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError('PROVIDER_AUTHENTICATION_ERROR', `${provider} authentication failed`);
  }
  if (status === 402) {
    return new AppError('PROVIDER_BILLING_ERROR', `${provider} billing is unavailable`);
  }
  if (status === 429) {
    return new AppError('PROVIDER_RATE_LIMITED', `${provider} rate limit exceeded`);
  }
  if (status >= 500) {
    return new AppError('PROVIDER_UNAVAILABLE', `${provider} is temporarily unavailable`);
  }
  return new AppError('VALIDATION_ERROR', `${provider} rejected the request`);
}

export function mapProviderNetworkError(provider: string, error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('PROVIDER_UNAVAILABLE', `${provider} network request failed`, {
    cause: error,
  });
}
