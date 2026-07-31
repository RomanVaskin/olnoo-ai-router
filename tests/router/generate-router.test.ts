import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/app-error.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { GenerateRouter } from '../../src/router/generate-router.js';
import type { GenerateRequest } from '../../src/types/generate.js';
import { FakeProvider, type FakeProviderConfig } from '../fakes/fake-provider.js';

const defaults = { openai: 'openai-model', anthropic: 'anthropic-model', gemini: 'gemini-model' };

function input(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    taskType: 'general',
    messages: [{ role: 'user', content: 'hello' }],
    provider: 'auto',
    model: null,
    allowFallback: false,
    ...overrides,
  };
}

function provider(name: keyof typeof defaults, chatImpl?: FakeProviderConfig['chatImpl']) {
  return new FakeProvider({
    name,
    models: [{ id: defaults[name], label: defaults[name] }],
    ...(chatImpl ? { chatImpl } : {}),
  });
}

function registry(...providers: FakeProvider[]) {
  const result = new ProviderRegistry();
  providers.forEach((item) => result.register(item));
  return result;
}

describe('GenerateRouter routing', () => {
  const router = new GenerateRouter(new ProviderRegistry(), defaults);

  it.each([
    ['code', ['openai', 'anthropic', 'gemini']],
    ['reasoning', ['anthropic', 'openai', 'gemini']],
    ['fast', ['gemini', 'openai', 'anthropic']],
    ['general', ['anthropic', 'openai', 'gemini']],
  ] as const)('routes %s tasks in the documented order', (taskType, expected) => {
    expect(router.routeFor(taskType)).toEqual(expected);
  });

  it('falls back once per provider on transient errors and normalizes the winner', async () => {
    const openaiCall = vi.fn().mockRejectedValue(new AppError('PROVIDER_TIMEOUT', 'timeout'));
    const anthropicCall = vi.fn().mockResolvedValue({
      model: defaults.anthropic,
      content: 'ok',
      finishReason: 'stop',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    });
    const instance = new GenerateRouter(
      registry(
        provider('openai', openaiCall),
        provider('anthropic', anthropicCall),
        provider('gemini'),
      ),
      defaults,
    );
    const result = await instance.generate(
      input({ taskType: 'code' }),
      new AbortController().signal,
    );
    expect(result.provider).toBe('anthropic');
    expect(result.fallbackUsed).toBe(true);
    expect(result.output.usage.totalTokens).toBe(5);
    expect(openaiCall).toHaveBeenCalledOnce();
    expect(anthropicCall).toHaveBeenCalledOnce();
  });

  it.each([
    'PROVIDER_AUTHENTICATION_ERROR',
    'PROVIDER_BILLING_ERROR',
    'VALIDATION_ERROR',
    'PROVIDER_SAFETY_REJECTION',
  ] as const)('does not fall back on %s', async (code) => {
    const secondary = vi.fn();
    const instance = new GenerateRouter(
      registry(
        provider('openai', vi.fn().mockRejectedValue(new AppError(code, 'terminal'))),
        provider('anthropic', secondary),
      ),
      defaults,
    );
    await expect(
      instance.generate(input({ taskType: 'code' }), new AbortController().signal),
    ).rejects.toMatchObject({ code });
    expect(secondary).not.toHaveBeenCalled();
  });

  it('keeps an explicit provider pinned unless allowFallback is true', async () => {
    const secondary = vi.fn();
    const instance = new GenerateRouter(
      registry(
        provider('openai', vi.fn().mockRejectedValue(new AppError('PROVIDER_TIMEOUT', 'timeout'))),
        provider('anthropic', secondary),
      ),
      defaults,
    );
    await expect(
      instance.generate(input({ provider: 'openai' }), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(secondary).not.toHaveBeenCalled();
  });
});
