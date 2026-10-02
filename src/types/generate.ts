import { z } from 'zod';

export const providerNameSchema = z.enum(['auto', 'anthropic', 'openai', 'gemini']);
export type GenerateProviderName = z.infer<typeof providerNameSchema>;

export const reasoningModeSchema = z.enum(['off', 'low', 'medium', 'high']);
export type ReasoningMode = z.infer<typeof reasoningModeSchema>;

export const taskTypeSchema = z.enum(['code', 'reasoning', 'fast', 'general']);
export type TaskType = z.infer<typeof taskTypeSchema>;

const generateMessageSchema = z.object({
  role: z.enum(['system', 'developer', 'user', 'assistant']),
  content: z.string().min(1).max(32_000),
});

export const generateRequestSchema = z.object({
  taskType: taskTypeSchema.default('general'),
  messages: z.array(generateMessageSchema).min(1).max(64),
  provider: providerNameSchema.optional(),
  model: z.string().min(1).max(128).nullable().default(null),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(32_000).optional(),
  allowFallback: z.boolean().default(false),
  // Optional. Omitted = the provider's default reasoning, exactly as before this field existed.
  reasoningMode: reasoningModeSchema.optional(),
  metadata: z
    .object({
      application: z.string().min(1).max(64),
      // Free-form task label for cost logs, e.g. "seo-relevance-cleanup".
      task: z
        .string()
        .regex(/^[A-Za-z0-9._:-]{1,64}$/)
        .optional(),
      requestId: z
        .string()
        .regex(/^[A-Za-z0-9._:-]{1,128}$/)
        .optional(),
    })
    .optional(),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const generateResponseSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  model: z.string(),
  content: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    // Optional breakdown, present only when the provider reports it.
    cachedInputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
  }),
  latencyMs: z.number().int().nonnegative(),
  fallbackUsed: z.boolean(),
  providerRequestId: z.string().optional(),
});
export type GenerateResponse = z.infer<typeof generateResponseSchema>;
