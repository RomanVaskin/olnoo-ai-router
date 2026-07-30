import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { FakeProvider } from '../fakes/fake-provider.js';

const API_KEY = process.env.API_KEYS as string;

describe('GET /providers', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('requires an API key', async () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider());
    app = await buildApp({ registry });

    const response = await app.inject({ method: 'GET', url: '/providers' });
    expect(response.statusCode).toBe(401);
  });

  it('lists registered providers and their models', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        name: 'gemini',
        models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_048_576 }],
      }),
    );
    app = await buildApp({ registry });

    const response = await app.inject({
      method: 'GET',
      url: '/providers',
      headers: { 'x-api-key': API_KEY },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      providers: [
        {
          name: 'gemini',
          models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_048_576 }],
        },
      ],
    });
  });
});
