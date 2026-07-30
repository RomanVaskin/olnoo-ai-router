import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../errors/app-error.js';
import type {
  AIProvider,
  ProviderChatInput,
  ProviderChatOptions,
  ProviderChatOutput,
  ProviderModelInfo,
} from '../provider.interface.js';
import { withTimeout } from '../with-timeout.js';
import { toFinishReason, toGeminiContents } from './gemini.mapper.js';
import { describeGeminiModel } from './gemini.models.js';

export interface GeminiProviderConfig {
  apiKey: string;
  enabledModels: string[];
  requestTimeoutMs: number;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  private readonly client: GoogleGenAI;
  private readonly enabledModels: Set<string>;
  private readonly requestTimeoutMs: number;

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.enabledModels = new Set(config.enabledModels);
    this.requestTimeoutMs = config.requestTimeoutMs;
  }

  listModels(): ProviderModelInfo[] {
    return [...this.enabledModels].map(describeGeminiModel);
  }

  supportsModel(model: string): boolean {
    return this.enabledModels.has(model);
  }

  async chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput> {
    const { contents, systemInstruction } = toGeminiContents(input.messages);

    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.models.generateContent({
            model: input.model,
            contents,
            config: {
              ...(systemInstruction ? { systemInstruction } : {}),
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.maxOutputTokens !== undefined
                ? { maxOutputTokens: input.maxOutputTokens }
                : {}),
              ...(input.topP !== undefined ? { topP: input.topP } : {}),
              abortSignal: anySignal([timeoutSignal, options.signal]),
            },
          }),
        this.requestTimeoutMs,
        this.name,
      );

      const text = response.text ?? '';
      const usage = response.usageMetadata;
      const finishReason = response.candidates?.[0]?.finishReason;

      return {
        model: input.model,
        content: text,
        finishReason: toFinishReason(finishReason),
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('PROVIDER_ERROR', 'Gemini provider request failed', { cause: error });
    }
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }
  return signals[0] as AbortSignal;
}
