import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/app-error.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { RoutingPolicy } from '../../src/router/routing-policy.js';
import { StructuredRouter } from '../../src/router/structured-router.js';
import type { StructuredGenerationRequest } from '../../src/types/generation.js';
import { FakeProvider } from '../fakes/fake-provider.js';

const MODELS = {
  gemini: 'gemini-model',
  openai: 'openai-model',
  anthropic: 'anthropic-model',
} as const;

const REQUEST: StructuredGenerationRequest = {
  provider: 'auto',
  prompt: 'Return a result',
  images: [],
  jsonSchema: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  },
  expectedFormat: 'json',
};

function provider(name: keyof typeof MODELS, implementation?: () => Promise<never>) {
  return new FakeProvider({
    name,
    models: [{ id: MODELS[name], label: name }],
    ...(implementation ? { structuredImpl: implementation } : {}),
  });
}

describe('StructuredRouter', () => {
  it('uses the configured default provider for general auto requests', async () => {
    const registry = new ProviderRegistry();
    registry.register(provider('openai'));
    const router = new StructuredRouter(registry, MODELS, new RoutingPolicy('openai'));

    const result = await router.generate(REQUEST, new AbortController().signal);

    expect(result.provider).toBe('openai');
    expect(result.parsed).toEqual({ ok: true });
    expect(result.attempts).toEqual([{ provider: 'openai' }]);
  });

  it('falls back after a retryable provider failure', async () => {
    const registry = new ProviderRegistry();
    const geminiCall = vi.fn(() => Promise.reject(new AppError('PROVIDER_TIMEOUT', 'timed out')));
    registry.register(provider('gemini', geminiCall));
    registry.register(provider('openai'));
    const router = new StructuredRouter(registry, MODELS);

    const result = await router.generate(REQUEST, new AbortController().signal);

    expect(geminiCall).toHaveBeenCalledOnce();
    expect(result.provider).toBe('openai');
    expect(result.attempts).toEqual([
      { provider: 'gemini', errorCode: 'PROVIDER_TIMEOUT' },
      { provider: 'openai' },
    ]);
  });

  it('does not fall back after a non-retryable failure', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      provider('gemini', () =>
        Promise.reject(new AppError('PROVIDER_SAFETY_REJECTION', 'refused')),
      ),
    );
    registry.register(provider('openai'));
    const router = new StructuredRouter(registry, MODELS);

    await expect(router.generate(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      code: 'PROVIDER_SAFETY_REJECTION',
    });
  });

  it('rejects JSON that does not match the requested schema', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        name: 'gemini',
        models: [{ id: MODELS.gemini, label: 'gemini' }],
        structuredImpl: async (input) => ({
          model: input.model,
          content: '{"ok":"yes"}',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
      }),
    );
    const router = new StructuredRouter(registry, MODELS);

    await expect(router.generate(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      code: 'STRUCTURED_OUTPUT_VALIDATION_ERROR',
      retryable: false,
    });
  });
});
