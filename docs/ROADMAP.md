# Roadmap

## Stage 1 (this release) — infrastructure foundation

- [x] `AIProvider` contract + `ProviderRegistry` + `ModelRouter`.
- [x] Gemini provider, fully wired end to end.
- [x] `POST /api/chat`, `GET /health`, `GET /providers`, `GET /metrics`.
- [x] Multimodal `POST /api/images/generate` and schema-constrained `POST /api/structured` for OLNOO product backends.
- [x] API key auth, per-key rate limiting, request IDs, structured logging (no message content), Prometheus metrics.
- [x] Zod-validated environment configuration, fail-fast at startup.
- [x] OpenAPI docs generated from the same schemas that validate requests.

OpenAI and Claude/Anthropic text providers were added through the shared
provider contract. Qwen, billing, credits, and end-user authentication remain
out of scope.

## Stage 2 — additional providers

Evaluate a local Qwen deployment as an `AIProvider` implementation. OpenAI and
Anthropic are already implemented for text generation.

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

Per explicit instruction, this repository will not implement user-facing
authentication, billing, credits, or Qwen provider code until a later stage
authorizes it. Do not add these speculatively.
