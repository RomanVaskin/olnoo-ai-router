import type { ChatUsage } from '../types/chat.js';

/**
 * Central price catalog (USD per 1M tokens). Only prices that are confirmed are listed; for any
 * other model `estimateCostUsd` returns null and the request still succeeds (tokens are logged
 * regardless). Do not add a price without a source and a `verifiedAt` date.
 */
export interface ModelPrice {
  provider: string;
  /** Exact model id (not a prefix: `claude-sonnet-5` and `claude-sonnet-5-5` are different models). */
  model: string;
  inputPerMTokUsd: number;
  /** Price of cached input tokens; when absent, a request that used cache has no cost estimate. */
  cachedInputPerMTokUsd?: number;
  outputPerMTokUsd: number;
  /** Only when the provider prices reasoning differently from output; otherwise reasoning is part of output. */
  reasoningPerMTokUsd?: number;
  verifiedAt: string;
  source: string;
}

const ANTHROPIC_SOURCE = 'Anthropic model/pricing table (claude-api reference, cached 2026-09-25)';

export const PRICE_CATALOG: readonly ModelPrice[] = [
  // claude-sonnet-5 also matches a real run: 179,965 in + 464,007 out ≈ $5.00 at $2 / $10.
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    inputPerMTokUsd: 2,
    cachedInputPerMTokUsd: 0.2,
    outputPerMTokUsd: 10,
    verifiedAt: '2026-09-25',
    source: ANTHROPIC_SOURCE,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    inputPerMTokUsd: 2,
    cachedInputPerMTokUsd: 0.2,
    outputPerMTokUsd: 10,
    verifiedAt: '2026-09-25',
    source: ANTHROPIC_SOURCE,
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    inputPerMTokUsd: 4,
    cachedInputPerMTokUsd: 0.2,
    outputPerMTokUsd: 20,
    verifiedAt: '2026-09-25',
    source: ANTHROPIC_SOURCE,
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    inputPerMTokUsd: 1,
    outputPerMTokUsd: 5,
    verifiedAt: '2026-09-25',
    source: ANTHROPIC_SOURCE,
  },
];

export function findPrice(
  provider: string,
  models: string[],
  catalog: readonly ModelPrice[] = PRICE_CATALOG,
): ModelPrice | undefined {
  for (const model of models) {
    const hit = catalog.find((p) => p.provider === provider && p.model === model);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Estimated cost of one request in USD, or null when it cannot be computed honestly (no confirmed
 * price for the model, or cached tokens were used and the entry has no cached price).
 */
export function estimateCostUsd(
  provider: string,
  models: string[],
  usage: Pick<
    ChatUsage,
    'promptTokens' | 'completionTokens' | 'cachedPromptTokens' | 'reasoningTokens'
  >,
  catalog: readonly ModelPrice[] = PRICE_CATALOG,
): number | null {
  const price = findPrice(provider, models, catalog);
  if (!price) return null;
  const cached = usage.cachedPromptTokens ?? 0;
  if (cached > 0 && price.cachedInputPerMTokUsd === undefined) return null;
  const reasoning = usage.reasoningTokens ?? 0;
  const separateReasoning = price.reasoningPerMTokUsd !== undefined ? reasoning : 0;
  const uncachedInput = Math.max(0, usage.promptTokens - cached);
  const output = Math.max(0, usage.completionTokens - separateReasoning);
  const usd =
    (uncachedInput * price.inputPerMTokUsd +
      cached * (price.cachedInputPerMTokUsd ?? 0) +
      output * price.outputPerMTokUsd +
      separateReasoning * (price.reasoningPerMTokUsd ?? 0)) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
