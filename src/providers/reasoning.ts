import type { ReasoningMode } from '../types/generate.js';

/**
 * Translation of the Router's provider-neutral `reasoningMode` into each vendor's own contract.
 * `params` is spread into the provider request; `applied` is a short note for logs
 * ("unsupported" means nothing was sent, so the provider's default reasoning applies).
 *
 * The mappings follow the parameter contracts of the installed SDKs (openai 7.x, @anthropic-ai/sdk
 * 0.115, @google/genai 1.52) and Anthropic's model notes; they are NOT verified against live
 * provider endpoints. If a provider rejects the setting (HTTP 400), GenerateRouter retries once
 * without it, so a wrong mapping degrades to today's behavior instead of failing the request.
 */
export interface ReasoningPlan<P> {
  params: P;
  applied: string;
}

// ---- OpenAI (Responses API: `reasoning.effort`) ----

const OPENAI_REASONING_MODELS = /^(gpt-5|o[134])/;
const OPENAI_EFFORT = { off: 'none', low: 'low', medium: 'medium', high: 'high' } as const;

export function openAiReasoning(
  model: string,
  mode: ReasoningMode | undefined,
): ReasoningPlan<{ reasoning?: { effort: 'none' | 'low' | 'medium' | 'high' } }> {
  if (!mode) return { params: {}, applied: 'default' };
  if (!OPENAI_REASONING_MODELS.test(model)) return { params: {}, applied: 'unsupported' };
  const effort = OPENAI_EFFORT[mode];
  return { params: { reasoning: { effort } }, applied: `effort=${effort}` };
}

// ---- Anthropic (`thinking` / `output_config.effort`) ----

const DATED = '(-\\d{8})?$';
/** Thinking is off unless requested: nothing to send for `off`. */
const ANTHROPIC_OMIT_IS_OFF = new RegExp(`^claude-(opus-4-[678]|sonnet-4-6|haiku-4-5)${DATED}`);
/** Accepts an explicit `thinking: {type: "disabled"}`. */
const ANTHROPIC_CAN_DISABLE = new RegExp(`^claude-sonnet-5${DATED}`);
/** Thinking cannot be disabled; the lowest effort is the closest setting. */
const ANTHROPIC_ALWAYS_THINKS = new RegExp(
  `^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5(-1)?|mythos-5(-1)?)${DATED}`,
);
/** Models that accept `output_config.effort` (Haiku 4.5 does not). */
const ANTHROPIC_EFFORT = new RegExp(
  `^claude-(sonnet-5|sonnet-5-5|sonnet-4-6|opus-5-5|opus-5|opus-4-[678]|fable-5(-1)?|mythos-5(-1)?)${DATED}`,
);

export type AnthropicReasoningParams = {
  thinking?: { type: 'disabled' };
  output_config?: { effort: 'low' | 'medium' | 'high' };
};

export function anthropicReasoning(
  model: string,
  mode: ReasoningMode | undefined,
): ReasoningPlan<AnthropicReasoningParams> {
  if (!mode) return { params: {}, applied: 'default' };
  if (mode === 'off') {
    if (ANTHROPIC_CAN_DISABLE.test(model)) {
      return { params: { thinking: { type: 'disabled' } }, applied: 'thinking=disabled' };
    }
    if (ANTHROPIC_OMIT_IS_OFF.test(model)) return { params: {}, applied: 'thinking=default-off' };
    if (ANTHROPIC_ALWAYS_THINKS.test(model)) {
      return {
        params: { output_config: { effort: 'low' } },
        applied: 'effort=low (thinking cannot be disabled on this model)',
      };
    }
    return { params: {}, applied: 'unsupported' };
  }
  if (!ANTHROPIC_EFFORT.test(model)) return { params: {}, applied: 'unsupported' };
  return { params: { output_config: { effort: mode } }, applied: `effort=${mode}` };
}

// ---- Gemini (`thinkingConfig.thinkingLevel`, Gemini 3 family) ----

export type GeminiThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
const GEMINI_LEVEL: Record<ReasoningMode, GeminiThinkingLevel> = {
  off: 'MINIMAL',
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

export function geminiReasoning(
  model: string,
  mode: ReasoningMode | undefined,
): ReasoningPlan<{ thinkingLevel?: GeminiThinkingLevel }> {
  if (!mode) return { params: {}, applied: 'default' };
  if (!/^gemini-3/.test(model)) return { params: {}, applied: 'unsupported' };
  const thinkingLevel = GEMINI_LEVEL[mode];
  return { params: { thinkingLevel }, applied: `thinkingLevel=${thinkingLevel}` };
}

// ---- DeepSeek: no control implemented (its thinking switch could not be verified) ----

export function deepSeekReasoning(
  _model: string,
  mode: ReasoningMode | undefined,
): ReasoningPlan<Record<string, never>> {
  return { params: {}, applied: mode ? 'unsupported' : 'default' };
}
