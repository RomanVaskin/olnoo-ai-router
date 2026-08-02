import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic/anthropic.provider.js';

function providerWith(create: ReturnType<typeof vi.fn>) {
  return new AnthropicProvider({
    apiKey: 'test-key',
    model: 'claude-test',
    requestTimeoutMs: 1_000,
    client: { messages: { create } } as unknown as Anthropic,
  });
}

describe('AnthropicProvider', () => {
  it('passes system separately and normalizes text, usage, and request id', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'claude-test',
      content: [{ type: 'text', text: 'Hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: 3 },
      _request_id: 'req_anthropic',
    });
    const result = await providerWith(create).chat(
      {
        model: 'claude-test',
        messages: [
          { role: 'system', content: 'Be concise' },
          { role: 'user', content: 'Hello' },
        ],
      },
      { signal: new AbortController().signal },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-test',
        system: 'Be concise',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
      expect.any(Object),
    );
    expect(result).toMatchObject({
      content: 'Hello',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      providerRequestId: 'req_anthropic',
    });
  });

  it('normalizes authentication errors', async () => {
    const error = new Anthropic.AuthenticationError(401, {}, 'denied', new Headers());
    await expect(
      providerWith(vi.fn().mockRejectedValue(error)).chat(
        { model: 'claude-test', messages: [{ role: 'user', content: 'Hello' }] },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });
});
