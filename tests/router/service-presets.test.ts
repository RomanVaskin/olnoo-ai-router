import { describe, expect, it } from 'vitest';
import { SERVICE_PRESETS, resolveServicePreset } from '../../src/router/service-presets.js';
import { createProviderRegistry } from '../../src/providers/bootstrap.js';
import type { Env } from '../../src/config/env.js';

describe('service presets', () => {
  it('binds driveset + image to OpenAI gpt-image-1-mini at medium quality', () => {
    expect(resolveServicePreset('driveset', 'image')).toEqual({
      provider: 'openai',
      model: 'gpt-image-1-mini',
      quality: 'medium',
    });
  });

  it('pins Content Factory text to DeepSeek Flash without reasoning or fallback', () => {
    expect(resolveServicePreset('content-factory', 'text')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-flash',
      reasoningMode: 'off',
      allowFallback: false,
    });
  });

  it('pins independent Content Factory review to the dated OpenAI model', () => {
    expect(resolveServicePreset('content-factory', 'review')).toEqual({
      provider: 'openai',
      model: 'gpt-5.4-mini-2026-03-17',
      reasoningMode: 'medium',
      allowFallback: false,
    });
  });

  it('registers the review model without changing the OpenAI default model', () => {
    const registry = createProviderRegistry({
      OPENAI_API_KEY: 'test-key', OPENAI_DEFAULT_MODEL: 'gpt-5.4-mini',
      OPENAI_MODELS: ['gpt-5.4-mini'], PROVIDER_REQUEST_TIMEOUT_MS: 1_000,
    } as Env);
    expect(registry.get('openai')?.listModels().map((model) => model.id)).toEqual([
      'gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17',
    ]);
  });

  it('keeps image and text presets separate', () => {
    expect(Object.keys(SERVICE_PRESETS)).toEqual(['driveset.image', 'content-factory.text', 'content-factory.review']);
    expect(resolveServicePreset('content-factory', 'image')).toBeUndefined();
    expect(resolveServicePreset('driveset', 'text')).toBeUndefined();
  });

  it('returns undefined for unknown services and never resolves object prototype keys', () => {
    expect(resolveServicePreset('unknown', 'image')).toBeUndefined();
    expect(resolveServicePreset('unknown', 'text')).toBeUndefined();
    expect(resolveServicePreset('constructor', 'image')).toBeUndefined();
    expect(resolveServicePreset('__proto__', 'image')).toBeUndefined();
  });
});
