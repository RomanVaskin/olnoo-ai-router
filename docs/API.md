# API Reference

Base URL (local): `http://localhost:8080`

Interactive, always-current docs: `GET /docs` (Swagger UI, generated from the same Zod schemas that validate requests — see `pnpm openapi:print` to export `docs/openapi.json`).

All authenticated endpoints require an `x-api-key` header. See [`SECURITY.md`](./SECURITY.md).

Every response carries an `x-request-id` header, echoing the inbound `x-request-id` if the caller sent one, or a freshly generated UUID otherwise.

## `POST /api/chat`

Send a chat completion request through the router to an AI provider. **Requires `x-api-key`.**

### Request body

```json
{
  "provider": "gemini",
  "model": "gemini-3.5-flash",
  "messages": [
    { "role": "system", "content": "You are concise." },
    { "role": "user", "content": "What is the capital of France?" }
  ],
  "temperature": 0.7,
  "maxOutputTokens": 512,
  "topP": 0.95
}
```

| Field             | Type    | Required | Notes                                                                                                                 |
| ----------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `provider`        | string  | no       | Explicit provider name (e.g. `"gemini"`). Omit to let the router pick whichever registered provider supports `model`. |
| `model`           | string  | yes      | Must be one of the models the resolved provider is configured to serve (see `GET /providers`).                        |
| `messages`        | array   | yes      | 1–64 messages, each `{ role: "system" \| "user" \| "assistant", content: string }`. Content is 1–32,000 characters.   |
| `temperature`     | number  | no       | 0–2.                                                                                                                  |
| `maxOutputTokens` | integer | no       | 1–32,000.                                                                                                             |
| `topP`            | number  | no       | 0–1.                                                                                                                  |

### Response — `200 OK`

```json
{
  "requestId": "e66d1942-8a10-40fe-bc03-7b4255e8fcb0",
  "provider": "gemini",
  "model": "gemini-3.5-flash",
  "content": "Paris.",
  "finishReason": "stop",
  "usage": { "promptTokens": 14, "completionTokens": 3, "totalTokens": 17 },
  "latencyMs": 412,
  "createdAt": "2026-07-30T17:40:12.284Z"
}
```

`finishReason` is one of: `stop`, `length` (hit `maxOutputTokens`), `content_filter`, `error`.

### Errors

See the shared error shape and codes below. Notably: `404 MODEL_NOT_FOUND` if the model/provider combination isn't registered, `502 PROVIDER_ERROR` / `504 PROVIDER_TIMEOUT` if the upstream vendor call fails.

## `GET /providers`

List every registered provider and the models it's configured to serve. **Requires `x-api-key`.**

```json
{
  "providers": [
    {
      "name": "gemini",
      "models": [
        { "id": "gemini-3.5-flash", "label": "Gemini 3.5 Flash" },
        { "id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro", "contextWindow": 1048576 }
      ]
    }
  ]
}
```

## `GET /health`

Liveness/readiness probe. **No API key required** (so orchestrators — Docker, Kubernetes, load balancers — can reach it).

```json
{
  "status": "ok",
  "service": "olnoo-ai-router",
  "version": "0.1.0",
  "uptimeSeconds": 41,
  "timestamp": "2026-07-30T17:40:12.284Z"
}
```

## `GET /metrics`

Prometheus exposition format. **No API key required** — this is a standard scrape-target convention; restrict access at the network layer if this service is ever reachable from outside the OLNOO infrastructure. See [`SECURITY.md`](./SECURITY.md).

## Error shape

Every non-2xx response has the same shape:

```json
{
  "error": {
    "code": "MODEL_NOT_FOUND",
    "message": "No provider available for model \"gpt-4o\"",
    "requestId": "e66d1942-8a10-40fe-bc03-7b4255e8fcb0"
  }
}
```

| `code`             | HTTP status | Meaning                                                                                                         |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR` | 400         | Request body failed schema validation.                                                                          |
| `UNAUTHORIZED`     | 401         | Missing or invalid `x-api-key`.                                                                                 |
| `NOT_FOUND`        | 404         | No route matches the request.                                                                                   |
| `MODEL_NOT_FOUND`  | 404         | The requested provider/model combination isn't registered.                                                      |
| `RATE_LIMITED`     | 429         | Caller exceeded `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS`.                                           |
| `INTERNAL_ERROR`   | 500         | Unexpected error inside the router itself.                                                                      |
| `PROVIDER_ERROR`   | 502         | The upstream AI provider call failed. The underlying cause is logged server-side, never returned to the caller. |
| `PROVIDER_TIMEOUT` | 504         | The upstream AI provider did not respond within `PROVIDER_REQUEST_TIMEOUT_MS`.                                  |

## `POST /api/images/generate`

Generate one image from a text prompt and 1–4 inline JPEG, PNG, or WebP images.
Requires `x-api-key`.

```json
{
  "model": "gemini-3.1-flash-image",
  "prompt": "Preserve the camera and redesign the facade.",
  "images": [
    {
      "mimeType": "image/jpeg",
      "data": "<base64>",
      "label": "IMAGE 1: PRIMARY EDIT TARGET"
    }
  ]
}
```

The response contains `imageBase64`, `mimeType`, `warnings`, provider/model
metadata, latency, timestamp, and request ID.

## `POST /api/structured`

Generate schema-constrained JSON from a prompt and optional 1–4 inline images.
Requires `x-api-key`. Text-only callers may omit `images` or pass an empty
array. The request adds `jsonSchema`, optional `temperature`,
`expectedFormat: "json"`, and safe correlation metadata (`module` and optional
`projectId`); the response returns the JSON document as `content` plus
provider/model metadata. End-to-end correlation uses the `x-request-id` header.

These endpoints are non-streaming in Stage 1. Large multimodal JSON bodies are
bounded by `BODY_LIMIT_BYTES`; callers should keep decoded image payloads within
their provider's inline-request limit.

Additional safe provider codes used by multimodal endpoints are
`PROVIDER_RATE_LIMITED`, `PROVIDER_QUOTA_EXHAUSTED`,
`PROVIDER_SAFETY_REJECTION`, and `PROVIDER_INVALID_RESPONSE`.
