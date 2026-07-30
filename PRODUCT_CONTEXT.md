# OLNOO Product Context

Version: 0.1.0
Status: MVP (Stage 1)
Last Updated: 2026-07-30

## Product

- Name: `olnoo-ai-router`
- Repository: `RomanVaskin/olnoo-ai-router`
- Owner: Roman Vaskin
- Product stage: `MVP` — infrastructure foundation, Stage 1 of a multi-stage rollout.

## Purpose

`olnoo-ai-router` is the single entry point to every AI model used across the OLNOO platform. No OLNOO module may call Gemini, OpenAI, Anthropic, or any other model provider directly — every call goes through this router.

Target users are **other OLNOO services and modules**, not end users. The primary journey is: a product's backend sends a `POST /api/chat` request with a model, message list, and an OLNOO-issued API key; the router authenticates, resolves a provider, forwards the request, and returns a normalized response.

Success criteria for Stage 1:

- One vendor-neutral `AIProvider` contract that every future provider implements.
- Gemini fully working end-to-end through that contract.
- API key auth, rate limiting, request IDs, structured logging, and health/metrics observability in place.
- Adding a second provider requires writing one new file, not touching routing, API, or security code.

Non-goals for Stage 1 (see `docs/ROADMAP.md`): billing, credits, per-user quotas, end-user auth, streaming, caching, fallback routing, RAG, memory.

## Shared OLNOO capabilities

This repository **is** the shared "AI Gateway and provider adapters" capability described in `OLNOO_PLAYBOOK.md` §3. It does not consume other shared OLNOO services yet; it does not depend on OLNOO identity/org/billing systems in Stage 1 (see Restricted Actions below).

## Product-specific capabilities

- `POST /api/chat` — unified chat completion endpoint.
- `GET /providers` — discovery of registered providers and their models.
- `GET /health` — liveness/readiness probe.
- `GET /metrics` — Prometheus-format operational metrics.
- `GET /docs` — OpenAPI/Swagger UI.

## Architecture and stack

TypeScript (strict), Node.js 22+, Fastify 5, Zod for validation and OpenAPI generation, pino for structured logging, prom-client for metrics, Docker/Docker Compose for deployment. See `docs/ARCHITECTURE.md` for the full breakdown and the provider extension point.

Approved provider SDK for Stage 1: `@google/genai` (Gemini). No other provider SDKs are installed.

## AI configuration

- Provider: Gemini only (Stage 1). Models enabled per deployment via `GEMINI_MODELS`.
- No routing modes (Auto/Fast/Balanced/Maximum Quality) yet — a single explicit-or-first-match resolution in `src/router/model-router.ts`. See `docs/ROADMAP.md` for planned routing rules.
- No prompts, skills, knowledge sources, or evaluation datasets — this service is a transport/routing layer, not a reasoning layer. Products define their own prompts and send them as messages.

## Data, privacy, and safety

- No tenant/user data is persisted by this service. Requests are stateless.
- Message content (`messages[].content`) is never logged — see the pino redaction config in `src/observability/logger.ts` and `docs/SECURITY.md`.
- No jurisdiction, retention, or professional-review concerns apply at this layer; those are the calling product's responsibility.

## Required checks

Run from the repository root:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Restricted actions

The following require explicit owner approval before implementation:

- Adding a new provider (new API surface, new secret, new cost center).
- Any authentication change (API key scheme, adding OAuth/user auth).
- Adding billing, credits, or quota enforcement.
- Changing the `/api/chat` request/response contract in a breaking way (every downstream OLNOO product depends on it).
- Deployment, publishing, or pushing to shared/production infrastructure.
