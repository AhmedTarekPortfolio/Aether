import { BrowserWindow } from 'electron';
import {
  DesktopAIRequest,
  DesktopAIResponse,
  DesktopStreamChunk,
  DesktopTestRequest,
  DesktopTestResult,
  DesktopModelOption,
} from '../../types/desktop-api.js';
import { IPCChannel } from '../../types/ipc-contracts.js';
import { credentialService } from '../credentials/credential-service.js';
import { NvidiaDesktopProvider } from './providers/nvidia.provider.js';
import { OpenAIDesktopProvider } from './providers/openai.provider.js';
import { AnthropicDesktopProvider } from './providers/anthropic.provider.js';
import { GeminiDesktopProvider } from './providers/gemini.provider.js';
import { LocalDesktopProvider } from './providers/local.provider.js';

export function redactSecretsInString(text: string): string {
  if (!text) return '';
  return text
    .replace(/nvapi-[a-zA-Z0-9_-]+/g, 'nvapi-••••REDACTED')
    .replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-••••REDACTED')
    .replace(/Bearer\s+[^\s"']+/g, 'Bearer ••••REDACTED')
    .replace(/Authorization:\s*[^\s"']+/g, 'Authorization: ••••REDACTED')
    .replace(/x-api-key:\s*[^\s"']+/g, 'x-api-key: ••••REDACTED')
    .replace(/key=[^&\s"']+/g, 'key=••••REDACTED');
}

export class DesktopAIService {
  private activeControllers: Map<string, AbortController> = new Map();

  private nvidiaProvider = new NvidiaDesktopProvider();
  private openaiProvider = new OpenAIDesktopProvider();
  private anthropicProvider = new AnthropicDesktopProvider();
  private geminiProvider = new GeminiDesktopProvider();
  private localProvider = new LocalDesktopProvider();

  private getProvider(providerType: string) {
    switch (providerType) {
      case 'nvidia_nim':
        return this.nvidiaProvider;
      case 'anthropic':
        return this.anthropicProvider;
      case 'gemini':
        return this.geminiProvider;
      case 'local':
        return this.localProvider;
      case 'openai':
      case 'openrouter':
      case 'ollama':
      case 'lmstudio':
      case 'openai_compatible':
      default:
        return this.openaiProvider;
    }
  }

  public async generate(request: DesktopAIRequest): Promise<DesktopAIResponse> {
    const controller = new AbortController();
    if (request.requestId) {
      this.activeControllers.set(request.requestId, controller);
    }

    try {
      const apiKey = credentialService.getApiKey(request.profileId) || '';
      const provider = this.getProvider(request.providerType);
      return await provider.generate(request, apiKey, controller.signal);
    } catch (err: any) {
      const safeMsg = redactSecretsInString(err.message || 'AI Generation failed');
      throw new Error(safeMsg);
    } finally {
      if (request.requestId) {
        this.activeControllers.delete(request.requestId);
      }
    }
  }

  public async stream(window: BrowserWindow, request: DesktopAIRequest): Promise<void> {
    const controller = new AbortController();
    if (request.requestId) {
      this.activeControllers.set(request.requestId, controller);
    }

    const sendChunk = (chunk: DesktopStreamChunk) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPCChannel.AI_STREAM_CHUNK, chunk);
      }
    };

    try {
      const apiKey = credentialService.getApiKey(request.profileId) || '';
      const provider = this.getProvider(request.providerType);

      if (request.providerType === 'nvidia_nim' && 'stream' in provider) {
        const res = await (provider as NvidiaDesktopProvider).stream(
          request,
          apiKey,
          (token, reasoning) => {
            if (token) {
              sendChunk({ requestId: request.requestId, type: 'token', text: token });
            }
            if (reasoning) {
              sendChunk({ requestId: request.requestId, type: 'reasoning', text: reasoning });
            }
          },
          controller.signal
        );
        sendChunk({ requestId: request.requestId, type: 'done', content: res.content, reasoning: res.reasoning });
      } else if ('stream' in provider && typeof (provider as any).stream === 'function') {
        const res = await (provider as OpenAIDesktopProvider).stream(
          request,
          apiKey,
          (token, reasoning) => {
            if (token) {
              sendChunk({ requestId: request.requestId, type: 'token', text: token });
            }
            if (reasoning) {
              sendChunk({ requestId: request.requestId, type: 'reasoning', text: reasoning });
            }
          },
          controller.signal
        );
        sendChunk({ requestId: request.requestId, type: 'done', content: res.content, reasoning: res.reasoning });
      } else {
        // Providers without a streaming implementation complete normally, but
        // must not masquerade as progressive streaming.
        const res = await provider.generate(request, apiKey, controller.signal);
        sendChunk({ requestId: request.requestId, type: 'done', content: res.content, reasoning: res.reasoning });
      }
    } catch (err: any) {
      const safeMsg = redactSecretsInString(err.message || 'Stream failed');
      sendChunk({ requestId: request.requestId, type: 'error', error: safeMsg });
    } finally {
      if (request.requestId) {
        this.activeControllers.delete(request.requestId);
      }
    }
  }

  public cancel(requestId: string): void {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(requestId);
    }
  }

  public async testConnection(request: DesktopTestRequest): Promise<DesktopTestResult> {
    const controller = new AbortController();
    const timeoutMs = Math.min(Math.max(request.timeoutMs || 30000, 1000), 300000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const apiKey = credentialService.getApiKey(request.profileId) || '';
      const provider = this.getProvider(request.providerType);
      if (provider instanceof NvidiaDesktopProvider) {
        return await provider.testConnection(request.baseUrl, apiKey, request.model, request.endpoint, controller.signal);
      }
      return await provider.testConnection(request.baseUrl, apiKey, request.model);
    } catch (err: any) {
      return {
        success: false,
        status: 'PROVIDER_ERROR',
        code: 'PROVIDER_ERROR',
        providerId: request.providerType,
        modelId: request.model,
        message: redactSecretsInString(err.message || 'Connection test failed'),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async listModels(request: { profileId: string; providerType: string; baseUrl: string }): Promise<DesktopModelOption[]> {
    try {
      const apiKey = credentialService.getApiKey(request.profileId) || '';
      const provider = this.getProvider(request.providerType);
      if (!('listModels' in provider) || typeof provider.listModels !== 'function') {
        throw new Error(`Model listing is not supported for provider '${request.providerType}'.`);
      }
      const models = await provider.listModels(request.baseUrl, apiKey);
      if (!models.length) {
        throw new Error(`No models were returned by provider '${request.providerType}'.`);
      }
      return models.map((model) => ({ ...model, providerId: model.providerId || request.providerType }));
    } catch (err: any) {
      throw new Error(redactSecretsInString(err.message || 'Model listing failed.'));
    }
  }
}

export const desktopAIService = new DesktopAIService();
