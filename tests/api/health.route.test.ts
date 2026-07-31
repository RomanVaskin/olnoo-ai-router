import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { FakeProvider } from '../fakes/fake-provider.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('is reachable without an API key and reports ok', async () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider());
    app = await buildApp({ registry });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      providers: { anthropic: false, openai: false, gemini: false },
    });
  });
});

describe('GET /metrics', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('is reachable without an API key and exposes Prometheus text format', async () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider());
    app = await buildApp({ registry });

    // Generate one recorded request duration before asserting on metrics output.
    await app.inject({ method: 'GET', url: '/health' });
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('ai_router_http_request_duration_seconds');
  });
});
