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
import { mapProviderHttpError, mapProviderNetworkError } from '../http-errors.js';
import { withTimeout } from '../with-timeout.js';

interface OpenAIResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  constructor(
    private readonly config: { apiKey: string; model: string; requestTimeoutMs: number },
  ) {}

  listModels(): ProviderModelInfo[] {
    return [{ id: this.config.model, label: this.config.model }];
  }

  supportsModel(model: string): boolean {
    return model === this.config.model;
  }

  async chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput> {
    try {
      return await withTimeout(
        async (timeoutSignal) => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.config.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: input.model,
              messages: input.messages,
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.maxOutputTokens !== undefined
                ? { max_completion_tokens: input.maxOutputTokens }
                : {}),
              ...(input.topP !== undefined ? { top_p: input.topP } : {}),
            }),
            signal: AbortSignal.any([timeoutSignal, options.signal]),
          });
          if (!response.ok) throw mapProviderHttpError('OpenAI', response.status);
          const body = (await response.json()) as OpenAIResponse;
          const content = body.choices?.[0]?.message?.content;
          if (typeof content !== 'string') {
            throw new AppError('PROVIDER_INVALID_RESPONSE', 'OpenAI returned no content');
          }
          return {
            model: body.model ?? input.model,
            content,
            finishReason: body.choices?.[0]?.finish_reason === 'length' ? 'length' : 'stop',
            usage: {
              promptTokens: body.usage?.prompt_tokens ?? 0,
              completionTokens: body.usage?.completion_tokens ?? 0,
              totalTokens: body.usage?.total_tokens ?? 0,
            },
          };
        },
        this.config.requestTimeoutMs,
        this.name,
      );
    } catch (error) {
      throw mapProviderNetworkError('OpenAI', error);
    }
  }

  async generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput> {
    const output = await this.chat(
      {
        model: input.model,
        messages: [
          {
            role: 'user',
            content: `${input.prompt}\n\nJSON Schema:\n${JSON.stringify(input.jsonSchema)}`,
          },
        ],
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      },
      options,
    );
    return { model: output.model, content: output.content };
  }

  generateImage(
    _input: ProviderImageGenerationInput,
    _options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput> {
    return Promise.reject(
      new AppError('MODEL_NOT_FOUND', 'OpenAI image generation is not enabled'),
    );
  }
}
