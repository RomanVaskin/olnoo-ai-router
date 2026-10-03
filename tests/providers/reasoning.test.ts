import { describe, expect, it } from 'vitest';
import {
  anthropicReasoning,
  deepSeekReasoning,
  geminiReasoning,
  openAiReasoning,
} from '../../src/providers/reasoning.js';

describe('reasoning mode translation', () => {
  it('sends nothing for any provider when no mode is requested (old callers unchanged)', () => {
    for (const plan of [
      openAiReasoning('gpt-5.4-mini', undefined),
      anthropicReasoning('claude-sonnet-5', undefined),
      geminiReasoning('gemini-3.5-flash', undefined),
      deepSeekReasoning('deepseek-v4-flash', undefined),
    ]) {
      expect(plan.params).toEqual({});
      expect(plan.applied).toBe('default');
    }
  });

  it('OpenAI: reasoning.effort for reasoning models, nothing for others', () => {
    expect(openAiReasoning('gpt-5.4-mini', 'off').params).toEqual({
      reasoning: { effort: 'none' },
    });
    expect(openAiReasoning('gpt-5.4-mini', 'low').params).toEqual({ reasoning: { effort: 'low' } });
    expect(openAiReasoning('gpt-5.4-nano', 'high').params).toEqual({
      reasoning: { effort: 'high' },
    });
    expect(openAiReasoning('gpt-4.1', 'low')).toEqual({ params: {}, applied: 'unsupported' });
  });

  it('Anthropic: disables thinking only where that is accepted, otherwise the closest setting', () => {
    expect(anthropicReasoning('claude-sonnet-5', 'off').params).toEqual({
      thinking: { type: 'disabled' },
    });
    // Sonnet 5.5 / Opus 5.5 cannot disable thinking -> lowest effort.
    expect(anthropicReasoning('claude-sonnet-5-5', 'off').params).toEqual({
      output_config: { effort: 'low' },
    });
    expect(anthropicReasoning('claude-opus-5-5', 'off').params).toEqual({
      output_config: { effort: 'low' },
    });
    // Models where omitting `thinking` already means off.
    expect(anthropicReasoning('claude-opus-4-8', 'off')).toEqual({
      params: {},
      applied: 'thinking=default-off',
    });
    expect(anthropicReasoning('claude-haiku-4-5', 'off')).toEqual({
      params: {},
      applied: 'thinking=default-off',
    });
    expect(anthropicReasoning('claude-sonnet-5', 'medium').params).toEqual({
      output_config: { effort: 'medium' },
    });
    // Haiku 4.5 has no effort control; unknown models get nothing.
    expect(anthropicReasoning('claude-haiku-4-5', 'low')).toEqual({
      params: {},
      applied: 'unsupported',
    });
    expect(anthropicReasoning('claude-unknown-1', 'off')).toEqual({
      params: {},
      applied: 'unsupported',
    });
  });

  it('Anthropic: claude-sonnet-5 and claude-sonnet-5-5 are different models (no prefix match)', () => {
    expect(anthropicReasoning('claude-sonnet-5-5', 'off').params).not.toHaveProperty('thinking');
    expect(anthropicReasoning('claude-sonnet-5-20260101', 'off').params).toEqual({
      thinking: { type: 'disabled' },
    });
  });

  it('Gemini 3: thinkingLevel; other Gemini models: unsupported, nothing sent', () => {
    expect(geminiReasoning('gemini-3.5-flash', 'off').params).toEqual({ thinkingLevel: 'MINIMAL' });
    expect(geminiReasoning('gemini-3.5-flash', 'low').params).toEqual({ thinkingLevel: 'LOW' });
    expect(geminiReasoning('gemini-2.5-flash', 'off')).toEqual({
      params: {},
      applied: 'unsupported',
    });
  });

  it('DeepSeek: off disables thinking; other modes are not mapped; no mode keeps the default', () => {
    expect(deepSeekReasoning('deepseek-v4-flash', 'off')).toEqual({
      params: { thinking: { type: 'disabled' } },
      applied: 'thinking=disabled',
    });
    for (const mode of ['low', 'medium', 'high'] as const) {
      expect(deepSeekReasoning('deepseek-v4-flash', mode)).toEqual({
        params: {},
        applied: 'unsupported',
      });
    }
    expect(deepSeekReasoning('deepseek-v4-flash', undefined)).toEqual({
      params: {},
      applied: 'default',
    });
  });
});
