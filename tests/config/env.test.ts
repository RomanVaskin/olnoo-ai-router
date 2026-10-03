import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';

describe('OPENAI_MODELS', () => {
  it('defaults to an allow-list with gpt-5.4-mini and gpt-5.4-nano, parsed from a comma-separated string', () => {
    expect(Array.isArray(env.OPENAI_MODELS)).toBe(true);
    expect(env.OPENAI_MODELS).toEqual(expect.arrayContaining(['gpt-5.4-mini', 'gpt-5.4-nano']));
  });

  it('keeps OPENAI_DEFAULT_MODEL (automatic routing default) separate from the allow-list', () => {
    expect(env.OPENAI_DEFAULT_MODEL).toBe('gpt-5.4-mini');
  });
});
