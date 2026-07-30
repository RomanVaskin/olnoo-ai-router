import type { ProviderModelInfo } from '../provider.interface.js';

/**
 * Metadata for Gemini models this router knows about. A model id that is
 * enabled via GEMINI_MODELS but missing here is still served — it just
 * surfaces without a context-window hint on GET /providers.
 */
const KNOWN_GEMINI_MODELS: Record<string, Omit<ProviderModelInfo, 'id'>> = {
  'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', contextWindow: 1_048_576 },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', contextWindow: 1_048_576 },
  'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash-Lite', contextWindow: 1_048_576 },
  'gemini-2.0-flash': { label: 'Gemini 2.0 Flash', contextWindow: 1_048_576 },
};

export function describeGeminiModel(modelId: string): ProviderModelInfo {
  const known = KNOWN_GEMINI_MODELS[modelId];
  return known ? { id: modelId, ...known } : { id: modelId, label: modelId };
}
