import { Ajv } from 'ajv';
import { AppError } from '../errors/app-error.js';
import type { ProviderStructuredGenerationOutput } from '../providers/provider.interface.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import type { StructuredGenerationRequest } from '../types/generation.js';
import { RoutingPolicy, type ProviderName } from './routing-policy.js';

const FALLBACK_CODES = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
]);

export interface StructuredAttempt {
  provider: ProviderName;
  errorCode?: string;
}

export interface StructuredRouteResult {
  provider: ProviderName;
  output: ProviderStructuredGenerationOutput;
  parsed: unknown;
  attempts: StructuredAttempt[];
}

export class StructuredRouter {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly models: Record<ProviderName, string>,
    private readonly policy = new RoutingPolicy(),
    private readonly fallbackEnabled = true,
  ) {}

  async generate(
    input: StructuredGenerationRequest,
    signal: AbortSignal,
  ): Promise<StructuredRouteResult> {
    const primary = this.policy.select(input.provider, input.taskType);
    const allowFallback =
      this.fallbackEnabled && (input.allowFallback ?? input.provider === 'auto');
    const chain = allowFallback ? this.policy.chain(primary) : [primary];
    const attempts: StructuredAttempt[] = [];
    let lastError: AppError | undefined;

    for (const providerName of chain.slice(0, 3)) {
      const provider = this.registry.get(providerName);
      if (!provider) {
        lastError = new AppError(
          'PROVIDER_UNAVAILABLE',
          `Provider "${providerName}" is not configured`,
        );
        attempts.push({ provider: providerName, errorCode: lastError.code });
        if (allowFallback) continue;
        throw lastError;
      }
      if (input.images.length > 0 && providerName !== 'gemini') {
        throw new AppError(
          'VALIDATION_ERROR',
          `${providerName} structured image input is not enabled`,
        );
      }
      const model =
        providerName === primary && input.model ? input.model : this.models[providerName];
      if (!provider.supportsModel(model)) {
        throw new AppError(
          'MODEL_NOT_FOUND',
          `Provider "${providerName}" does not support model "${model}"`,
        );
      }
      try {
        const output = await provider.generateStructured(
          {
            model,
            prompt: input.prompt,
            images: input.images,
            jsonSchema: input.jsonSchema,
            ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          },
          { signal },
        );
        const parsed = validateStructuredOutput(output.content, input.jsonSchema, this.ajv);
        attempts.push({ provider: providerName });
        return { provider: providerName, output, parsed, attempts };
      } catch (error) {
        lastError = normalizeError(error);
        attempts.push({ provider: providerName, errorCode: lastError.code });
        if (!allowFallback || !FALLBACK_CODES.has(lastError.code)) throw lastError;
      }
    }

    throw new AppError('ALL_PROVIDERS_FAILED', 'All configured AI providers failed', {
      cause: lastError,
    });
  }
}

function validateStructuredOutput(
  content: string,
  schema: Record<string, unknown>,
  ajv: Ajv,
): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new AppError('PROVIDER_INVALID_RESPONSE', 'Provider returned invalid JSON', {
      cause: error,
    });
  }
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    throw new AppError('VALIDATION_ERROR', 'Invalid JSON Schema', { cause: error });
  }
  if (!validate(parsed)) {
    throw new AppError(
      'STRUCTURED_OUTPUT_VALIDATION_ERROR',
      'Provider output did not match the requested schema',
    );
  }
  return parsed;
}

function normalizeError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError('PROVIDER_ERROR', 'Provider request failed', { cause: error });
}
