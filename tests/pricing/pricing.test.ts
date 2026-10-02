import { describe, expect, it } from 'vitest';
import { estimateCostUsd, PRICE_CATALOG, type ModelPrice } from '../../src/pricing/pricing.js';

const custom: ModelPrice[] = [
  {
    provider: 'x',
    model: 'm',
    inputPerMTokUsd: 1,
    cachedInputPerMTokUsd: 0.1,
    outputPerMTokUsd: 4,
    reasoningPerMTokUsd: 8,
    verifiedAt: '2026-10-02',
    source: 'test',
  },
  {
    provider: 'x',
    model: 'no-cache',
    inputPerMTokUsd: 1,
    outputPerMTokUsd: 4,
    verifiedAt: '2026-10-02',
    source: 'test',
  },
];

describe('estimateCostUsd', () => {
  it('reproduces the real claude-sonnet-5 spend: 179,965 in + 464,007 out ≈ $5', () => {
    const usd = estimateCostUsd('anthropic', ['claude-sonnet-5'], {
      promptTokens: 179_965,
      completionTokens: 464_007,
    });
    expect(usd).toBeCloseTo(5, 4);
  });

  it('prices cached input and separately priced reasoning tokens from the entry', () => {
    // 600 uncached*1 + 400 cached*0.1 + (500-200) output*4 + 200 reasoning*8 = 3440 / 1e6
    const usd = estimateCostUsd(
      'x',
      ['m'],
      { promptTokens: 1000, completionTokens: 500, cachedPromptTokens: 400, reasoningTokens: 200 },
      custom,
    );
    expect(usd).toBeCloseTo(0.00344, 8);
  });

  it('prices reasoning at the output rate when the entry has no separate reasoning price', () => {
    const usd = estimateCostUsd(
      'x',
      ['no-cache'],
      { promptTokens: 0, completionTokens: 1000, reasoningTokens: 900 },
      custom,
    );
    expect(usd).toBeCloseTo(0.004, 8);
  });

  it('returns null — never throws, never invents a price — for unknown models or missing cached price', () => {
    expect(
      estimateCostUsd('gemini', ['gemini-3.5-flash'], { promptTokens: 9, completionTokens: 83 }),
    ).toBeNull();
    expect(
      estimateCostUsd('openai', ['gpt-5.4-mini'], { promptTokens: 1, completionTokens: 1 }),
    ).toBeNull();
    expect(
      estimateCostUsd(
        'x',
        ['no-cache'],
        { promptTokens: 10, completionTokens: 1, cachedPromptTokens: 5 },
        custom,
      ),
    ).toBeNull();
  });

  it('lists only entries with a source and a verification date', () => {
    for (const price of PRICE_CATALOG) {
      expect(price.source).not.toBe('');
      expect(price.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
