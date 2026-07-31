# Architecture

## Product request flows

Architect uses the image and multimodal structured endpoints. Studio uses the
same provider-neutral `POST /api/structured` endpoint in text-only mode for
schema-constrained change plans:

```text
Studio OLNOO
    │ HTTP JSON + x-api-key + x-request-id
    ▼
OLNOO AI Router (/api/structured)
    │ provider SDK
    ▼
Gemini
```

Text-only structured requests omit images or send `images: []`. Optional safe
metadata identifies `module: "studio"` and `projectId`; prompts, project
secrets, `.env` contents and API keys are never logged.

## Design goals

1. **One contract, many vendors.** Nothing outside `src/providers/<vendor>/` may know how a specific AI vendor's SDK, auth, or wire format works. Every other layer depends only on the `AIProvider` interface.
2. **No `if (provider === "...")` outside the registry.** Provider selection is a lookup (`ProviderRegistry` / `ModelRouter`), never a conditional scattered through route or business logic.
3. **Fail fast, fail safe.** Invalid configuration throws at startup, before the process binds a port. Upstream provider errors are always wrapped into a safe, generic `AppError` before they can reach a caller.
4. **Stateless by design.** This service holds no database, no session, no per-tenant state. It is a pure request/response router — deliberately, so Stage 2+ (billing, quotas, memory) can be layered on without a rewrite.

## Request flow

```
Client (an OLNOO product's backend)
  │  POST /api/chat | /api/images/generate | /api/structured
  ▼
Fastify instance (src/app.ts)
  │  onRequest:  rate limiting (per API key)          [src/security/rate-limit.ts]
  │  genReqId:   request ID assignment/propagation    [src/middleware/request-id.ts]
  │  preHandler: API key authentication                [src/security/api-key.guard.ts]
  │  schema:     Zod validation of body/response        [src/types/chat.ts]
  ▼
Route handler (src/api/routes/chat.route.ts)
  │  resolve(provider?, model) ─────────────────────►  ModelRouter [src/router/model-router.ts]
  │                                                        │
  │                                                        ▼
  │                                                  ProviderRegistry [src/providers/provider.registry.ts]
  │                                                        │  (which AIProvider supports this model?)
  │                                                        ▼
  │  provider.chat/generateImage/generateStructured ─► AIProvider implementation
  │                                                     e.g. GeminiProvider [src/providers/gemini/]
  │                                                        │  vendor SDK call, with timeout + abort
  │                                                        ▼
  │  ◄─────────────────────────────────────────────  ProviderChatOutput (vendor-neutral shape)
  ▼
Structured response (ChatResponse) + metrics + structured log (no message content)
```

Errors thrown anywhere in this chain are caught by the single `setErrorHandler` in `src/middleware/error-handler.ts`, normalized to `AppError`, and serialized as `{ error: { code, message, requestId } }`. A caller never sees a raw provider error, stack trace, or internal exception shape.

## Module map

