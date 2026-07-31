import { FinishReason, GoogleGenAI, Modality } from '@google/genai';
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
      throw mapGeminiError(error);
    }
  }

  async generateImage(
    input: ProviderImageGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput> {
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.models.generateContent({
            model: input.model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: input.prompt },
                  ...input.images.flatMap((image) => [
                    ...(image.label ? [{ text: image.label }] : []),
                    { inlineData: { mimeType: image.mimeType, data: image.data } },
                  ]),
                ],
              },
            ],
            config: {
              responseModalities: [Modality.IMAGE],
              abortSignal: anySignal([timeoutSignal, options.signal]),
            },
          }),
        this.requestTimeoutMs,
        this.name,
      );

      assertNotRejected(
        response.promptFeedback?.blockReason,
        response.candidates?.[0]?.finishReason,
      );
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const image = parts.find((part) => part.inlineData?.data)?.inlineData;
      if (!image?.data) {
        throw new AppError('PROVIDER_INVALID_RESPONSE', 'Provider returned no image');
      }
      return {
        model: input.model,
        imageBase64: image.data,
        mimeType: image.mimeType ?? 'image/png',
        warnings: parts.flatMap((part) =>
          typeof part.text === 'string' && part.text.trim() ? [part.text] : [],
        ),
      };
    } catch (error) {
      throw mapGeminiError(error);
    }
  }

  async generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput> {
    try {
      const response = await withTimeout(
        (timeoutSignal) =>
          this.client.models.generateContent({
            model: input.model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: input.prompt },
                  ...input.images.flatMap((image) => [
                    ...(image.label ? [{ text: image.label }] : []),
                    { inlineData: { mimeType: image.mimeType, data: image.data } },
                  ]),
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: input.jsonSchema,
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              abortSignal: anySignal([timeoutSignal, options.signal]),
            },
          }),
        this.requestTimeoutMs,
        this.name,
      );
      assertNotRejected(
        response.promptFeedback?.blockReason,
        response.candidates?.[0]?.finishReason,
      );
      if (!response.text) {
        throw new AppError('PROVIDER_INVALID_RESPONSE', 'Provider returned no structured content');
      }
      return { model: input.model, content: response.text };
    } catch (error) {
      throw mapGeminiError(error);
    }
  }
}

const REJECTED_FINISH_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

function assertNotRejected(
  blockReason: string | undefined,
  finishReason: string | undefined,
): void {
  if (blockReason || (finishReason && REJECTED_FINISH_REASONS.has(finishReason))) {
    throw new AppError('PROVIDER_SAFETY_REJECTION', 'Provider rejected the request for safety');
  }
}

function mapGeminiError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) {
    const message = error instanceof Error ? error.message : '';
    return /limit:\s*0\b/i.test(message)
      ? new AppError('PROVIDER_QUOTA_EXHAUSTED', 'Provider quota is exhausted', { cause: error })
      : new AppError('PROVIDER_RATE_LIMITED', 'Provider rate limit exceeded', { cause: error });
  }
  if (status === 401 || status === 403) {
    return new AppError('PROVIDER_AUTHENTICATION_ERROR', 'Gemini authentication failed', {
      cause: error,
    });
  }
  if (status === 402) {
    return new AppError('PROVIDER_BILLING_ERROR', 'Gemini billing is unavailable', {
      cause: error,
    });
  }
  if (typeof status === 'number' && status >= 500) {
    return new AppError('PROVIDER_UNAVAILABLE', 'Gemini is temporarily unavailable', {
      cause: error,
    });
  }
  return new AppError('PROVIDER_UNAVAILABLE', 'Gemini network request failed', { cause: error });
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }
  return signals[0] as AbortSignal;
}
