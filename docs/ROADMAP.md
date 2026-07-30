# Roadmap

## Stage 1 (this release) — infrastructure foundation

- [x] `AIProvider` contract + `ProviderRegistry` + `ModelRouter`.
- [x] Gemini provider, fully wired end to end.
- [x] `POST /api/chat`, `GET /health`, `GET /providers`, `GET /metrics`.
- [x] API key auth, per-key rate limiting, request IDs, structured logging (no message content), Prometheus metrics.
- [x] Zod-validated environment configuration, fail-fast at startup.
- [x] OpenAPI docs generated from the same schemas that validate requests.

Explicitly **not** built in Stage 1, by direct instruction: OpenAI, Claude/Anthropic, Qwen, or any provider beyond Gemini; billing; credits; end-user authentication.

## Stage 2 — additional providers

Add Anthropic, OpenAI, and a local Qwen deployment as `AIProvider` implementations (see `docs/PROVIDERS.md`). No changes expected to `src/api/`, `src/router/`, `src/security/`, or `src/middleware/` — that boundary is the point of Stage 1's design and is the acceptance criterion for Stage 2.

Likely also in scope: an explicit routing mode (`Auto`/`Fast`/`Balanced`/`Maximum Quality`, per `OLNOO_PLAYBOOK.md` §6) once there's more than one provider to choose between.

## Later stages (order not yet committed)

- **OLNOO Credits / Billing** — per-tenant usage tracking and cost attribution. Needs a persisted attempt/usage record (`OLNOO_PLAYBOOK.md` §13: attempt identifiers, duplicate-request protection, cost tracking), which this stateless Stage 1 service deliberately does not have yet.
- **User quotas** — per-tenant or per-product rate/spend limits, layered on top of Credits/Billing.
- **Fallback models** — if a provider/model fails or times out, retry against a configured alternate. Extends `ModelRouter.resolve`.
- **AI routing rules** — cost-, latency-, or quality-aware model selection beyond explicit-provider-or-first-match. Also extends `ModelRouter`.
- **Caching** — response caching keyed on `(provider, model, messages, params)` for identical, cacheable requests.
- **Streaming** — `POST /api/chat` currently returns a single complete response; token-streaming (SSE or chunked) would add a parallel `AIProvider.stream` method without breaking the existing `chat()` contract.
- **Vector search / RAG / memory** — out of scope for this router specifically; likely a separate OLNOO shared service that calls _into_ this router for the underlying model calls, per `OLNOO_PLAYBOOK.md` §9–10.

## Non-goals

Per explicit instruction, this repository will not implement user-facing authentication, billing, or credits, and will not add OpenAI/Claude/Qwen provider code until a later stage authorizes it. Do not add these speculatively.
