import type { AIProvider } from './provider.interface.js';

/**
 * Holds every provider registered at startup and answers "who can serve
 * this model" without any caller needing to know provider names in advance.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider "${provider.name}" is already registered`);
    }
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  findByModel(model: string): AIProvider | undefined {
    return this.list().find((provider) => provider.supportsModel(model));
  }
}
