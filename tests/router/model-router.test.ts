import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/app-error.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { ModelRouter } from '../../src/router/model-router.js';
import { FakeProvider } from '../fakes/fake-provider.js';

function buildRouter() {
  const registry = new ProviderRegistry();
  const gemini = new FakeProvider({
    name: 'gemini',
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }],
  });
  registry.register(gemini);
  return { registry, router: new ModelRouter(registry), gemini };
}

describe('ProviderRegistry', () => {
  it('rejects registering the same provider name twice', () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider({ name: 'gemini' }));
    expect(() => registry.register(new FakeProvider({ name: 'gemini' }))).toThrow();
  });

  it('finds a provider by supported model', () => {
    const { registry, gemini } = buildRouter();
    expect(registry.findByModel('gemini-2.5-flash')).toBe(gemini);
    expect(registry.findByModel('unknown-model')).toBeUndefined();
  });
});

describe('ModelRouter', () => {
  it('resolves a model without an explicit provider', () => {
    const { router, gemini } = buildRouter();
    expect(router.resolve({ model: 'gemini-2.5-flash' })).toBe(gemini);
  });

  it('resolves a model with an explicit, matching provider', () => {
    const { router, gemini } = buildRouter();
    expect(router.resolve({ provider: 'gemini', model: 'gemini-2.5-flash' })).toBe(gemini);
  });

  it('throws MODEL_NOT_FOUND for an unknown provider', () => {
    const { router } = buildRouter();
    expect(() => router.resolve({ provider: 'nope', model: 'gemini-2.5-flash' })).toThrow(AppError);
  });

  it('throws MODEL_NOT_FOUND when the provider does not support the model', () => {
    const { router } = buildRouter();
    expect(() => router.resolve({ provider: 'gemini', model: 'unsupported' })).toThrow(AppError);
  });

  it('throws MODEL_NOT_FOUND when no provider serves the model', () => {
    const { router } = buildRouter();
    expect.assertions(3);
    try {
      router.resolve({ model: 'unsupported' });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('MODEL_NOT_FOUND');
      expect((error as AppError).statusCode).toBe(404);
    }
  });
});
