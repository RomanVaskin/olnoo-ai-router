import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from '../../src/observability/logger.js';

describe('logger redaction', () => {
  it('does not emit authorization, API keys, prompts, or model content', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino({ ...loggerOptions, level: 'info' }, destination);
    logger.info({
      req: {
        headers: { authorization: 'Bearer router-secret', 'x-api-key': 'provider-secret' },
        body: { messages: [{ content: 'private prompt' }], prompt: 'private prompt' },
      },
      res: { body: { content: 'private response' } },
    });
    expect(output).not.toContain('router-secret');
    expect(output).not.toContain('provider-secret');
    expect(output).not.toContain('private prompt');
    expect(output).not.toContain('private response');
  });
});
