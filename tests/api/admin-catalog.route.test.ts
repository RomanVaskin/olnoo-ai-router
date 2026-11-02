import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { AppError } from '../../src/errors/app-error.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { FakeProvider } from '../fakes/fake-provider.js';

const TOKEN = process.env.OLNOO_ROUTER_TOKEN as string;
const auth = { authorization: `Bearer ${TOKEN}` };

describe('internal Admin catalog', () => {
  let app: FastifyInstance;
  afterEach(async () => app?.close());

  it('requires the internal bearer token and never treats registration as availability', async () => {
    const chat = vi.fn();
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        name: 'openai',
        models: [{ id: 'gpt-test', label: 'GPT Test' }],
        chatImpl: chat,
      }),
    );
    app = await buildApp({ registry });
    await app.ready();
    expect((await app.inject({ method: 'GET', url: '/v1/admin/catalog' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/v1/admin/catalog', headers: auth });
    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data.providers.find((p: { name: string }) => p.name === 'openai')).toEqual({
      name: 'openai',
      connected: true,
      available: null,
      lastError: null,
      checkedAt: null,
      models: [{ id: 'gpt-test', label: 'GPT Test' }],
    });
    expect(data.providers.find((p: { name: string }) => p.name === 'qwen').connected).toBe(false);
    expect(data.presets).toContainEqual(
      expect.objectContaining({
        key: 'content-factory.text',
        provider: 'deepseek',
        model: 'deepseek-flash',
      }),
    );
    expect(chat).not.toHaveBeenCalled();
    expect(response.body).not.toContain(TOKEN);
  });

  it('checks a provider only on an authenticated explicit request and records real result', async () => {
    const chat = vi
      .fn()
      .mockResolvedValue({
        model: 'gpt-test',
        content: 'OK',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      });
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        name: 'openai',
        models: [{ id: 'gpt-test', label: 'GPT Test' }],
        chatImpl: chat,
      }),
    );
    app = await buildApp({ registry });
    await app.ready();
    expect(
      (await app.inject({ method: 'POST', url: '/v1/admin/providers/openai/check' })).statusCode,
    ).toBe(401);
    expect(chat).not.toHaveBeenCalled();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/providers/openai/check',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: true,
      available: true,
      lastError: null,
      checkedAt: expect.any(String),
    });
    expect(chat).toHaveBeenCalledOnce();
    const catalog = await app.inject({ method: 'GET', url: '/v1/admin/catalog', headers: auth });
    expect(
      catalog.json().providers.find((p: { name: string }) => p.name === 'openai').available,
    ).toBe(true);
  });

  it('reports only a safe error code from a failed real check', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        name: 'deepseek',
        models: [{ id: 'deepseek-flash', label: 'DeepSeek' }],
        chatImpl: vi
          .fn()
          .mockRejectedValue(new AppError('PROVIDER_AUTH_FAILED', 'secret upstream detail')),
      }),
    );
    app = await buildApp({ registry });
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/providers/deepseek/check',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      available: false,
      lastError: 'PROVIDER_AUTH_FAILED',
      checkedAt: expect.any(String),
    });
    expect(response.body).not.toContain('secret upstream detail');
  });
});
