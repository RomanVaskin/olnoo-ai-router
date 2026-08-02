# Configuration

All configuration is environment variables, validated at startup by `src/config/env.ts` (Zod). An invalid or missing required value throws immediately and the process never binds a port — misconfiguration fails loudly at deploy time, not silently at request time.

Copy [`../.env.example`](../.env.example) to `.env` to get started.

## Service

| Variable           | Default           | Notes                                                                           |
| ------------------ | ----------------- | ------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development`     | `development` \| `test` \| `production`. Controls pretty-printed vs. JSON logs. |
| `SERVICE_NAME`     | `olnoo-ai-router` | Included in every log line and the `GET /health` response.                      |
| `PORT`             | `8080`            |                                                                                 |
| `HOST`             | `0.0.0.0`         |                                                                                 |
| `BODY_LIMIT_BYTES` | `33554432`        | Maximum JSON request size. Sized for base64 multimodal requests.                |
| `LOG_LEVEL`        | `info`            | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent`.       |

## Security

| Variable               | Default      | Notes                                                                                                                                                                                                                    |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_KEYS`             | _(required)_ | Comma-separated list of API keys accepted in the `x-api-key` header. Compared with a constant-time comparison. Rotate by adding the new key alongside the old one, then removing the old one once callers have migrated. |
| `RATE_LIMIT_MAX`       | `60`         | Requests allowed per key (or per IP, if no key) within `RATE_LIMIT_WINDOW_MS`.                                                                                                                                           |
| `RATE_LIMIT_WINDOW_MS` | `60000`      |                                                                                                                                                                                                                          |
| `TRUST_PROXY`          | `false`      | Set `true` only when running behind a trusted reverse proxy, so `request.ip` reflects the real client.                                                                                                                   |

## Provider request behavior

| Variable                      | Default | Notes                                                                                               |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `PROVIDER_REQUEST_TIMEOUT_MS` | `60000` | Applied to every outbound provider call; exceeding it returns `504 PROVIDER_TIMEOUT` to the caller. |

`AI_PROVIDER_TIMEOUT_MS` is a compatibility override for
`PROVIDER_REQUEST_TIMEOUT_MS`. Structured generation also uses
`AI_DEFAULT_PROVIDER` (`gemini`, `openai`, or `anthropic`; default `gemini`) and
`AI_FALLBACK_ENABLED` (`true` by default). `ANTHROPIC_MODEL`, `OPENAI_MODEL`,
and `GEMINI_MODEL` override their corresponding `*_DEFAULT_MODEL` values when
set.

OpenAI uses the official Responses API with `OPENAI_API_KEY`; Anthropic uses
the official Messages API with `ANTHROPIC_API_KEY`. Empty keys leave that
provider unregistered without preventing Gemini or the Router from starting.

## Gemini provider

| Variable         | Default            | Notes                                                                                                                 |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | _(required)_       | From [Google AI Studio](https://aistudio.google.com/apikey). Server-side only — never sent to or readable by clients. |
| `GEMINI_MODELS`  | see `.env.example` | Comma-separated allow-list. Production must include the Architect image and review models.                            |

## Text providers

| Variable            | Default           | Notes                                      |
| ------------------- | ----------------- | ------------------------------------------ |
| `OPENAI_API_KEY`    | empty             | Server-side only.                          |
| `OPENAI_MODEL`      | `gpt-5.4-mini`    | Default OpenAI model for text generation.  |
| `ANTHROPIC_API_KEY` | empty             | Server-side only.                          |
| `ANTHROPIC_MODEL`   | `claude-sonnet-5` | Default Anthropic model for text requests. |

## Adding configuration for a new provider

Add its variables to the schema in `src/config/env.ts` (fail-fast validation is the whole point — don't read `process.env` directly anywhere else), document them in `.env.example`, and pass them into the provider's constructor from `src/providers/bootstrap.ts`.

# Multi-provider text routing

- `OLNOO_ROUTER_TOKEN` — internal Bearer token (minimum 32 characters).
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — server-side provider credentials.
- `ANTHROPIC_DEFAULT_MODEL`, `OPENAI_DEFAULT_MODEL`, `GEMINI_DEFAULT_MODEL` — centralized defaults.
- `PROVIDER_REQUEST_TIMEOUT_MS` — per-provider timeout; defaults to 60000.
- `AI_DEFAULT_PROVIDER` — primary provider for general structured requests in auto mode.
- `AI_FALLBACK_ENABLED` — enables retryable structured-request fallback chains.
- `HOST` and `PORT` default to `127.0.0.1` and `3010`.
- `API_KEYS` remains available for backward-compatible `/api/*` consumers. The internal Router token is also accepted by those legacy routes.
