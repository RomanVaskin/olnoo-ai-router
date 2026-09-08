import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { OpenAIProvider } from '../../src/providers/openai/openai.provider.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';

const TOKEN = process.env.OLNOO_ROUTER_TOKEN as string;

function buildRegistry(generate: ReturnType<typeof vi.fn>): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(
    new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      requestTimeoutMs: 1_000,
      imageModel: 'gpt-image-test',
      client: { images: { generate } } as unknown as OpenAI,
    }),
  );
  return registry;
}

async function buildTestApp(generate: ReturnType<typeof vi.fn>): Promise<FastifyInstance> {
  const app = await buildApp({ registry: buildRegistry(generate) });
  await app.ready();
  return app;
}

describe('POST /v1/images/generate', () => {
  let app: FastifyInstance;
  afterEach(async () => app.close());

  it('requires Bearer authorization', async () => {
    app = await buildTestApp(vi.fn());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/images/generate',
      payload: { prompt: 'a cat' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a request without a prompt', async () => {
    app = await buildTestApp(vi.fn());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/images/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unsupported size', async () => {
    app = await buildTestApp(vi.fn());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/images/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { prompt: 'a cat', size: '512x512' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('generates an image through the existing OpenAI provider/key', async () => {
    const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }] });
    app = await buildTestApp(generate);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/images/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { prompt: 'a cat riding a bike', size: '1024x1024' },
    });
    expect(response.statusCode).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-test',
        prompt: 'a cat riding a bike',
        size: '1024x1024',
        n: 1,
        output_format: 'png',
      }),
      expect.any(Object),
    );
    expect(response.json()).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-test',
      imageBase64: 'ZmFrZS1pbWFnZQ==',
      mimeType: 'image/png',
    });
  });

  it('maps upstream provider errors to the standard error envelope', async () => {
    const error = new OpenAI.AuthenticationError(401, {}, 'denied', new Headers());
    app = await buildTestApp(vi.fn().mockRejectedValue(error));
    const response = await app.inject({
      method: 'POST',
      url: '/v1/images/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { prompt: 'a cat' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('PROVIDER_AUTH_FAILED');
  });
});
