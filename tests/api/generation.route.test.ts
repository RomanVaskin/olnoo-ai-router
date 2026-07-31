import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { FakeProvider } from '../fakes/fake-provider.js';

const API_KEY = process.env.API_KEYS as string;
const IMAGE = { mimeType: 'image/png', data: Buffer.from('image').toString('base64') };

async function buildTestApp(
  provider = new FakeProvider({
    name: 'gemini',
    models: [
      { id: 'fake-model', label: 'Fake Model' },
      { id: 'gemini-3.5-flash', label: 'Default Gemini Model' },
    ],
  }),
): Promise<FastifyInstance> {
  const registry = new ProviderRegistry();
  registry.register(provider);
  const app = await buildApp({ registry });
  await app.ready();
  return app;
}

describe('multimodal generation routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('generates an image through the resolved provider', async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      headers: { 'x-api-key': API_KEY },
      payload: { model: 'fake-model', prompt: 'redesign', images: [IMAGE] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: 'gemini',
      model: 'fake-model',
      mimeType: 'image/png',
      warnings: [],
    });
  });

  it('generates schema-constrained content through the resolved provider', async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/structured',
      headers: { 'x-api-key': API_KEY },
      payload: {
        model: 'fake-model',
        prompt: 'review',
        images: [IMAGE],
        jsonSchema: { type: 'object' },
        temperature: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: 'gemini',
      model: 'fake-model',
      content: '{"ok":true}',
      output: { ok: true },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      fallback: { used: false, attempts: [{ provider: 'gemini' }] },
    });
  });

  it('supports text-only structured Studio requests and preserves request correlation', async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/structured',
      headers: { 'x-api-key': API_KEY, 'x-request-id': 'studio-request-123' },
      payload: {
        model: 'fake-model',
        prompt: 'Build a change plan',
        jsonSchema: { type: 'object' },
        expectedFormat: 'json',
        metadata: { module: 'studio', projectId: 'project-1' },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('studio-request-123');
    expect(response.json()).toMatchObject({
      requestId: 'studio-request-123',
      content: '{"ok":true}',
    });
  });

  it('requires authentication and validates inline images', async () => {
    app = await buildTestApp();
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      payload: { model: 'fake-model', prompt: 'redesign', images: [IMAGE] },
    });
    expect(unauthorized.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      headers: { 'x-api-key': API_KEY },
      payload: { model: 'fake-model', prompt: 'redesign', images: [] },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
