import type { Env } from '../config/env.js';
import { GeminiProvider } from './gemini/gemini.provider.js';
import { AnthropicProvider } from './anthropic/anthropic.provider.js';
import { OpenAIProvider } from './openai/openai.provider.js';
import { ProviderRegistry } from './provider.registry.js';

/**
 * Wires up every provider enabled for this deployment. Adding a new vendor
 * later means adding one `registry.register(new XProvider(...))` line here
 * — nothing else in the codebase needs to change.
 */
export function createProviderRegistry(env: Env): ProviderRegistry {
  const registry = new ProviderRegistry();

  if (env.GEMINI_API_KEY) {
    registry.register(
      new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        enabledModels: [...new Set([...env.GEMINI_MODELS, env.GEMINI_DEFAULT_MODEL])],
        requestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
      }),
    );
  }
  if (env.OPENAI_API_KEY) {
    registry.register(
      new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_DEFAULT_MODEL,
        requestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
        imageModel: env.OPENAI_IMAGE_MODEL,
      }),
    );
  }
  if (env.ANTHROPIC_API_KEY) {
    registry.register(
      new AnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_DEFAULT_MODEL,
        requestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
      }),
    );
  }

  return registry;
}
