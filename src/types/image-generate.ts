import { z } from 'zod';

export const imageGenerateSizeSchema = z.enum(['1024x1024', '1536x1024', '1024x1536']);
export type ImageGenerateSize = z.infer<typeof imageGenerateSizeSchema>;

export const imageGenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(32_000),
  size: imageGenerateSizeSchema.optional(),
});
export type ImageGenerateRequest = z.infer<typeof imageGenerateRequestSchema>;

export const imageGenerateResponseSchema = z.object({
  requestId: z.string(),
  provider: z.literal('openai'),
  model: z.string(),
  imageBase64: z.string(),
  mimeType: z.string(),
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ImageGenerateResponse = z.infer<typeof imageGenerateResponseSchema>;
