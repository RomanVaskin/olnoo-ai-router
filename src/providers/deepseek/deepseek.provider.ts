import OpenAI from 'openai';
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
import type { FinishReason } from '../../types/chat.js';
import { withTimeout } from '../with-timeout.js';

export interface DeepSeekProviderConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  requestTimeoutMs: number;
  client?: OpenAI;
}

// DeepSeek's OpenAI-compatible API only implements the Chat Completions
// endpoint (no Responses API), so this uses `chat.completions.create`
// instead of the `responses.create` calls the OpenAI provider makes.
export class DeepSeekProvider implements AIProvider {
  readonly name = 'deepseek';
  private readonly client: OpenAI;

  constructor(private readonly config: DeepSeekProviderConfig) {
    this.client =
      config.client ??
      new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.requestTimeoutMs });
  }

  listModels(): ProviderModelInfo[] {
    return [{ id: this.config.model, label: this.config.model }];
  }

  supportsModel(model: string): boolean {
    return model === this.config.model;
  }

  async chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput> {
    const system = input.messages
      .filter((m) => m.role === 'system' || m.role === 'developer')
      .map((m) => m.content)
      .join('\n\n');
    const messages = [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      ...input.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content })),
    ];
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.chat.completions.create(
            {
              model: input.model,
              messages,
              ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {}),
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.topP !== undefined ? { top_p: input.topP } : {}),
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'DeepSeek returned no content');
      }
      return {
        model: response.model,
        content,
        finishReason: mapFinishReason(choice.finish_reason),
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
      };
    } catch (error) {
      throw mapDeepSeekError(error);
    }
  }

  async generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput> {
    if (input.images.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'DeepSeek structured generation does not support image inputs',
      );
    }
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.chat.completions.create(
            {
              model: input.model,
              messages: [{ role: 'user', content: input.prompt }],
              response_format: { type: 'json_object' },
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'DeepSeek returned no structured content');
      }
      return {
        model: response.model,
        content,
        finishReason: mapFinishReason(choice.finish_reason),
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
      };
    } catch (error) {
      throw mapDeepSeekError(error);
    }
  }

  generateImage(
    _input: ProviderImageGenerationInput,
    _options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput> {
    return Promise.reject(
      new AppError('MODEL_NOT_FOUND', 'DeepSeek image generation is not enabled'),
    );
  }
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  if (reason === 'length') return 'length';
  if (reason === 'content_filter') return 'content_filter';
  return 'stop';
}

function normalizeUsage(
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined,
) {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function mapDeepSeekError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AppError('PROVIDER_TIMEOUT', 'DeepSeek request timed out', { cause: error });
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AppError('PROVIDER_UNAVAILABLE', 'DeepSeek network request failed', {
      cause: error,
    });
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new AppError('PROVIDER_AUTH_FAILED', 'DeepSeek authentication failed', {
        cause: error,
      });
    }
    if (error.status === 429) {
      return new AppError('PROVIDER_RATE_LIMITED', 'DeepSeek rate limit exceeded', {
        cause: error,
      });
    }
    if (error.status >= 500) {
      return new AppError('PROVIDER_UNAVAILABLE', 'DeepSeek is temporarily unavailable', {
        cause: error,
      });
    }
    return new AppError('VALIDATION_ERROR', 'DeepSeek rejected the request', { cause: error });
  }
  return new AppError('PROVIDER_UNAVAILABLE', 'DeepSeek network request failed', { cause: error });
}
