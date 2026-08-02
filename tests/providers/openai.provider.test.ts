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
});
