import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { QwenProvider } from '../../src/providers/qwen/qwen.provider.js';

function providerWith(create: ReturnType<typeof vi.fn>) {
  return new QwenProvider({
    apiKey: 'sk-test-secret',
    model: 'qwen-plus',
    baseURL: 'https://example.invalid/compatible-mode/v1',
    requestTimeoutMs: 1_000,
    client: { chat: { completions: { create } } } as unknown as OpenAI,
  });
}

const options = { signal: new AbortController().signal };

describe('QwenProvider', () => {
  it('uses Chat Completions with system separated and normalizes text, usage and request id', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'qwen-plus',
      choices: [{ message: { content: 'Привет' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      _request_id: 'req_qwen',
    });
    const result = await providerWith(create).chat(
      {
        model: 'qwen-plus',
        maxOutputTokens: 50,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'Be concise' },
          { role: 'user', content: 'Hello' },
        ],
      },
      options,
    );
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'qwen-plus',
      max_tokens: 50,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'Be concise' },
        { role: 'user', content: 'Hello' },
      ],
    });
    expect(result).toMatchObject({
      model: 'qwen-plus',
      content: 'Привет',
      finishReason: 'stop',
      usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
      providerRequestId: 'req_qwen',
    });
  });

  it('sends no reasoning field and reports a requested mode as unsupported', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'qwen-plus',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const result = await providerWith(create).chat(
      { model: 'qwen-plus', messages: [{ role: 'user', content: 'x' }], reasoningMode: 'off' },
      options,
    );
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('reasoning');
    expect(result.reasoningApplied).toBe('unsupported');
  });

  it('maps provider errors without leaking the API key', async () => {
    const auth = new OpenAI.AuthenticationError(
      401,
      { message: 'Incorrect API key sk-test-secret' },
      'denied',
      new Headers({ authorization: 'Bearer sk-test-secret' }),
    );
    const error = await providerWith(vi.fn().mockRejectedValue(auth))
      .chat({ model: 'qwen-plus', messages: [{ role: 'user', content: 'x' }] }, options)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'PROVIDER_AUTH_FAILED',
      message: 'Qwen authentication failed',
    });
    expect((error as Error).message).not.toContain('sk-test-secret');
    await expect(
      providerWith(
        vi.fn().mockRejectedValue(new OpenAI.RateLimitError(429, {}, 'limit', new Headers())),
      ).chat({ model: 'qwen-plus', messages: [{ role: 'user', content: 'x' }] }, options),
    ).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
    expect(providerWith(vi.fn()).supportsModel('qwen-plus')).toBe(true);
    expect(providerWith(vi.fn()).supportsModel('other')).toBe(false);
  });
});
