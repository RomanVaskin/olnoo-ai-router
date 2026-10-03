import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('OPENAI_IMAGE_QUALITY', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadEnvWith(value: string | undefined) {
    vi.resetModules();
    if (value === undefined) vi.stubEnv('OPENAI_IMAGE_QUALITY', '');
    else vi.stubEnv('OPENAI_IMAGE_QUALITY', value);
    if (value === undefined) delete process.env.OPENAI_IMAGE_QUALITY;
    return import('../../src/config/env.js');
  }

  it('defaults to medium and keeps the default image model', async () => {
    const { env: loaded } = await loadEnvWith(undefined);
    expect(loaded.OPENAI_IMAGE_QUALITY).toBe('medium');
    expect(loaded.OPENAI_IMAGE_MODEL).toBe('gpt-image-1-mini');
  });

  it.each(['low', 'medium', 'high', 'auto'])('accepts %s', async (value) => {
    const { env: loaded } = await loadEnvWith(value);
    expect(loaded.OPENAI_IMAGE_QUALITY).toBe(value);
  });

  it('rejects an unknown value at startup', async () => {
    await expect(loadEnvWith('ultra')).rejects.toThrow();
  });
});
