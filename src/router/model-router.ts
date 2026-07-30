import { AppError } from '../errors/app-error.js';
import type { AIProvider } from '../providers/provider.interface.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';

export interface ModelRouteRequest {
  provider?: string;
  model: string;
}

/**
 * Resolves an incoming chat request to the provider that should serve it.
 *
 * This is the one place request-level routing policy lives. Today it does
 * an explicit-provider-or-first-match lookup; it is the intended extension
 * point for future rules (fallback chains, cost/latency-aware selection,
 * per-tenant overrides) without callers or providers changing.
 */
export class ModelRouter {
  constructor(private readonly registry: ProviderRegistry) {}

  resolve({ provider: providerName, model }: ModelRouteRequest): AIProvider {
    if (providerName) {
      const provider = this.registry.get(providerName);
      if (!provider) {
        throw new AppError('MODEL_NOT_FOUND', `Unknown provider "${providerName}"`);
      }
      if (!provider.supportsModel(model)) {
        throw new AppError(
          'MODEL_NOT_FOUND',
          `Provider "${providerName}" does not support model "${model}"`,
        );
      }
      return provider;
    }

    const provider = this.registry.findByModel(model);
    if (!provider) {
      throw new AppError('MODEL_NOT_FOUND', `No provider available for model "${model}"`);
    }
    return provider;
  }
}
