import type {
  AIProvider,
  ProviderChatInput,
  ProviderChatOptions,
  ProviderChatOutput,
  ProviderModelInfo,
} from '../../src/providers/provider.interface.js';

export interface FakeProviderConfig {
  name?: string;
  models?: ProviderModelInfo[];
  chatImpl?: (
    input: ProviderChatInput,
    options: ProviderChatOptions,
  ) => Promise<ProviderChatOutput>;
}

export class FakeProvider implements AIProvider {
  readonly name: string;
  private readonly models: ProviderModelInfo[];
  private readonly chatImpl: FakeProviderConfig['chatImpl'];

  constructor(config: FakeProviderConfig = {}) {
    this.name = config.name ?? 'fake';
    this.models = config.models ?? [{ id: 'fake-model', label: 'Fake Model' }];
    this.chatImpl = config.chatImpl;
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
}
