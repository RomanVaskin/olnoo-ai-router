import 'dotenv/config';
import { z } from 'zod';

const commaSeparatedList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1).default('olnoo-ai-router'),
  PORT: z.coerce.number().int().positive().default(3010),
  HOST: z.string().min(1).default('127.0.0.1'),
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(32 * 1024 * 1024),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Security
  API_KEYS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  OLNOO_ROUTER_TOKEN: z.string().min(32),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  TRUST_PROXY: z.coerce.boolean().default(false),

  // Provider request behavior
  PROVIDER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  AI_DEFAULT_PROVIDER: z.enum(['gemini', 'openai', 'anthropic']).default('gemini'),
  AI_FALLBACK_ENABLED: booleanString.default('true'),
  CODE_AGENT_ENABLED: booleanString.default('true'),
  CODE_AGENT_WORKTREE_ROOT: z.string().min(1).default('/opt/olnoo/worktrees'),
  CODE_AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(900_000),
  CODE_AGENT_MAX_LOG_BYTES: z.coerce.number().int().positive().default(1_000_000),
  CODE_AGENT_MAX_DIFF_BYTES: z.coerce.number().int().positive().default(2_000_000),
  CODE_AGENT_MAX_CHANGED_FILES: z.coerce.number().int().positive().default(100),

  // Default text models (official provider IDs, centrally overrideable).
  OPENAI_DEFAULT_MODEL: z.string().min(1).default('gpt-5.4-mini'),
  ANTHROPIC_DEFAULT_MODEL: z.string().min(1).default('claude-sonnet-5'),
  GEMINI_DEFAULT_MODEL: z.string().min(1).default('gemini-3.5-flash'),
  OPENAI_MODEL: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),

  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),

  // Gemini provider
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODELS: commaSeparatedList.default('gemini-3.5-flash'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return {
    ...parsed.data,
    PROVIDER_REQUEST_TIMEOUT_MS:
      parsed.data.AI_PROVIDER_TIMEOUT_MS ?? parsed.data.PROVIDER_REQUEST_TIMEOUT_MS,
    OPENAI_DEFAULT_MODEL: parsed.data.OPENAI_MODEL ?? parsed.data.OPENAI_DEFAULT_MODEL,
    ANTHROPIC_DEFAULT_MODEL: parsed.data.ANTHROPIC_MODEL ?? parsed.data.ANTHROPIC_DEFAULT_MODEL,
    GEMINI_DEFAULT_MODEL: parsed.data.GEMINI_MODEL ?? parsed.data.GEMINI_DEFAULT_MODEL,
    API_KEYS: [...new Set([...parsed.data.API_KEYS, parsed.data.OLNOO_ROUTER_TOKEN])],
  };
}

export const env = loadEnv();
