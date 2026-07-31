import { z } from 'zod';

const MAX_BASE64_IMAGE_LENGTH = 16 * 1024 * 1024;

export const inlineImageSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1).max(MAX_BASE64_IMAGE_LENGTH),
  label: z.string().min(1).max(500).optional(),
});
export type InlineImage = z.infer<typeof inlineImageSchema>;

const multimodalRequestBaseSchema = z.object({
  provider: z.string().min(1).max(64).optional(),
  model: z.string().min(1).max(128),
  prompt: z.string().min(1).max(32_000),
  images: z.array(inlineImageSchema).min(1).max(4),
});

export const imageGenerationRequestSchema = multimodalRequestBaseSchema;
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;

export const imageGenerationResponseSchema = z.object({
  requestId: z.string(),
  provider: z.string(),
  model: z.string(),
  imageBase64: z.string(),
  mimeType: z.string(),
  warnings: z.array(z.string()),
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ImageGenerationResponse = z.infer<typeof imageGenerationResponseSchema>;

export const structuredGenerationRequestSchema = multimodalRequestBaseSchema.extend({
  // Structured generation also serves text-only product workflows.
  // Image generation above still requires at least one source image.
  images: z.array(inlineImageSchema).max(4).default([]),
  jsonSchema: z.record(z.unknown()),
  temperature: z.number().min(0).max(2).optional(),
  expectedFormat: z.literal('json').optional(),
  metadata: z
    .object({
      module: z.string().min(1).max(64),
      projectId: z.string().min(1).max(200).optional(),
    })
    .optional(),
});
export type StructuredGenerationRequest = z.infer<typeof structuredGenerationRequestSchema>;

export const structuredGenerationResponseSchema = z.object({
  requestId: z.string(),
  provider: z.string(),
  model: z.string(),
  content: z.string(),
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type StructuredGenerationResponse = z.infer<typeof structuredGenerationResponseSchema>;
