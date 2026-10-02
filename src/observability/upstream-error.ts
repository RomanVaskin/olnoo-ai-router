const MAX_MESSAGE_LENGTH = 300;

export interface UpstreamErrorSummary {
  status?: number;
  type?: string;
  message?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Reduces a raw provider SDK error to three safe fields for logs: HTTP status, error type and the
 * provider's own error message (length-capped). Never reads headers, request options or the client
 * config, so API keys cannot end up in the result.
 */
export function summarizeUpstreamError(cause: unknown): UpstreamErrorSummary | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const err = cause as { status?: unknown; error?: unknown; type?: unknown; message?: unknown };
  // Anthropic SDK: `error` is the parsed body `{ type: 'error', error: { type, message } }`.
  const body =
    typeof err.error === 'object' && err.error !== null
      ? (err.error as Record<string, unknown>)
      : {};
  const inner =
    typeof body.error === 'object' && body.error !== null
      ? (body.error as Record<string, unknown>)
      : body;
  const status = typeof err.status === 'number' ? err.status : undefined;
  const type = str(inner.type) ?? str(err.type);
  const message = str(inner.message) ?? str(err.message);
  if (status === undefined && !type && !message) return undefined;
  return {
    ...(status !== undefined ? { status } : {}),
    ...(type ? { type } : {}),
    ...(message ? { message: message.slice(0, MAX_MESSAGE_LENGTH) } : {}),
  };
}
