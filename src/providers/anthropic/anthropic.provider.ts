import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../../errors/app-error.js';
import type {
  AIProvider,
  ProviderChatInput,
  ProviderChatOptions,
  ProviderChatOutput,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
  ProviderModelInfo,
  ProviderStructuredGenerationInput,
  ProviderStructuredGenerationOutput,
} from '../provider.interface.js';
import { withTimeout } from '../with-timeout.js';

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  client?: Anthropic;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicProviderConfig) {
    this.client =
      config.client ?? new Anthropic({ apiKey: config.apiKey, timeout: config.requestTimeoutMs });
  }

  listModels(): ProviderModelInfo[] {
    return [{ id: this.config.model, label: this.config.model }];
  }

  supportsModel(model: string): boolean {
    return model === this.config.model;
  }

  async chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput> {
    const system = input.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = input.messages.filter((m) => m.role !== 'system');
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.messages.create(
            {
              model: input.model,
              max_tokens: input.maxOutputTokens ?? 2_000,
              messages,
              ...(system ? { system } : {}),
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.topP !== undefined ? { top_p: input.topP } : {}),
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      if (response.stop_reason === 'refusal') {
        throw new AppError('PROVIDER_SAFETY_REJECTION', 'Provider refused the request');
      }
      const content = response.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
      if (!content)
        throw new AppError('PROVIDER_INVALID_RESPONSE', 'Anthropic returned no content');
      return {
        model: response.model,
        content,
        finishReason: response.stop_reason === 'max_tokens' ? 'length' : 'stop',
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
      };
    } catch (error) {
      throw mapAnthropicError(error);
    }
  }

  async generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput> {
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.messages.create(
            {
              model: input.model,
              max_tokens: 2_000,
              messages: [{ role: 'user', content: input.prompt }],
              output_config: {
                format: { type: 'json_schema', schema: input.jsonSchema },
              },
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      if (response.stop_reason === 'refusal') {
        throw new AppError('PROVIDER_SAFETY_REJECTION', 'Provider refused the request');
      }
      const content = response.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
      if (!content)
        throw new AppError('PROVIDER_INVALID_RESPONSE', 'Anthropic returned no structured content');
      return {
        model: response.model,
        content,
        finishReason: response.stop_reason === 'max_tokens' ? 'length' : 'stop',
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
      };
    } catch (error) {
      throw mapAnthropicError(error);
    }
  }

  generateImage(
    _input: ProviderImageGenerationInput,
    _options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput> {
    return Promise.reject(
      new AppError('MODEL_NOT_FOUND', 'Anthropic image generation is not enabled'),
    );
  }
}

function normalizeUsage(usage: { input_tokens: number; output_tokens: number }) {
  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

function mapAnthropicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError('PROVIDER_TIMEOUT', 'Anthropic request timed out', { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError('PROVIDER_UNAVAILABLE', 'Anthropic network request failed', {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new AppError('PROVIDER_AUTHENTICATION_ERROR', 'Anthropic authentication failed', {
        cause: error,
      });
    }
    if (error.status === 429) {
      return new AppError('PROVIDER_RATE_LIMITED', 'Anthropic rate limit exceeded', {
        cause: error,
      });
    }
    if (error.status >= 500) {
      return new AppError('PROVIDER_UNAVAILABLE', 'Anthropic is temporarily unavailable', {
        cause: error,
      });
    }
    return new AppError('VALIDATION_ERROR', 'Anthropic rejected the request', { cause: error });
  }
  return new AppError('PROVIDER_UNAVAILABLE', 'Anthropic network request failed', { cause: error });
}
