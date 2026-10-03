import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai/openai.provider.js';

function providerWith(create: ReturnType<typeof vi.fn>) {
  return new OpenAIProvider({
    apiKey: 'test-key',
    model: 'gpt-test',
    requestTimeoutMs: 1_000,
    client: { responses: { create } } as unknown as OpenAI,
  });
}

describe('OpenAIProvider', () => {
  it('uses Responses API and normalizes text, usage, and request id', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'gpt-test',
      output_text: 'Hello',
      output: [],
      status: 'completed',
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      _request_id: 'req_openai',
    });
    const result = await providerWith(create).chat(
      {
        model: 'gpt-test',
        messages: [
          { role: 'system', content: 'Be concise' },
          { role: 'user', content: 'Hello' },
        ],
      },
      { signal: new AbortController().signal },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        instructions: 'Be concise',
        input: [{ role: 'user', content: 'Hello' }],
      }),
      expect.any(Object),
    );
    expect(result).toMatchObject({
      content: 'Hello',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      providerRequestId: 'req_openai',
    });
  });

  it('normalizes authentication errors', async () => {
    const error = new OpenAI.AuthenticationError(401, {}, 'denied', new Headers());
    await expect(
      providerWith(vi.fn().mockRejectedValue(error)).chat(
        { model: 'gpt-test', messages: [{ role: 'user', content: 'Hello' }] },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });

  it('sends reasoning.effort for reasoningMode and reports cached/reasoning tokens', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'gpt-5.4-mini',
      output_text: 'ok',
      output: [],
      status: 'completed',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        input_tokens_details: { cached_tokens: 64 },
        output_tokens_details: { reasoning_tokens: 30 },
      },
    });
    const messages = [{ role: 'user' as const, content: 'Hello' }];
    const options = { signal: new AbortController().signal };
    const result = await providerWith(create).chat(
      { model: 'gpt-5.4-mini', messages, reasoningMode: 'off' },
      options,
    );
    expect(create.mock.calls[0]?.[0]).toMatchObject({ reasoning: { effort: 'none' } });
    expect(result.reasoningApplied).toBe('effort=none');
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cachedPromptTokens: 64,
      reasoningTokens: 30,
    });
    await providerWith(create).chat({ model: 'gpt-4.1', messages, reasoningMode: 'off' }, options);
    expect(create.mock.calls[1]?.[0]).not.toHaveProperty('reasoning');
  });

  it('accepts every enabled model plus the default, lists them, and rejects unknown models', () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-5.4-mini',
      enabledModels: ['gpt-5.4-mini', 'gpt-5.4-nano'],
      requestTimeoutMs: 1_000,
      client: { responses: { create: vi.fn() } } as unknown as OpenAI,
    });
    expect(provider.supportsModel('gpt-5.4-nano')).toBe(true);
    expect(provider.supportsModel('gpt-5.4-mini')).toBe(true);
    expect(provider.supportsModel('gpt-unknown')).toBe(false);
    expect(provider.listModels().map((m) => m.id)).toEqual(['gpt-5.4-mini', 'gpt-5.4-nano']);
  });

  it('always allows the default model even if it is missing from the allow-list; without a list only the default', () => {
    const make = (enabledModels?: string[]) =>
      new OpenAIProvider({
        apiKey: 'test-key',
        model: 'gpt-default',
        ...(enabledModels ? { enabledModels } : {}),
        requestTimeoutMs: 1_000,
        client: { responses: { create: vi.fn() } } as unknown as OpenAI,
      });
    expect(make(['gpt-5.4-nano']).supportsModel('gpt-default')).toBe(true);
    expect(
      make()
        .listModels()
        .map((m) => m.id),
    ).toEqual(['gpt-default']);
    expect(make().supportsModel('gpt-5.4-nano')).toBe(false);
  });
});
