import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/app-error.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { failedAttemptsOf, GenerateRouter } from '../../src/router/generate-router.js';
import type { GenerateRequest } from '../../src/types/generate.js';
import { FakeProvider, type FakeProviderConfig } from '../fakes/fake-provider.js';

const defaults = {
  openai: 'openai-model',
  anthropic: 'anthropic-model',
  gemini: 'gemini-model',
  qwen: 'qwen-model',
};

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

  it('returns PROVIDER_NOT_CONFIGURED for a selected provider without a key', async () => {
    const instance = new GenerateRouter(registry(provider('gemini')), defaults);
    await expect(
      instance.generate(input({ provider: 'openai' }), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('defaults only olnoo-assistant requests to OpenAI', async () => {
    const openai = provider('openai');
    const anthropic = provider('anthropic');
    const instance = new GenerateRouter(registry(openai, anthropic), defaults);
    await expect(
      instance.generate(
        input({ provider: undefined, metadata: { application: 'olnoo-assistant' } }),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ provider: 'openai' });
    await expect(
      instance.generate(
        input({ provider: undefined, metadata: { application: 'studio-like-client' } }),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ provider: 'anthropic' });
  });
});

describe('GenerateRouter attempt chain', () => {
  const anthropicRejected = () =>
    new AppError('VALIDATION_ERROR', 'Anthropic rejected the request', {
      cause: {
        status: 400,
        error: {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'bad temperature' },
        },
      },
    });

  it('records openai → anthropic failures on the thrown error, with the real last provider and upstream reason', async () => {
    const instance = new GenerateRouter(
      registry(
        provider(
          'openai',
          vi.fn().mockRejectedValue(new AppError('PROVIDER_RATE_LIMITED', 'limit')),
        ),
        provider('anthropic', vi.fn().mockRejectedValue(anthropicRejected())),
        provider('gemini'),
      ),
      defaults,
    );
    const error = await instance
      .generate(
        input({ taskType: 'reasoning', provider: 'openai', allowFallback: true }),
        new AbortController().signal,
      )
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(failedAttemptsOf(error)).toEqual([
      { provider: 'openai', model: 'openai-model', code: 'PROVIDER_RATE_LIMITED' },
      {
        provider: 'anthropic',
        model: 'anthropic-model',
        code: 'VALIDATION_ERROR',
        upstream: { status: 400, type: 'invalid_request_error', message: 'bad temperature' },
      },
    ]);
  });

  it('reports the failed openai attempt next to a successful anthropic fallback', async () => {
    const instance = new GenerateRouter(
      registry(
        provider(
          'openai',
          vi.fn().mockRejectedValue(new AppError('PROVIDER_RATE_LIMITED', 'limit')),
        ),
        provider('anthropic'),
        provider('gemini'),
      ),
      defaults,
    );
    const result = await instance.generate(
      input({ taskType: 'reasoning', provider: 'openai', allowFallback: true }),
      new AbortController().signal,
    );
    expect(result).toMatchObject({ provider: 'anthropic', fallbackUsed: true });
    expect(result.failedAttempts).toEqual([
      { provider: 'openai', model: 'openai-model', code: 'PROVIDER_RATE_LIMITED' },
    ]);
  });

  it('has no recorded attempts for an unrelated error', () => {
    expect(failedAttemptsOf(new Error('x'))).toEqual([]);
    expect(failedAttemptsOf(undefined)).toEqual([]);
  });
});

describe('GenerateRouter reasoningMode', () => {
  const ok = {
    model: defaults.openai,
    content: 'ok',
    finishReason: 'stop' as const,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };

  it('passes reasoningMode to the provider only when requested', async () => {
    const chat = vi.fn().mockResolvedValue({ ...ok, reasoningApplied: 'effort=none' });
    const instance = new GenerateRouter(registry(provider('openai', chat)), defaults);
    const withMode = await instance.generate(
      input({ provider: 'openai', reasoningMode: 'off' }),
      new AbortController().signal,
    );
    expect(chat.mock.calls[0]?.[0]).toMatchObject({ reasoningMode: 'off' });
    expect(withMode.output.reasoningApplied).toBe('effort=none');

    await instance.generate(input({ provider: 'openai' }), new AbortController().signal);
    expect(chat.mock.calls[1]?.[0]).not.toHaveProperty('reasoningMode');
  });

  it('retries once without the setting when the provider rejects it, and says so', async () => {
    const chat = vi
      .fn()
      .mockRejectedValueOnce(new AppError('VALIDATION_ERROR', 'OpenAI rejected the request'))
      .mockResolvedValueOnce(ok);
    const instance = new GenerateRouter(registry(provider('openai', chat)), defaults);
    const result = await instance.generate(
      input({ provider: 'openai', reasoningMode: 'off' }),
      new AbortController().signal,
    );
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0]).not.toHaveProperty('reasoningMode');
    expect(result.output.reasoningApplied).toMatch(/^dropped/);
  });

  it('does not retry on other errors', async () => {
    const chat = vi.fn().mockRejectedValue(new AppError('PROVIDER_AUTH_FAILED', 'denied'));
    const instance = new GenerateRouter(registry(provider('openai', chat)), defaults);
    await expect(
      instance.generate(
        input({ provider: 'openai', reasoningMode: 'off' }),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

describe('GenerateRouter qwen', () => {
  const ok = (model: string) => ({
    model,
    content: 'ok',
    finishReason: 'stop' as const,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  });

  it('is never part of an automatic route (existing order unchanged)', () => {
    const router = new GenerateRouter(new ProviderRegistry(), defaults);
    for (const taskType of ['code', 'reasoning', 'fast', 'general'] as const) {
      expect(router.routeFor(taskType)).not.toContain('qwen');
    }
  });

  it('serves provider=qwen explicitly with its default model and no fallback by default', async () => {
    const chat = vi.fn().mockResolvedValue(ok(defaults.qwen));
    const instance = new GenerateRouter(registry(provider('qwen', chat)), defaults);
    const result = await instance.generate(
      input({ provider: 'qwen' }),
      new AbortController().signal,
    );
    expect(result).toMatchObject({ provider: 'qwen', fallbackUsed: false });
    expect(chat.mock.calls[0]?.[0]).toMatchObject({ model: 'qwen-model' });
  });

  it('with allowFallback a failing qwen request continues through the usual chain', async () => {
    const instance = new GenerateRouter(
      registry(
        provider('qwen', vi.fn().mockRejectedValue(new AppError('PROVIDER_UNAVAILABLE', 'down'))),
        provider('anthropic'),
        provider('openai'),
      ),
      defaults,
    );
    const result = await instance.generate(
      input({ taskType: 'reasoning', provider: 'qwen', allowFallback: true }),
      new AbortController().signal,
    );
    expect(result).toMatchObject({ provider: 'anthropic', fallbackUsed: true });
    expect(result.failedAttempts.map((a) => a.provider)).toEqual(['qwen']);
  });
});
