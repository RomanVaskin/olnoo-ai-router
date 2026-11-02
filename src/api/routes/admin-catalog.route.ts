import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { SERVICE_PRESETS } from '../../router/service-presets.js';
import { createBearerTokenGuard } from '../../security/bearer-token.guard.js';
import type { AppDependencies } from '../dependencies.js';

const providerName = z.enum(['openai', 'anthropic', 'gemini', 'deepseek', 'qwen']);
const statusSchema = z.object({
  name: providerName,
  connected: z.boolean(),
  available: z.boolean().nullable(),
  lastError: z.string().nullable(),
  checkedAt: z.string().datetime().nullable(),
});
const catalogSchema = z.object({
  providers: z.array(
    statusSchema.extend({ models: z.array(z.object({ id: z.string(), label: z.string() })) }),
  ),
  presets: z.array(
    z.object({
      key: z.string(),
      service: z.string(),
      task: z.string(),
      provider: z.string(),
      model: z.string(),
      quality: z.string().optional(),
      reasoningMode: z.string().optional(),
      allowFallback: z.boolean().optional(),
    }),
  ),
});

type Status = z.infer<typeof statusSchema>;
const NAMES = providerName.options;

/** The status is evidence from an explicit real provider call, never inferred from registration.
 * It is intentionally process-local and unknown again after a restart. */
export function registerAdminCatalogRoutes(app: FastifyInstance, deps: AppDependencies): void {
  const guard = createBearerTokenGuard(deps.env.OLNOO_ROUTER_TOKEN);
  const checked = new Map<string, Pick<Status, 'available' | 'lastError' | 'checkedAt'>>();
  const pending = new Map<string, Promise<void>>();
  const status = (name: Status['name']): Status => ({
    name,
    connected: !!deps.registry.get(name),
    available: checked.get(name)?.available ?? null,
    lastError: checked.get(name)?.lastError ?? null,
    checkedAt: checked.get(name)?.checkedAt ?? null,
  });

  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/admin/catalog',
    {
      preHandler: guard,
      schema: { tags: ['Operations'], response: { 200: catalogSchema } },
    },
    () => ({
      providers: NAMES.map((name) => ({
        ...status(name),
        models:
          deps.registry
            .get(name)
            ?.listModels()
            .map(({ id, label }) => ({ id, label })) ?? [],
      })),
      presets: Object.entries(SERVICE_PRESETS).map(([key, preset]) => ({
        key,
        service: key.split('.')[0] ?? '',
        task: key.split('.')[1] ?? '',
        provider: preset.provider,
        model: preset.model,
        ...('quality' in preset ? { quality: preset.quality } : {}),
        ...('reasoningMode' in preset
          ? { reasoningMode: preset.reasoningMode, allowFallback: preset.allowFallback }
          : {}),
      })),
    }),
  );

  app.withTypeProvider<ZodTypeProvider>().post(
    '/v1/admin/providers/:name/check',
    {
      preHandler: guard,
      schema: {
        tags: ['Operations'],
        params: z.object({ name: providerName }),
        response: { 200: statusSchema },
      },
    },
    async (request) => {
      const name = request.params.name;
      const provider = deps.registry.get(name);
      if (!provider) return status(name);
      const model = provider.listModels()[0]?.id;
      if (!model) throw new AppError('MODEL_NOT_FOUND', `No model is configured for ${name}`);
      if (!pending.has(name)) {
        const check = (async () => {
          try {
            await provider.chat(
              { model, messages: [{ role: 'user', content: 'Reply OK.' }], maxOutputTokens: 16 },
              { signal: AbortSignal.timeout(20_000) },
            );
            checked.set(name, {
              available: true,
              lastError: null,
              checkedAt: new Date().toISOString(),
            });
          } catch (error) {
            // Provider adapters map upstream errors to safe codes. Never return provider text or credentials.
            checked.set(name, {
              available: false,
              lastError: error instanceof AppError ? error.code : 'PROVIDER_ERROR',
              checkedAt: new Date().toISOString(),
            });
          } finally {
            pending.delete(name);
          }
        })();
        pending.set(name, check);
      }
      await pending.get(name);
      return status(name);
    },
  );
}
