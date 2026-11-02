import { describe, expect, it } from 'vitest';
import { SERVICE_PRESETS, resolveServicePreset } from '../../src/router/service-presets.js';

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

  it('keeps image and text presets separate', () => {
    expect(Object.keys(SERVICE_PRESETS)).toEqual(['driveset.image', 'content-factory.text']);
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
