import type {
  AIProvider,
  ProviderChatInput,
  ProviderChatOptions,
  ProviderChatOutput,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
  ProviderModelInfo,
  ProviderStructuredGenerationInput,
  ProviderStructuredGenerationOutput,
} from '../../src/providers/provider.interface.js';

export interface FakeProviderConfig {
  name?: string;
  models?: ProviderModelInfo[];
  chatImpl?: (
    input: ProviderChatInput,
    options: ProviderChatOptions,
  ) => Promise<ProviderChatOutput>;
  imageImpl?: (
    input: ProviderImageGenerationInput,
    options: ProviderChatOptions,
  ) => Promise<ProviderImageGenerationOutput>;
  structuredImpl?: (
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ) => Promise<ProviderStructuredGenerationOutput>;
}

export class FakeProvider implements AIProvider {
  readonly name: string;
  private readonly models: ProviderModelInfo[];
  private readonly chatImpl: FakeProviderConfig['chatImpl'];
  private readonly imageImpl: FakeProviderConfig['imageImpl'];
  private readonly structuredImpl: FakeProviderConfig['structuredImpl'];

  constructor(config: FakeProviderConfig = {}) {
    this.name = config.name ?? 'fake';
    this.models = config.models ?? [{ id: 'fake-model', label: 'Fake Model' }];
    this.chatImpl = config.chatImpl;
    this.imageImpl = config.imageImpl;
    this.structuredImpl = config.structuredImpl;
  }

  listModels(): ProviderModelInfo[] {
    return this.models;
  }

  supportsModel(model: string): boolean {
    return this.models.some((m) => m.id === model);
  }

  async chat(input: ProviderChatInput, options: ProviderChatOptions): Promise<ProviderChatOutput> {
    if (this.chatImpl) {
      return this.chatImpl(input, options);
    }
    return {
      model: input.model,
      content: 'fake response',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    };
  }

  async generateImage(
    input: ProviderImageGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderImageGenerationOutput> {
    if (this.imageImpl) return this.imageImpl(input, options);
    return {
      model: input.model,
      imageBase64: Buffer.from('fake image').toString('base64'),
      mimeType: 'image/png',
      warnings: [],
    };
  }

  async generateStructured(
    input: ProviderStructuredGenerationInput,
    options: ProviderChatOptions,
  ): Promise<ProviderStructuredGenerationOutput> {
    if (this.structuredImpl) return this.structuredImpl(input, options);
    return {
      model: input.model,
      content: '{"ok":true}',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    };
  }
}
