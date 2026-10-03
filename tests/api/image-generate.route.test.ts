import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { OpenAIProvider } from '../../src/providers/openai/openai.provider.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';

const TOKEN = process.env.OLNOO_ROUTER_TOKEN as string;

function buildRegistry(
  generate: ReturnType<typeof vi.fn>,
  imageQuality?: 'low' | 'medium' | 'high' | 'auto',
): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(
    new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      requestTimeoutMs: 1_000,
      imageModel: 'gpt-image-test',
      ...(imageQuality ? { imageQuality } : {}),
      client: { images: { generate } } as unknown as OpenAI,
    }),
  );
  return registry;
}

async function buildTestApp(
  generate: ReturnType<typeof vi.fn>,
  imageQuality?: 'low' | 'medium' | 'high' | 'auto',
): Promise<FastifyInstance> {
  const app = await buildApp({ registry: buildRegistry(generate, imageQuality) });
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
        quality: 'medium',
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

  it('uses quality=medium by default when no quality is configured', async () => {
    const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: 'ZmFrZQ==' }] });
    app = await buildTestApp(generate);
    await app.inject({
      method: 'POST',
      url: '/v1/images/generate',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { prompt: 'a cat' },
    });
    expect(generate.mock.calls[0]?.[0]?.quality).toBe('medium');
  });

  it.each(['low', 'medium', 'high', 'auto'] as const)(
    'passes the configured quality (%s) to OpenAI',
    async (quality) => {
      const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: 'ZmFrZQ==' }] });
      app = await buildTestApp(generate, quality);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/images/generate',
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: { prompt: 'a cat', size: '1536x1024' },
      });
      expect(response.statusCode).toBe(200);
      expect(generate).toHaveBeenCalledWith(
        {
          model: 'gpt-image-test',
          prompt: 'a cat',
          size: '1536x1024',
          quality,
          n: 1,
          output_format: 'png',
        },
        expect.any(Object),
      );
    },
  );

  describe('service presets (fixed routing)', () => {
    async function post(
      generate: ReturnType<typeof vi.fn>,
      payload: Record<string, unknown>,
      quality?: 'low' | 'medium' | 'high' | 'auto',
    ) {
      app = await buildTestApp(generate, quality);
      return app.inject({
        method: 'POST',
        url: '/v1/images/generate',
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
    }

    it('service=driveset selects OpenAI gpt-image-1-mini at medium quality from the Router preset', async () => {
      const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: 'ZmFrZQ==' }] });
      // The provider is configured with a different env model/quality: the preset must win.
      const response = await post(
        generate,
        { service: 'driveset', prompt: 'a car', size: '1536x1024' },
        'high',
      );
      expect(response.statusCode).toBe(200);
      expect(generate).toHaveBeenCalledWith(
        {
          model: 'gpt-image-1-mini',
          prompt: 'a car',
          size: '1536x1024',
          quality: 'medium',
          n: 1,
          output_format: 'png',
        },
        expect.any(Object),
      );
      expect(response.json()).toMatchObject({
        provider: 'openai',
        model: 'gpt-image-1-mini',
        imageBase64: 'ZmFrZQ==',
        mimeType: 'image/png',
      });
    });

    it('a client cannot override provider, model or quality', async () => {
      const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: 'ZmFrZQ==' }] });
      const response = await post(generate, {
        service: 'driveset',
        prompt: 'a car',
        provider: 'gemini',
        model: 'gpt-image-evil',
        quality: 'high',
      });
      expect(response.statusCode).toBe(200);
      const sent = generate.mock.calls[0]?.[0];
      expect(sent).toMatchObject({ model: 'gpt-image-1-mini', quality: 'medium' });
      expect(JSON.stringify(sent)).not.toContain('evil');
      expect(response.json()).toMatchObject({ provider: 'openai', model: 'gpt-image-1-mini' });
    });

    it('a call without service behaves exactly as before (env-configured model and quality)', async () => {
      const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: 'ZmFrZQ==' }] });
      const response = await post(
        generate,
        { prompt: 'a cat', model: 'ignored', quality: 'low' },
        'high',
      );
      expect(response.statusCode).toBe(200);
      expect(generate).toHaveBeenCalledWith(
        { model: 'gpt-image-test', prompt: 'a cat', quality: 'high', n: 1, output_format: 'png' },
        expect.any(Object),
      );
    });

    it.each(['unknown-service', 'constructor'])(
      'rejects service "%s" that has no preset',
      async (service) => {
        const generate = vi.fn();
        const response = await post(generate, { service, prompt: 'a car' });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
        expect(generate).not.toHaveBeenCalled();
      },
    );

    it('rejects a malformed service id', async () => {
      const generate = vi.fn();
      const response = await post(generate, { service: 'Drive Set!', prompt: 'a car' });
      expect(response.statusCode).toBe(400);
      expect(generate).not.toHaveBeenCalled();
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
