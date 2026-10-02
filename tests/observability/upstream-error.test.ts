import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { summarizeUpstreamError } from '../../src/observability/upstream-error.js';

describe('summarizeUpstreamError', () => {
  it('extracts status, type and message of an Anthropic 400 without headers or keys', () => {
    const error = new Anthropic.BadRequestError(
      400,
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: '`temperature` is deprecated for this model.',
        },
      },
      '400 invalid_request_error',
      new Headers({ 'x-api-key': 'sk-ant-SECRET', authorization: 'Bearer SECRET' }),
    );
    const summary = summarizeUpstreamError(error);
    expect(summary).toEqual({
      status: 400,
      type: 'invalid_request_error',
      message: '`temperature` is deprecated for this model.',
    });
    expect(JSON.stringify(summary)).not.toContain('SECRET');
  });

  it('caps the message length and ignores non-error values', () => {
    expect(
      summarizeUpstreamError({ status: 500, message: 'x'.repeat(1000) })?.message,
    ).toHaveLength(300);
    expect(summarizeUpstreamError(undefined)).toBeUndefined();
    expect(summarizeUpstreamError('text')).toBeUndefined();
    expect(summarizeUpstreamError({})).toBeUndefined();
  });
});
