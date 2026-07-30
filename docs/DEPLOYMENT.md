# Deployment

## Local development

```bash
pnpm install
cp .env.example .env   # fill in GEMINI_API_KEY and API_KEYS
pnpm dev                # tsx watch, http://localhost:8080
```

## Production build (bare metal / VM)

```bash
pnpm install --frozen-lockfile
pnpm build              # tsc -> dist/
pnpm start              # node dist/server.js
```

The process reads configuration exclusively from the environment (see `docs/CONFIGURATION.md`) and exits immediately with a descriptive error if required variables are missing — check `NODE_ENV`, `API_KEYS`, and `GEMINI_API_KEY` first if startup fails.

## Docker

```bash
docker build -t olnoo-ai-router .
docker run --rm -p 8080:8080 --env-file .env olnoo-ai-router
```

The `Dockerfile` is a multi-stage build:

1. `deps` — installs dependencies with pnpm, using a cached store mount.
2. `build` — compiles TypeScript and prunes dev dependencies (`pnpm prune --prod`).
3. `runtime` — a minimal `node:22-alpine` image containing only `dist/`, production `node_modules`, and `package.json`; runs as a non-root `olnoo` user; declares a `HEALTHCHECK` against `GET /health`.

## Docker Compose

```bash
docker compose up --build
```

`docker-compose.yml` builds the image, loads `.env`, publishes `PORT` (default `8080`), and wires the same health check as the Dockerfile so `docker compose ps` reflects real service health.

## Health and readiness

- `GET /health` returns `200` with `{ status: "ok", ... }` as soon as the process is accepting connections. There are no external dependencies (no database, no cache) to wait on in Stage 1, so liveness and readiness are equivalent.
- Point your orchestrator's liveness/readiness probe (Kubernetes, ECS, a load balancer health check) at `GET /health`. It requires no API key.

## Metrics

- `GET /metrics` exposes Prometheus text format. Point a Prometheus scrape config at it; no API key is required (see `docs/SECURITY.md` for the reasoning and the network-layer mitigation if this service is ever public-facing).

## Graceful shutdown

`src/server.ts` uses `close-with-grace` to stop accepting new connections and drain in-flight requests (10s grace period) on `SIGTERM`/`SIGINT` before the process exits — safe for rolling deploys and container orchestrator restarts.

## Zero-downtime deploys

This service is stateless (no database, no session, no local disk state), so any rolling-deploy strategy your infrastructure already supports (blue/green, rolling update) works without special coordination. Multiple instances can run concurrently behind a load balancer with no shared state.

## Secrets in deployment

Never bake `GEMINI_API_KEY` or `API_KEYS` into the Docker image or commit them to source control. Inject them via your deployment platform's secret manager (or `--env-file` / `docker compose`'s `env_file:` for local/staging use, as configured in `docker-compose.yml`).
