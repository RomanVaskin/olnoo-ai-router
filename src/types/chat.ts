import { z } from 'zod';

export const chatRoleSchema = z.enum(['system', 'developer', 'user', 'assistant']);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string().min(1).max(32_000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  provider: z.string().min(1).max(64).optional(),
  model: z.string().min(1).max(128),
  messages: z.array(chatMessageSchema).min(1).max(64),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().max(32_000).optional(),
  topP: z.number().min(0).max(1).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type ChatUsage = z.infer<typeof chatUsageSchema>;

export const finishReasonSchema = z.enum(['stop', 'length', 'content_filter', 'error']);
export type FinishReason = z.infer<typeof finishReasonSchema>;

export const chatResponseSchema = z.object({
  requestId: z.string(),
  provider: z.string(),
  model: z.string(),
  content: z.string(),
  finishReason: finishReasonSchema,
  usage: chatUsageSchema,
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    retryable: z.boolean().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
