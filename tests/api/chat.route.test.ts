import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { AppError } from '../../src/errors/app-error.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { FakeProvider } from '../fakes/fake-provider.js';

const API_KEY = process.env.API_KEYS as string;

async function buildTestApp(provider: FakeProvider): Promise<FastifyInstance> {
  const registry = new ProviderRegistry();
  registry.register(provider);
  const app = await buildApp({ registry });
  await app.ready();
  return app;
}

describe('POST /api/chat', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 without an API key', async () => {
    app = await buildTestApp(new FakeProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { model: 'fake-model', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 for an invalid body', async () => {
    app = await buildTestApp(new FakeProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-api-key': API_KEY },
      payload: { model: 'fake-model', messages: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when no provider serves the requested model', async () => {
    app = await buildTestApp(new FakeProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-api-key': API_KEY },
      payload: { model: 'unknown-model', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('MODEL_NOT_FOUND');
  });

  it('returns a chat completion on success and never logs message content', async () => {
    app = await buildTestApp(new FakeProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-api-key': API_KEY },
      payload: { model: 'fake-model', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      provider: 'fake',
      model: 'fake-model',
      content: 'fake response',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    expect(typeof body.requestId).toBe('string');
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('maps provider failures to a safe 502 without leaking upstream details', async () => {
    app = await buildTestApp(
      new FakeProvider({
        chatImpl: async () => {
          throw new AppError('PROVIDER_ERROR', 'Gemini provider request failed', {
            cause: new Error('super secret upstream stack trace'),
          });
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-api-key': API_KEY },
      payload: { model: 'fake-model', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret upstream stack trace');
  });
});
