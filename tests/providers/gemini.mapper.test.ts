import { describe, expect, it } from 'vitest';
import { toFinishReason, toGeminiContents } from '../../src/providers/gemini/gemini.mapper.js';

describe('toGeminiContents', () => {
  it('extracts system messages into systemInstruction and maps roles', () => {
    const result = toGeminiContents([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);

    expect(result.systemInstruction).toBe('Be concise.');
    expect(result.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Hello' }] },
    ]);
  });

  it('joins multiple system messages and omits systemInstruction when absent', () => {
    const withMultipleSystem = toGeminiContents([
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
    ]);
    expect(withMultipleSystem.systemInstruction).toBe('A\n\nB');

    const withoutSystem = toGeminiContents([{ role: 'user', content: 'Hi' }]);
    expect(withoutSystem.systemInstruction).toBeUndefined();
  });
});

describe('toFinishReason', () => {
  it('maps known Gemini finish reasons', () => {
    expect(toFinishReason('STOP')).toBe('stop');
    expect(toFinishReason('MAX_TOKENS')).toBe('length');
    expect(toFinishReason('SAFETY')).toBe('content_filter');
  });

  it('defaults to stop when missing and error when unrecognized', () => {
    expect(toFinishReason(undefined)).toBe('stop');
    expect(toFinishReason('SOMETHING_NEW')).toBe('error');
  });
});
