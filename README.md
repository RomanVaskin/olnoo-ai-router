# OLNOO AI Router

The single entry point to every AI model used across the OLNOO platform.

No OLNOO product calls Gemini, OpenAI, Anthropic, or any other model provider directly. Every AI request flows through this router, which authenticates the caller, resolves the right provider for the requested model, forwards the request, and returns a normalized, provider-agnostic response.

**Stage 1** (this release): Gemini only, behind a vendor-neutral `AIProvider` interface designed so Anthropic, OpenAI, Qwen, Mistral, DeepSeek, or any other provider can be added later as a new file — never as a branch in existing code.

## Why this exists

See [`PRODUCT_CONTEXT.md`](./PRODUCT_CONTEXT.md) and [`OLNOO_PLAYBOOK.md`](./OLNOO_PLAYBOOK.md) §3 and §5 — this repository _is_ the shared "AI Gateway and provider adapters" capability every OLNOO product is expected to reuse.

## Documentation

| Doc                                                | Purpose                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)   | System design, module boundaries, the provider extension point |
| [`docs/API.md`](./docs/API.md)                     | Endpoint reference, request/response contracts, error codes    |
| [`docs/PROVIDERS.md`](./docs/PROVIDERS.md)         | How the Gemini provider works and how to add a new one         |
| [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) | Every environment variable, validated at startup               |
| [`docs/SECURITY.md`](./docs/SECURITY.md)           | Auth, rate limiting, logging redaction, threat notes           |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)       | Running locally, Docker, Docker Compose, production notes      |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md)             | What Stage 1 deliberately excludes, and what's next            |

## Quick start

```bash
pnpm install
cp .env.example .env        # then fill in GEMINI_API_KEY and API_KEYS
pnpm dev                    # http://localhost:8080
```

```bash
curl -H "x-api-key: <your-key>" \
     -H "content-type: application/json" \
     -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello"}]}' \
     http://localhost:8080/api/chat
```

Interactive API docs (Swagger UI) are served at `http://localhost:8080/docs` once the server is running.

## Project layout

```
src/
  api/            route registration, per-route Zod schemas, shared request dependencies
  config/         environment loading + validation (Zod), package metadata
  errors/         AppError — the one error type that ever crosses the API boundary
  middleware/     request ID generation, centralized error handling
  observability/  structured logging (pino) and metrics (prom-client)
  providers/      the AIProvider contract, the registry, and one directory per vendor (gemini/)
  router/         resolves a chat request to the provider that should serve it
  security/       API key auth, rate limiting
  types/          shared request/response contracts (Zod schemas + inferred types)
  app.ts          builds and wires the Fastify instance
  server.ts       process entrypoint (listen, graceful shutdown)
tests/            Vitest unit + integration tests, mirroring src/
docs/             architecture and operational documentation
```

## Required checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## License

Proprietary — internal OLNOO infrastructure.
