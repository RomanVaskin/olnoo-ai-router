import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { FakeProvider } from '../fakes/fake-provider.js';

const TOKEN = process.env.OLNOO_ROUTER_TOKEN as string;

async function buildTestApp(): Promise<FastifyInstance> {
  const registry = new ProviderRegistry();
  registry.register(
    new FakeProvider({ name: 'anthropic', models: [{ id: 'claude-sonnet-5', label: 'Claude' }] }),
  );
  registry.register(
    new FakeProvider({ name: 'openai', models: [{ id: 'gpt-5.2', label: 'OpenAI' }] }),
  );
  registry.register(
    new FakeProvider({ name: 'gemini', models: [{ id: 'gemini-3.5-flash', label: 'Gemini' }] }),
  );
  const app = await buildApp({ registry });
  await app.ready();
  return app;
}

describe('POST /v1/generate', () => {
  let app: FastifyInstance;
  afterEach(async () => app.close());

  it('requires Bearer authorization', async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/generate',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('validates input and returns the unified response without a paid call', async () => {
    app = await buildTestApp();
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { messages: [] },
    });
    expect(invalid.statusCode).toBe(400);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        taskType: 'general',
        messages: [{ role: 'user', content: 'hello' }],
        metadata: { application: 'test', requestId: 'request-123' },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'request-123',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      content: 'fake response',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      latencyMs: expect.any(Number),
      fallbackUsed: false,
    });
  });
});
