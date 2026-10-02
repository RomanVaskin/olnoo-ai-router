import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  AnthropicProvider,
  supportsSamplingParams,
} from '../../src/providers/anthropic/anthropic.provider.js';

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

  const okResponse = {
    model: 'm',
    content: [{ type: 'text', text: 'ok' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  const callChat = async (model: string) => {
    const create = vi.fn().mockResolvedValue(okResponse);
    await providerWith(create).chat(
      { model, messages: [{ role: 'user', content: 'Hello' }], temperature: 0.1, topP: 0.9 },
      { signal: new AbortController().signal },
    );
    return create.mock.calls[0]?.[0] as Record<string, unknown>;
  };

  it.each([
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-opus-4-7',
    'claude-fable-5-1',
  ])('does not send temperature/top_p to %s (rejected with HTTP 400)', async (model) => {
    const payload = await callChat(model);
    expect(payload).not.toHaveProperty('temperature');
    expect(payload).not.toHaveProperty('top_p');
    expect(payload).toMatchObject({ model, messages: [{ role: 'user', content: 'Hello' }] });
  });

  it.each(['claude-test', 'claude-sonnet-4-6', 'claude-haiku-4-5'])(
    'keeps temperature/top_p for %s, which supports them',
    async (model) => {
      expect(await callChat(model)).toMatchObject({ temperature: 0.1, top_p: 0.9 });
    },
  );

  it('does not send temperature in structured generation for claude-sonnet-5', async () => {
    const create = vi.fn().mockResolvedValue(okResponse);
    await providerWith(create).generateStructured(
      {
        model: 'claude-sonnet-5',
        prompt: 'x',
        images: [],
        jsonSchema: { type: 'object' },
        temperature: 0.1,
      },
      { signal: new AbortController().signal },
    );
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('temperature');
  });

  it('classifies models by sampling support', () => {
    expect(supportsSamplingParams('claude-sonnet-5')).toBe(false);
    expect(supportsSamplingParams('claude-sonnet-4-6')).toBe(true);
  });
});
