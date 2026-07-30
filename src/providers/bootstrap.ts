import type { Env } from '../config/env.js';
import { GeminiProvider } from './gemini/gemini.provider.js';
import { ProviderRegistry } from './provider.registry.js';

/**
 * Wires up every provider enabled for this deployment. Adding a new vendor
 * later means adding one `registry.register(new XProvider(...))` line here
 * — nothing else in the codebase needs to change.
 */
export function createProviderRegistry(env: Env): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(
    new GeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      enabledModels: env.GEMINI_MODELS,
      requestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
    }),
  );

  return registry;
}
