import { AIProviderAdapter } from './types';
import { AIProviderProfile, AIProviderType } from '../../types';
import { LocalTemplateAdapter } from './adapters/localProvider';
import { OpenAICompatibleAdapter } from './adapters/openaiCompatibleProvider';
import { AnthropicAdapter } from './adapters/anthropicProvider';
import { GeminiAdapter } from './adapters/geminiProvider';
import { NvidiaNimAdapter } from './adapters/nvidiaNimAdapter';

class ProviderRegistry {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  constructor() {
    this.register(new LocalTemplateAdapter());
    this.register(new OpenAICompatibleAdapter());
    this.register(new AnthropicAdapter());
    this.register(new GeminiAdapter());
    this.register(new NvidiaNimAdapter());
  }

  register(adapter: AIProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapterForProfile(profile: AIProviderProfile): AIProviderAdapter {
    switch (profile.type) {
      case 'local':
        return this.adapters.get('local')!;
      case 'anthropic':
        return this.adapters.get('anthropic')!;
      case 'gemini':
        return this.adapters.get('gemini')!;
      case 'nvidia_nim':
        return this.adapters.get('nvidia_nim')!;
      case 'openai':
      case 'openrouter':
      case 'ollama':
      case 'lmstudio':
      case 'openai_compatible':
      default:
        // Reuse OpenAICompatibleAdapter for all OpenAI-compatible API types
        return this.adapters.get('openai_compatible')!;
    }
  }
}

export const providerRegistry = new ProviderRegistry();
