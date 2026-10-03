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

  it('has exactly the one first-stage production preset', () => {
    expect(Object.keys(SERVICE_PRESETS)).toEqual(['driveset.image']);
  });

  it('returns undefined for unknown services and never resolves object prototype keys', () => {
    expect(resolveServicePreset('unknown', 'image')).toBeUndefined();
    expect(resolveServicePreset('constructor', 'image')).toBeUndefined();
    expect(resolveServicePreset('__proto__', 'image')).toBeUndefined();
  });
});
