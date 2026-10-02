import { AppError } from '../errors/app-error.js';
import type { AIProvider, ProviderChatOutput } from '../providers/provider.interface.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import {
  summarizeUpstreamError,
  type UpstreamErrorSummary,
} from '../observability/upstream-error.js';
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

/** One failed provider attempt, safe to log (no secrets). */
export interface FailedAttempt {
  provider: TextProviderName;
  model: string;
  code: string;
  upstream?: UpstreamErrorSummary;
}

export interface GenerateAttemptResult {
  provider: TextProviderName;
  output: ProviderChatOutput;
  fallbackUsed: boolean;
  /** Attempts that failed before the winner (empty without fallback). */
  failedAttempts: FailedAttempt[];
}

const attemptsByError = new WeakMap<object, FailedAttempt[]>();

/** The failed attempts recorded for an error thrown by `GenerateRouter.generate`. */
export function failedAttemptsOf(error: unknown): FailedAttempt[] {
  return typeof error === 'object' && error !== null ? (attemptsByError.get(error) ?? []) : [];
}

function failed(error: Error, attempts: FailedAttempt[]): Error {
  attemptsByError.set(error, attempts);
  return error;
}

function describeAttempt(provider: TextProviderName, model: string, error: unknown): FailedAttempt {
  const upstream = summarizeUpstreamError(error instanceof AppError ? error.cause : error);
  return {
    provider,
    model,
    code: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
    ...(upstream ? { upstream } : {}),
  };
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
    const attempts: FailedAttempt[] = [];

    for (let index = 0; index < providers.length; index += 1) {
      const providerName = providers[index] as TextProviderName;
      const provider = this.registry.get(providerName);
      if (!provider) {
        lastError = new AppError(
          'PROVIDER_NOT_CONFIGURED',
          `Provider "${providerName}" is not configured`,
        );
        attempts.push(describeAttempt(providerName, 'n/a', lastError));
        if (index < providers.length - 1 && (requested === 'auto' || input.allowFallback)) continue;
        throw failed(lastError, attempts);
      }

      const model = index === 0 && input.model ? input.model : this.defaultModels[providerName];
      if (!provider.supportsModel(model)) {
        const notFound = new AppError(
          'MODEL_NOT_FOUND',
          `Provider "${providerName}" does not support model "${model}"`,
        );
        attempts.push(describeAttempt(providerName, model, notFound));
        throw failed(notFound, attempts);
      }
      try {
        const output = await this.run(provider, model, input, signal);
        return {
          provider: providerName,
          output,
          fallbackUsed: index > 0,
          failedAttempts: attempts,
        };
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new AppError('PROVIDER_ERROR', 'Provider request failed');
        const canFallback =
          index < providers.length - 1 && (requested === 'auto' || input.allowFallback);
        attempts.push(describeAttempt(providerName, model, error));
        if (!canFallback || !isFallbackError(error)) throw failed(lastError, attempts);
      }
    }

    throw failed(
      lastError ?? new AppError('PROVIDER_UNAVAILABLE', 'No provider is available'),
      attempts,
    );
  }

  private async run(
    provider: AIProvider,
    model: string,
    input: GenerateRequest,
    signal: AbortSignal,
  ): Promise<ProviderChatOutput> {
    const base = {
      model,
      messages: input.messages,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
    };
    if (!input.reasoningMode) return provider.chat(base, { signal });
    try {
      return await provider.chat({ ...base, reasoningMode: input.reasoningMode }, { signal });
    } catch (error) {
      // A provider that rejects the reasoning setting (HTTP 400) must not fail the whole request:
      // retry once without it, i.e. with the provider's default reasoning, and say so in the log.
      if (!(error instanceof AppError) || error.code !== 'VALIDATION_ERROR') throw error;
      const output = await provider.chat(base, { signal });
      return { ...output, reasoningApplied: 'dropped: provider rejected the reasoning setting' };
    }
  }
}

export function isFallbackError(error: unknown): boolean {
  return error instanceof AppError && FALLBACK_ERROR_CODES.has(error.code);
}
