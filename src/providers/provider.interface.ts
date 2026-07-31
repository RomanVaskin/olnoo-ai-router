import type { ChatMessage, ChatUsage, FinishReason } from '../types/chat.js';
import type { InlineImage } from '../types/generation.js';

export interface ProviderModelInfo {
  id: string;
  label: string;
  contextWindow?: number;
}

export interface ProviderChatInput {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
}

export interface ProviderChatOutput {
  model: string;
  content: string;
  finishReason: FinishReason;
  usage: ChatUsage;
  providerRequestId?: string;
}

export interface ProviderChatOptions {
  signal: AbortSignal;
}

export interface ProviderImageGenerationInput {
  model: string;
  prompt: string;
  images: InlineImage[];
}

export interface ProviderImageGenerationOutput {
  model: string;
  imageBase64: string;
  mimeType: string;
  warnings: string[];
}

export interface ProviderStructuredGenerationInput {
  model: string;
  prompt: string;
  images: InlineImage[];
  jsonSchema: Record<string, unknown>;
  temperature?: number;
}

export interface ProviderStructuredGenerationOutput {
  model: string;
  content: string;
  usage: ChatUsage;
  finishReason: FinishReason;
  providerRequestId?: string;
}

/**
 * The single contract every AI vendor integration must implement.
 *
 * Nothing outside a provider's own directory may know how a specific
 * vendor's SDK, auth, or wire format works — the router and API layers only
 * ever depend on this interface, so adding Anthropic/OpenAI/Qwen/etc. later
 * means writing one new file, not touching existing code or branching on
 * provider name anywhere else.
 */
export interface AIProvider {
  readonly name: string;

  listModels(): ProviderModelInfo[];

  supportsModel(model: string): boolean;

  chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput>;

  generateImage(
    input: ProviderImageGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput>;

  generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput>;
}
