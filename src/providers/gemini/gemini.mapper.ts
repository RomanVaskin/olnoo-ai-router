import type { Content } from '@google/genai';
import type { ChatMessage, FinishReason } from '../../types/chat.js';

export interface GeminiContents {
  contents: Content[];
  systemInstruction?: string;
}

/**
 * Gemini has no "system" role in `contents` — system messages are passed
 * separately as `systemInstruction`, and only "user"/"model" roles remain.
 */
export function toGeminiContents(messages: ChatMessage[]): GeminiContents {
  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    contents,
    ...(systemParts.length > 0 ? { systemInstruction: systemParts.join('\n\n') } : {}),
  };
}

const FINISH_REASON_MAP: Record<string, FinishReason> = {
  STOP: 'stop',
  MAX_TOKENS: 'length',
  SAFETY: 'content_filter',
  RECITATION: 'content_filter',
  BLOCKLIST: 'content_filter',
  PROHIBITED_CONTENT: 'content_filter',
  SPII: 'content_filter',
};

export function toFinishReason(geminiFinishReason: string | undefined): FinishReason {
  if (!geminiFinishReason) {
    return 'stop';
  }
  return FINISH_REASON_MAP[geminiFinishReason] ?? 'error';
}
