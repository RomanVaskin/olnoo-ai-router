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

| Variable                      | Default  | Notes                                                                                               |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `PROVIDER_REQUEST_TIMEOUT_MS` | `120000` | Applied to every outbound provider call; exceeding it returns `504 PROVIDER_TIMEOUT` to the caller. |

## Gemini provider

| Variable         | Default            | Notes                                                                                                                 |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | _(required)_       | From [Google AI Studio](https://aistudio.google.com/apikey). Server-side only — never sent to or readable by clients. |
| `GEMINI_MODELS`  | see `.env.example` | Comma-separated allow-list. Production must include the Architect image and review models.                            |

## Adding configuration for a new provider

Add its variables to the schema in `src/config/env.ts` (fail-fast validation is the whole point — don't read `process.env` directly anywhere else), document them in `.env.example`, and pass them into the provider's constructor from `src/providers/bootstrap.ts`.
