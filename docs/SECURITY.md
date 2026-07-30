# Security

This document covers what Stage 1 implements, what it deliberately does not, and why. It follows `OLNOO_PLAYBOOK.md` §12 ("Security and Privacy").

## Authentication

- Every request to `POST /api/chat` and `GET /providers` requires an `x-api-key` header matching one of the values in `API_KEYS` (`src/security/api-key.guard.ts`).
- Comparison uses `crypto.timingSafeEqual` to avoid timing side-channels.
- Keys are OLNOO-service-to-service credentials, not end-user credentials — this router has no concept of an end user. **End-user auth is explicitly out of scope for Stage 1** (see `docs/ROADMAP.md`); calling products are responsible for authenticating their own users before deciding to call this router.
- `GET /health` and `GET /metrics` are intentionally unauthenticated — standard practice for liveness probes and scrape targets. If this service is ever exposed outside the OLNOO-internal network, put it behind a network-level control (VPC, firewall rule, mTLS) rather than relaxing this design.

## Rate limiting

- `@fastify/rate-limit`, keyed by the caller's API key (falling back to IP only for unauthenticated requests, which the API key guard rejects anyway) — see `src/security/rate-limit.ts`.
- Configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`. Exceeding the limit returns `429 RATE_LIMITED` with the same structured error shape as every other error.

## Secrets

- All secrets (`GEMINI_API_KEY`, `API_KEYS`) come from environment variables, validated at startup (`src/config/env.ts`). None are hardcoded, none are committed — `.env` is gitignored, `.env.example` documents the shape with placeholder values only.
- Secrets are never logged. `src/observability/logger.ts` redacts `req.headers.authorization` and `req.headers["x-api-key"]` even though they're not logged by default, as defense in depth.
- Secrets are never returned in API responses. `GET /providers` lists provider _names and models_, never keys or endpoints.

## What is never logged or returned to a caller

- **Message content.** `messages[].content`, prompts, and completions are never written to logs. The pino redaction config (`src/observability/logger.ts`) additionally redacts any field named `messages`, `content`, or `prompt` as defense in depth, in case a future change accidentally logs a full request/response object.
- **Raw provider errors.** Every provider call is wrapped in a try/catch that converts vendor SDK exceptions into `AppError('PROVIDER_ERROR', 'Gemini provider request failed', { cause })`. The `cause` (which may contain vendor-internal details, stack traces, or request metadata) is logged server-side only (`request.log.error`) and never serialized into the HTTP response — see `src/middleware/error-handler.ts`.
- **Internal exceptions.** Any error that isn't a recognized `AppError` is mapped to a generic `500 INTERNAL_ERROR` with a fixed message. The real error is logged server-side with full detail for debugging.

## Structured logging

Every request produces one line with `{ requestId, provider, model, latencyMs, status }` (`src/api/routes/chat.route.ts`), satisfying `OLNOO_PLAYBOOK.md` §4.7 (safe operational metadata) without persisting any content.

## Request IDs

Every response carries `x-request-id` (`src/middleware/request-id.ts`). An inbound `x-request-id` is reused (bounded length check) so a request can be traced end-to-end across OLNOO services; otherwise one is generated with `crypto.randomUUID()`.

## Input validation

Every request body is validated against a Zod schema before it reaches a route handler (`src/types/chat.ts`, enforced via `fastify-type-provider-zod`). Message length is capped (32,000 characters per message, 64 messages per request) to bound memory and cost exposure from a single request.

## Threat model notes for Stage 1

- **Trust boundary**: callers are other OLNOO backend services holding a shared API key, not end users or the public internet. This service should not be deployed with a public-facing listener without adding per-caller (not shared) API keys, or an upstream auth layer.
- **Denial of service**: rate limiting bounds per-key request volume; `PROVIDER_REQUEST_TIMEOUT_MS` bounds how long a single request can hold a connection open; there is no global concurrency cap yet — see `docs/ROADMAP.md`.
- **Key compromise**: a leaked API key currently grants full access to every model this deployment exposes, with no per-key scoping or usage attribution. Per-tenant keys, scoping, and usage tracking are Stage 2+ (OLNOO Credits/Billing, `docs/ROADMAP.md`).
