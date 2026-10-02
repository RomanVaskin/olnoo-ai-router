import type { ChatUsage } from '../types/chat.js';

/**
 * Builds the normalized usage object. Contract (all providers):
 * - `promptTokens`: all input tokens, including cached ones.
 * - `completionTokens`: all billable output tokens, INCLUDING reasoning/thinking tokens.
 * - `reasoningTokens`: the part of `completionTokens` spent on reasoning, only when the provider reports it.
 * - `cachedPromptTokens`: the part of `promptTokens` served from cache, only when the provider reports it.
 * - `totalTokens`: the provider's own total when it gives one (it may exceed input + visible output).
 */
export function makeUsage(parts: {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  cachedPromptTokens?: number | null | undefined;
  reasoningTokens?: number | null | undefined;
}): ChatUsage {
  return {
    promptTokens: parts.promptTokens,
    completionTokens: parts.completionTokens,
    totalTokens: parts.totalTokens ?? parts.promptTokens + parts.completionTokens,
    ...(typeof parts.cachedPromptTokens === 'number'
      ? { cachedPromptTokens: parts.cachedPromptTokens }
      : {}),
    ...(typeof parts.reasoningTokens === 'number'
      ? { reasoningTokens: parts.reasoningTokens }
      : {}),
  };
}
