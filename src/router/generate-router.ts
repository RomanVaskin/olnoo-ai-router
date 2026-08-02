import { AppError } from '../errors/app-error.js';
import type { AIProvider, ProviderChatOutput } from '../providers/provider.interface.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import type { GenerateRequest, TaskType } from '../types/generate.js';

export type TextProviderName = 'anthropic' | 'openai' | 'gemini';

const ROUTES: Record<TaskType, TextProviderName[]> = {
  code: ['openai', 'anthropic', 'gemini'],
  reasoning: ['anthropic', 'openai', 'gemini'],
  fast: ['gemini', 'openai', 'anthropic'],
  general: ['anthropic', 'openai', 'gemini'],
};

const FALLBACK_ERROR_CODES = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
]);

export interface GenerateAttemptResult {
  provider: TextProviderName;
  output: ProviderChatOutput;
  fallbackUsed: boolean;
}

export class GenerateRouter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly defaultModels: Record<TextProviderName, string>,
  ) {}

  routeFor(taskType: TaskType): TextProviderName[] {
    return [...ROUTES[taskType]];
  }

  async generate(input: GenerateRequest, signal: AbortSignal): Promise<GenerateAttemptResult> {
    const taskRoute = this.routeFor(input.taskType);
    // Preserve the legacy automatic route for existing clients. Assistant is
    // the only client with an application-specific default provider.
    const requested =
      input.provider ?? (input.metadata?.application === 'olnoo-assistant' ? 'openai' : 'auto');
    const providers =
      requested === 'auto'
        ? taskRoute
        : input.allowFallback
          ? [requested, ...taskRoute.filter((name) => name !== requested)]
          : [requested];
    let lastError: Error | undefined;

    for (let index = 0; index < providers.length; index += 1) {
      const providerName = providers[index] as TextProviderName;
      const provider = this.registry.get(providerName);
      if (!provider) {
        lastError = new AppError(
          'PROVIDER_NOT_CONFIGURED',
          `Provider "${providerName}" is not configured`,
        );
        if (index < providers.length - 1 && (requested === 'auto' || input.allowFallback)) continue;
        throw lastError;
      }

      const model = index === 0 && input.model ? input.model : this.defaultModels[providerName];
      if (!provider.supportsModel(model)) {
        throw new AppError(
          'MODEL_NOT_FOUND',
          `Provider "${providerName}" does not support model "${model}"`,
        );
      }
      try {
        const output = await this.run(provider, model, input, signal);
        return { provider: providerName, output, fallbackUsed: index > 0 };
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new AppError('PROVIDER_ERROR', 'Provider request failed');
        const canFallback =
          index < providers.length - 1 && (requested === 'auto' || input.allowFallback);
        if (!canFallback || !isFallbackError(error)) throw error;
      }
    }

    throw lastError ?? new AppError('PROVIDER_UNAVAILABLE', 'No provider is available');
  }

  private run(
    provider: AIProvider,
    model: string,
    input: GenerateRequest,
    signal: AbortSignal,
  ): Promise<ProviderChatOutput> {
    return provider.chat(
      {
        model,
        messages: input.messages,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
      },
      { signal },
    );
  }
}

export function isFallbackError(error: unknown): boolean {
  return error instanceof AppError && FALLBACK_ERROR_CODES.has(error.code);
}
