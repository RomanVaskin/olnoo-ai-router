import { z } from 'zod';

export const imageGenerateSizeSchema = z.enum(['1024x1024', '1536x1024', '1024x1536']);
export type ImageGenerateSize = z.infer<typeof imageGenerateSizeSchema>;

export const imageGenerateRequestSchema = z.object({
  /**
   * Calling OLNOO service (e.g. `driveset`). The Router maps `service` + the `image` task to a fixed
   * provider/model/quality preset (src/router/service-presets.ts). Clients cannot pass provider, model or quality
   * (such fields are ignored). Omitted = legacy behavior: the env-configured image model and quality.
   */
  service: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .optional(),
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
