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
import { anthropicReasoning } from '../reasoning.js';
import { makeUsage } from '../usage.js';
import { withTimeout } from '../with-timeout.js';

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  client?: Anthropic;
}

/**
 * Claude models that reject sampling parameters (`temperature`, `top_p`, `top_k`) with HTTP 400
 * ("`temperature` is deprecated for this model"): Sonnet 5+, Opus 4.7+, Fable, Mythos.
 */
const NO_SAMPLING_MODELS = /^claude-(sonnet-5|opus-5|opus-4-[7-9]|fable|mythos)/;

export function supportsSamplingParams(model: string): boolean {
  return !NO_SAMPLING_MODELS.test(model);
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
      .filter((m) => m.role === 'system' || m.role === 'developer')
      .map((m) => m.content)
      .join('\n\n');
    const messages: Anthropic.MessageParam[] = input.messages.flatMap((message) =>
      message.role === 'user' || message.role === 'assistant'
        ? [{ role: message.role, content: message.content }]
        : [],
    );
    const reasoning = anthropicReasoning(input.model, input.reasoningMode);
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.messages.create(
            {
              model: input.model,
              max_tokens: input.maxOutputTokens ?? 2_000,
              messages,
              ...(system ? { system } : {}),
              ...(supportsSamplingParams(input.model) && input.temperature !== undefined
                ? { temperature: input.temperature }
                : {}),
              ...(supportsSamplingParams(input.model) && input.topP !== undefined
                ? { top_p: input.topP }
                : {}),
              ...reasoning.params,
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
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'Anthropic returned no content');
      return {
        model: response.model,
        content,
        finishReason: response.stop_reason === 'max_tokens' ? 'length' : 'stop',
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
        ...(input.reasoningMode ? { reasoningApplied: reasoning.applied } : {}),
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
              ...(supportsSamplingParams(input.model) && input.temperature !== undefined
                ? { temperature: input.temperature }
                : {}),
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
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'Anthropic returned no structured content');
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

/**
 * Anthropic's `input_tokens` excludes cache reads/writes and `output_tokens` already includes
 * thinking (no separate breakdown is reported), so reasoningTokens stays unset here.
 */
function normalizeUsage(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}) {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return makeUsage({
    promptTokens: usage.input_tokens + cacheRead + (usage.cache_creation_input_tokens ?? 0),
    completionTokens: usage.output_tokens,
    cachedPromptTokens: usage.cache_read_input_tokens ?? undefined,
  });
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
      return new AppError('PROVIDER_AUTH_FAILED', 'Anthropic authentication failed', {
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
