import type { StructuredGenerationRequest } from '../types/generation.js';

export type ProviderName = 'gemini' | 'openai' | 'anthropic';
export type StructuredTaskType = NonNullable<StructuredGenerationRequest['taskType']>;

const PRIMARY_BY_TASK: Record<StructuredTaskType, ProviderName> = {
  general: 'gemini',
  fast: 'gemini',
  reasoning: 'anthropic',
  code: 'openai',
  structured: 'gemini',
  analysis: 'anthropic',
  creative: 'anthropic',
};

const FALLBACK_CHAINS: Record<ProviderName, ProviderName[]> = {
  gemini: ['gemini', 'openai', 'anthropic'],
  openai: ['openai', 'gemini', 'anthropic'],
  anthropic: ['anthropic', 'openai', 'gemini'],
};

export class RoutingPolicy {
  constructor(private readonly defaultProvider: ProviderName = 'gemini') {}

  select(
    provider: StructuredGenerationRequest['provider'],
    taskType?: StructuredTaskType,
  ): ProviderName {
    if (provider !== 'auto') return provider;
    if (taskType === undefined || taskType === 'general') return this.defaultProvider;
    return PRIMARY_BY_TASK[taskType ?? 'general'];
  }

  chain(primary: ProviderName): ProviderName[] {
    return [...FALLBACK_CHAINS[primary]];
  }
}
