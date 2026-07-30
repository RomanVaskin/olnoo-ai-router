import { describe, expect, it } from 'vitest';
import { withTimeout } from '../../src/providers/with-timeout.js';

describe('withTimeout', () => {
  it('returns a provider timeout error when the deadline aborts the request', async () => {
    const result = withTimeout(
      (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      5,
      'test-provider',
    );

    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      statusCode: 504,
    });
  });

  it('preserves provider errors raised before the deadline', async () => {
    const providerError = new Error('provider failed');

    await expect(
      withTimeout(async () => Promise.reject(providerError), 100, 'test-provider'),
    ).rejects.toBe(providerError);
  });
});
