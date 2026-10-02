import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../../src/providers/gemini/gemini.provider.js';

function providerWith(generateContent: ReturnType<typeof vi.fn>) {
  const provider = new GeminiProvider({
    apiKey: 'test-key',
    enabledModels: ['gemini-3.5-flash', 'gemini-2.5-flash'],
    requestTimeoutMs: 1_000,
  });
  Object.assign(provider, { client: { models: { generateContent } } });
  return provider;
}

const input = {
  model: 'gemini-3.5-flash',
  messages: [{ role: 'user' as const, content: 'Say GEMINI_OK' }],
};
const options = { signal: new AbortController().signal };

describe('GeminiProvider usage and reasoning', () => {
  it('keeps thinking tokens: input 9, visible output 4, total 92 (production response)', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'GEMINI_OK',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 9,
        candidatesTokenCount: 4,
        thoughtsTokenCount: 79,
        totalTokenCount: 92,
      },
    });
    const result = await providerWith(generateContent).chat(input, options);
    expect(result.usage).toEqual({
      promptTokens: 9,
      completionTokens: 83, // 4 visible + 79 thinking: all billable output
      reasoningTokens: 79,
      totalTokens: 92,
    });
    expect(result.usage.promptTokens + result.usage.completionTokens).toBe(
      result.usage.totalTokens,
    );
  });

  it('keeps the previous usage shape when the provider reports no thinking or cache', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7, totalTokenCount: 12 },
    });
    const result = await providerWith(generateContent).chat(input, options);
    expect(result.usage).toStrictEqual({ promptTokens: 5, completionTokens: 7, totalTokens: 12 });
  });

  it('reports cached input tokens when present', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 100,
        cachedContentTokenCount: 60,
        candidatesTokenCount: 7,
        totalTokenCount: 107,
      },
    });
    expect((await providerWith(generateContent).chat(input, options)).usage).toMatchObject({
      cachedPromptTokens: 60,
    });
  });

  it('sends thinkingLevel MINIMAL for reasoningMode off on Gemini 3, nothing on other models', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValue({ text: 'ok', candidates: [{ finishReason: 'STOP' }], usageMetadata: {} });
    const provider = providerWith(generateContent);
    const off = await provider.chat({ ...input, reasoningMode: 'off' }, options);
    expect(generateContent.mock.calls[0]?.[0].config.thinkingConfig).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    expect(off.reasoningApplied).toBe('thinkingLevel=MINIMAL');

    await provider.chat({ ...input, model: 'gemini-2.5-flash', reasoningMode: 'off' }, options);
    expect(generateContent.mock.calls[1]?.[0].config).not.toHaveProperty('thinkingConfig');

    await provider.chat(input, options);
    expect(generateContent.mock.calls[2]?.[0].config).not.toHaveProperty('thinkingConfig');
  });
});
