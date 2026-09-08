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
import { withTimeout } from '../with-timeout.js';

export interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  imageModel?: string;
  client?: OpenAI;
}

export interface OpenAITextToImageInput {
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536';
}

export interface OpenAITextToImageOutput {
  model: string;
  imageBase64: string;
  mimeType: string;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIProviderConfig) {
    this.client =
      config.client ?? new OpenAI({ apiKey: config.apiKey, timeout: config.requestTimeoutMs });
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
          this.client.responses.create(
            {
              model: input.model,
              input: messages,
              ...(system ? { instructions: system } : {}),
              ...(input.maxOutputTokens !== undefined
                ? { max_output_tokens: input.maxOutputTokens }
                : {}),
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.topP !== undefined ? { top_p: input.topP } : {}),
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      if (!response.output_text) {
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
        );
        if (refused)
          throw new AppError('PROVIDER_SAFETY_REJECTION', 'Provider refused the request');
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'OpenAI returned no content');
      }
      return {
        model: response.model,
        content: response.output_text,
        finishReason: response.status === 'incomplete' ? 'length' : 'stop',
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
      };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }

  async generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput> {
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.responses.create(
            {
              model: input.model,
              input: input.prompt,
              text: {
                format: {
                  type: 'json_schema',
                  name: 'olnoo_structured_output',
                  schema: input.jsonSchema,
                  strict: true,
                },
              },
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      if (!response.output_text) {
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
        );
        if (refused)
          throw new AppError('PROVIDER_SAFETY_REJECTION', 'Provider refused the request');
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'OpenAI returned no structured content');
      }
      return {
        model: response.model,
        content: response.output_text,
        finishReason: response.status === 'incomplete' ? 'length' : 'stop',
        usage: normalizeUsage(response.usage),
        ...(response._request_id ? { providerRequestId: response._request_id } : {}),
      };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }

  generateImage(
    _input: ProviderImageGenerationInput,
    _options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput> {
    return Promise.reject(
      new AppError('MODEL_NOT_FOUND', 'OpenAI image generation is not enabled'),
    );
  }

  /**
   * Text-to-image generation for POST /v1/images/generate. Kept separate from
   * `generateImage` (the multimodal edit path used by /api/images/generate,
   * which requires source images) so that endpoint's behavior is untouched.
   */
  async generateImageFromPrompt(
    input: OpenAITextToImageInput,
    options: ProviderChatOptions,
  ): Promise<OpenAITextToImageOutput> {
    const model = this.config.imageModel ?? 'gpt-image-1-mini';
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.images.generate(
            {
              model,
              prompt: input.prompt,
              ...(input.size ? { size: input.size } : {}),
              n: 1,
              output_format: 'png',
            },
            { signal: AbortSignal.any([timeoutSignal, options.signal]) },
          ),
        this.config.requestTimeoutMs,
        this.name,
      );
      const image = response.data?.[0];
      if (!image?.b64_json) {
        throw new AppError('INVALID_PROVIDER_RESPONSE', 'OpenAI returned no image data');
      }
      return { model, imageBase64: image.b64_json, mimeType: 'image/png' };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }
}

function normalizeUsage(
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | undefined,
) {
  return {
    promptTokens: usage?.input_tokens ?? 0,
    completionTokens: usage?.output_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function mapOpenAIError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AppError('PROVIDER_TIMEOUT', 'OpenAI request timed out', { cause: error });
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AppError('PROVIDER_UNAVAILABLE', 'OpenAI network request failed', { cause: error });
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new AppError('PROVIDER_AUTH_FAILED', 'OpenAI authentication failed', {
        cause: error,
      });
    }
    if (error.status === 429) {
      return new AppError('PROVIDER_RATE_LIMITED', 'OpenAI rate limit exceeded', { cause: error });
    }
    if (error.status >= 500) {
      return new AppError('PROVIDER_UNAVAILABLE', 'OpenAI is temporarily unavailable', {
        cause: error,
      });
    }
    return new AppError('VALIDATION_ERROR', 'OpenAI rejected the request', { cause: error });
  }
  return new AppError('PROVIDER_UNAVAILABLE', 'OpenAI network request failed', { cause: error });
}
