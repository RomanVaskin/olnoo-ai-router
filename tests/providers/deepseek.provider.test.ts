import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from '../../src/providers/deepseek/deepseek.provider.js';

const SECRET = 'sk-deepseek-secret';
const PROMPT = 'PRIVATE PROMPT TEXT about client keywords';
const THINKING = 'long chain of thought that must never become the answer';

function providerWith(create: ReturnType<typeof vi.fn>) {
  return new DeepSeekProvider({
    apiKey: SECRET,
    model: 'deepseek-test',
    baseURL: 'https://example.invalid',
    requestTimeoutMs: 1_000,
    client: { chat: { completions: { create } } } as unknown as OpenAI,
  });
}

const input = { model: 'deepseek-test', messages: [{ role: 'user' as const, content: PROMPT }] };
const options = { signal: new AbortController().signal };

/** DeepSeek response shapes (Chat Completions; thinking models add message.reasoning_content). */
const normal = {
  model: 'deepseek-test',
  choices: [{ message: { role: 'assistant', content: 'final answer' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  _request_id: 'req_ds',
};
const withReasoning = {
  model: 'deepseek-test',
  choices: [
    {
      message: { role: 'assistant', content: 'final answer', reasoning_content: THINKING },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 40,
    total_tokens: 50,
    completion_tokens_details: { reasoning_tokens: 35 },
  },
};
const reasoningExhaustedLimit = {
  model: 'deepseek-test',
  choices: [
    {
      message: { role: 'assistant', content: '', reasoning_content: THINKING },
      finish_reason: 'length',
    },
  ],
  usage: {
    prompt_tokens: 4000,
    completion_tokens: 5500,
    total_tokens: 9500,
    completion_tokens_details: { reasoning_tokens: 5500 },
  },
};

describe('DeepSeekProvider response shapes', () => {
  it('reads choices[0].message.content, finish_reason and usage', async () => {
    const result = await providerWith(vi.fn().mockResolvedValue(normal)).chat(input, options);
    expect(result).toMatchObject({
      content: 'final answer',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      providerRequestId: 'req_ds',
    });
    expect(result.usage).not.toHaveProperty('reasoningTokens');
  });

  it('returns the final content, never reasoning_content, and reports reasoning tokens', async () => {
    const result = await providerWith(vi.fn().mockResolvedValue(withReasoning)).chat(
      input,
      options,
    );
    expect(result.content).toBe('final answer');
    expect(result.content).not.toContain(THINKING);
    expect(result.usage).toMatchObject({ completionTokens: 40, reasoningTokens: 35 });
  });

  it('keeps finish_reason "length" for a truncated but non-empty answer', async () => {
    const truncated = {
      ...normal,
      choices: [{ message: { content: '{"r":[[1,"t",9' }, finish_reason: 'length' }],
    };
    expect(
      (await providerWith(vi.fn().mockResolvedValue(truncated)).chat(input, options)).finishReason,
    ).toBe('length');
  });

  it('empty final content while reasoning used the limit: error with safe diagnostics, reasoning NOT returned', async () => {
    const error = await providerWith(vi.fn().mockResolvedValue(reasoningExhaustedLimit))
      .chat(input, options)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(error).toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
    const message = (error as Error).message;
    expect(message).toContain('finish_reason=length');
    expect(message).toContain('reasoning_content=present');
    expect(message).toContain('completion_tokens=5500');
    expect(message).toContain('reasoning_tokens=5500');
    for (const leaked of [THINKING, PROMPT, SECRET]) expect(message).not.toContain(leaked);
  });

  it.each([
    [
      'null content with reasoning and finish_reason stop',
      {
        choices: [
          { message: { content: null, reasoning_content: THINKING }, finish_reason: 'stop' },
        ],
        usage: { completion_tokens: 12 },
      },
      [
        'finish_reason=stop',
        'reasoning_content=present',
        'completion_tokens=12',
        'reasoning_tokens=unknown',
      ],
    ],
    [
      'empty content without reasoning_content',
      {
        choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        usage: { completion_tokens: 0 },
      },
      ['finish_reason=stop', 'reasoning_content=absent', 'completion_tokens=0'],
    ],
    [
      'content_filter',
      { choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] },
      ['finish_reason=content_filter', 'completion_tokens=unknown'],
    ],
    [
      'no choices',
      { choices: [], usage: { completion_tokens: 0 } },
      ['choices=0', 'reasoning_content=absent'],
    ],
  ])('empty final content (%s)', async (_name, response, expected) => {
    const error = await providerWith(
      vi.fn().mockResolvedValue({ model: 'deepseek-test', ...response }),
    )
      .chat(input, options)
      .catch((e: unknown) => e as Error);
    expect(error).toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
    for (const part of expected) expect((error as Error).message).toContain(part);
    for (const leaked of [THINKING, PROMPT, SECRET])
      expect((error as Error).message).not.toContain(leaked);
  });

  it('structured generation reports the same diagnostics', async () => {
    const error = await providerWith(vi.fn().mockResolvedValue(reasoningExhaustedLimit))
      .generateStructured(
        { model: 'deepseek-test', prompt: PROMPT, images: [], jsonSchema: { type: 'object' } },
        options,
      )
      .catch((e: unknown) => e as Error);
    expect(error).toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
    expect((error as Error).message).toContain('finish_reason=length');
    expect((error as Error).message).not.toContain(THINKING);
  });

  describe('reasoningMode', () => {
    const ok = {
      model: 'deepseek-test',
      choices: [{ message: { content: 'final answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };

    it('off sends thinking: { type: "disabled" } in the request', async () => {
      const create = vi.fn().mockResolvedValue(ok);
      const result = await providerWith(create).chat({ ...input, reasoningMode: 'off' }, options);
      expect(create.mock.calls[0]?.[0]).toMatchObject({
        model: 'deepseek-test',
        thinking: { type: 'disabled' },
      });
      expect(result.reasoningApplied).toBe('thinking=disabled');
    });

    it('without reasoningMode the request is unchanged (provider default thinking)', async () => {
      const create = vi.fn().mockResolvedValue(ok);
      const result = await providerWith(create).chat(input, options);
      const payload = create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('thinking');
      expect(payload).not.toHaveProperty('reasoning_effort');
      expect(result).not.toHaveProperty('reasoningApplied');
    });

    it('modes other than off send nothing and are reported as unsupported', async () => {
      const create = vi.fn().mockResolvedValue(ok);
      const result = await providerWith(create).chat({ ...input, reasoningMode: 'high' }, options);
      expect(create.mock.calls[0]?.[0]).not.toHaveProperty('thinking');
      expect(result.reasoningApplied).toBe('unsupported');
    });
  });
});