| Directory            | Responsibility                                                                                                                                                                  | Depends on                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/types/`         | Cross-cutting request/response contracts (Zod schemas + inferred types) shared by the API layer and providers.                                                                  | nothing internal                                                |
| `src/errors/`        | `AppError` — the one error type allowed to cross the API boundary, with a stable `code` → HTTP status mapping.                                                                  | nothing internal                                                |
| `src/config/`        | Zod-validated environment loading (`env.ts`), package metadata (`package-info.ts`).                                                                                             | `types/` (none directly)                                        |
| `src/providers/`     | The `AIProvider` contract, the `ProviderRegistry`, shared provider utilities (`with-timeout.ts`), and one subdirectory per vendor (`gemini/`).                                  | `types/`, `errors/`                                             |
| `src/router/`        | `ModelRouter` — resolves a `{ provider?, model }` request to a concrete `AIProvider`. The intended home for future routing policy (fallback chains, cost-aware selection).      | `providers/`, `errors/`                                         |
| `src/security/`      | API key authentication guard, rate limiting.                                                                                                                                    | `errors/`                                                       |
| `src/middleware/`    | Request ID generation/propagation, the centralized error handler.                                                                                                               | `errors/`, `types/`                                             |
| `src/observability/` | Structured logging config (pino, with redaction) and Prometheus metrics (prom-client).                                                                                          | `config/`                                                       |
| `src/api/`           | Route registration and the `AppDependencies` shape routes receive. Route handlers are the only place that composes router + provider + metrics + logging into an HTTP response. | everything above                                                |
| `src/app.ts`         | Wires Fastify: plugins, hooks, dependency construction, route registration.                                                                                                     | `api/`, `security/`, `observability/`, `providers/bootstrap.ts` |
| `src/server.ts`      | Process entrypoint — listens, handles graceful shutdown.                                                                                                                        | `app.ts`                                                        |

## The provider extension point

Adding a new vendor (Anthropic, OpenAI, Qwen, Mistral, DeepSeek, a local model, ...) in a future stage means:

1. Create `src/providers/<vendor>/<vendor>.provider.ts` implementing `AIProvider` (see `src/providers/provider.interface.ts`).
2. Add one line to `src/providers/bootstrap.ts`: `registry.register(new XProvider({ ... }))`.
3. Add the vendor's env vars to `src/config/env.ts` and `.env.example`.

No route, no middleware, no existing provider file changes. This is enforced structurally, not by convention: routes and the router only ever import `AIProvider`, `ProviderRegistry`, and `ModelRouter` — never a concrete provider class.

Architect OLNOO calls only the Router. Its product routes continue to own
authentication, paid-attempt persistence, prompt construction, concurrency,
and result validation; provider credentials, SDK calls, provider timeout, and
provider error normalization live only here.

## Why Fastify + Zod + fastify-type-provider-zod

- **Fastify**: schema-first validation and serialization are built in and fast; the plugin/hook lifecycle (`onRequest`, `preHandler`, `onSend`, `onResponse`) maps cleanly onto rate limiting, auth, request IDs, and metrics without ad-hoc Express-style middleware chains.
- **Zod**: a single schema (`src/types/chat.ts`) is simultaneously the runtime validator, the TypeScript type (via `z.infer`), and — through `fastify-type-provider-zod` — the OpenAPI schema served at `/docs`. One source of truth, not three.

## Observability

- **Logs** (`src/observability/logger.ts`): structured JSON via pino, one line per request plus one summary line per chat completion with `{ provider, model, latencyMs, status }`. Message/prompt/completion content is redacted defensively, in addition to never being logged in the first place.
- **Metrics** (`src/observability/metrics.ts`): Prometheus exposition at `GET /metrics` — default Node.js process metrics, an HTTP request duration histogram, and chat-specific counters/histograms labeled by `provider`, `model`, and `status`.
- **Request IDs** (`src/middleware/request-id.ts`): every response carries `x-request-id`, either generated or propagated from an inbound `x-request-id` header for cross-service trace correlation.

## Extensibility already accounted for

The interfaces in this codebase are shaped so the following can be added without touching the core:

- **Fallback / cost-aware routing** — extend `ModelRouter.resolve` (already the single routing decision point).
- **Streaming** — `AIProvider.chat` returns a single `ProviderChatOutput` today; a parallel `AIProvider.stream` method can be added to the interface without breaking existing providers.
- **Caching** — a decorator around `AIProvider` (or a hook in the route handler) keyed on `(provider, model, messages)`.
- **Billing / credits / quotas** — a `preHandler` alongside `api-key.guard.ts`, or a hook after successful `provider.chat()` calls, using the same `AppDependencies` the routes already receive.
- **Vector search / RAG / memory** — new services entirely, called by products _before_ they call this router; out of scope for the router itself.

See [`docs/ROADMAP.md`](./ROADMAP.md) for what's explicitly deferred and why.
