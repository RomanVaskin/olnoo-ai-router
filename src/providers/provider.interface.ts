import type { ChatMessage, ChatUsage, FinishReason } from '../types/chat.js';

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
}

export interface ProviderChatOptions {
  signal: AbortSignal;
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
}
