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

interface AnthropicResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';

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
    const system = input.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const messages = input.messages.filter((message) => message.role !== 'system');
    try {
      return await withTimeout(
        async (timeoutSignal) => {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': this.config.apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: input.model,
              messages,
              max_tokens: input.maxOutputTokens ?? 2_000,
              ...(system ? { system } : {}),
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.topP !== undefined ? { top_p: input.topP } : {}),
            }),
            signal: AbortSignal.any([timeoutSignal, options.signal]),
          });
          if (!response.ok) throw mapProviderHttpError('Anthropic', response.status);
          const body = (await response.json()) as AnthropicResponse;
          const content =
            body.content
              ?.filter((part) => part.type === 'text')
              .map((part) => part.text ?? '')
              .join('') ?? '';
          if (!content) {
            throw new AppError('PROVIDER_INVALID_RESPONSE', 'Anthropic returned no content');
          }
          const inputTokens = body.usage?.input_tokens ?? 0;
          const outputTokens = body.usage?.output_tokens ?? 0;
          return {
            model: body.model ?? input.model,
            content,
            finishReason: body.stop_reason === 'max_tokens' ? 'length' : 'stop',
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          };
        },
        this.config.requestTimeoutMs,
        this.name,
      );
    } catch (error) {
      throw mapProviderNetworkError('Anthropic', error);
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
            content: `${input.prompt}\n\nReturn JSON matching this schema:\n${JSON.stringify(input.jsonSchema)}`,
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
      new AppError('MODEL_NOT_FOUND', 'Anthropic image generation is not enabled'),
    );
  }
}
