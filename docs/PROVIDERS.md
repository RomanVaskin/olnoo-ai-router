# Providers

## The contract

Every provider implements `AIProvider` (`src/providers/provider.interface.ts`):

```ts
interface AIProvider {
  readonly name: string;
  listModels(): ProviderModelInfo[];
  supportsModel(model: string): boolean;
  chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput>;
}
```

`ProviderChatInput`/`ProviderChatOutput` are vendor-neutral — no Gemini-, OpenAI-, or Anthropic-specific field ever appears outside a provider's own directory. Translating between this shape and a vendor's wire format is entirely the provider's job (see `src/providers/gemini/gemini.mapper.ts` for an example: mapping OLNOO's `system`/`user`/`assistant` roles to Gemini's `systemInstruction`/`user`/`model`).

## Registration

`src/providers/bootstrap.ts` is the only place providers are instantiated and registered:

```ts
registry.register(
  new GeminiProvider({
    apiKey: env.GEMINI_API_KEY,
    enabledModels: env.GEMINI_MODELS,
    requestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
  }),
);
```

`ProviderRegistry` (`src/providers/provider.registry.ts`) rejects duplicate provider names and answers two questions: "give me the provider named X" and "find me whichever provider supports model Y". `ModelRouter` (`src/router/model-router.ts`) is the only caller of the registry from request-handling code.

## Gemini (Stage 1)

- SDK: [`@google/genai`](https://www.npmjs.com/package/@google/genai) — Google's unified GenAI SDK.
- Auth: `GEMINI_API_KEY` (from [Google AI Studio](https://aistudio.google.com/apikey)).
- Enabled models: `GEMINI_MODELS` (comma-separated). Known models get a friendly label and context-window hint from `src/providers/gemini/gemini.models.ts`; unrecognized model IDs still work, they just show up undecorated on `GET /providers`.
- System messages are extracted from `messages[]` and sent as Gemini's `systemInstruction` (Gemini has no `system` role in `contents`).
- `finishReason` mapping: Gemini's `STOP` → `stop`, `MAX_TOKENS` → `length`, `SAFETY`/`RECITATION`/`BLOCKLIST`/`PROHIBITED_CONTENT`/`SPII` → `content_filter`, anything else → `error`.
- Every call is wrapped with `PROVIDER_REQUEST_TIMEOUT_MS` (`src/providers/with-timeout.ts`) and an `AbortController` tied to both the timeout and the inbound HTTP request's `close` event, so an abandoned client request doesn't leave a Gemini call running unbounded.
- Any SDK error (network failure, 4xx/5xx from Google, malformed response) is caught and re-thrown as `AppError('PROVIDER_ERROR', ...)` — the original error is attached as `cause` for server-side logging only, never serialized to the caller.

## Adding a new provider (Stage 2+)

1. `mkdir src/providers/<vendor>` and add `<vendor>.provider.ts` implementing `AIProvider`, plus any mapper/model-catalog files it needs — mirror `src/providers/gemini/`.
2. Wrap every vendor SDK error into `AppError` before it can escape `chat()` — never let a raw SDK exception reach the route handler.
3. Add the vendor's secrets and enabled-model list to `src/config/env.ts` (Zod-validated, `.env.example` documented) — never hardcode credentials.
4. Register it in `src/providers/bootstrap.ts`.
5. Add unit tests mirroring `tests/providers/gemini.mapper.test.ts` for any mapping logic, and confirm `tests/router/model-router.test.ts`-style resolution still passes with two providers registered.

Nothing in `src/api/`, `src/router/`, `src/security/`, or `src/middleware/` should need to change.
