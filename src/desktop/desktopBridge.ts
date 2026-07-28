import { isDesktop } from './isDesktop';
import { browserFallback } from './browserFallback';
import {
  AIConnectionStatus,
  NormalizedAIResponse,
  AIConnectionTestResult,
  AIModelOption,
  AIStreamHandlers,
} from '../services/ai/types';
import { CredentialStatus, AITransportChatRequest } from '../services/ai/aetherTransport';
import type {
  AssetFinalisationRequest,
  ReadManagedTextAssetRequest,
  SourceFileSelectionRequest,
} from '../../electron/types/source-storage';

export const desktopBridge = {
  async send(request: AITransportChatRequest, signal?: AbortSignal): Promise<NormalizedAIResponse> {
    if (isDesktop() && window.aetherDesktop) {
      const desktopReq = {
        ...request,
        requestId: request.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
      return window.aetherDesktop.ai.generate(desktopReq);
    }
    return browserFallback.send(request, signal);
  },

  async stream(request: AITransportChatRequest, handlers: AIStreamHandlers, signal?: AbortSignal): Promise<void> {
    if (isDesktop() && window.aetherDesktop) {
      const requestId = request.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const desktopReq = {
        ...request,
        requestId,
      };

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        let unlisten = () => {};

        const cleanup = () => {
          unlisten();
          signal?.removeEventListener('abort', handleAbort);
        };
        const settle = (error?: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve();
        };
        const handleAbort = () => {
          void window.aetherDesktop?.ai.cancel(requestId);
          settle(new Error('Streaming cancelled by user.'));
        };

        unlisten = window.aetherDesktop!.ai.stream(desktopReq, (chunk) => {
          if (settled) return;
          if (chunk.type === 'token' && chunk.text) {
            handlers.onToken(chunk.text);
          } else if (chunk.type === 'reasoning' && chunk.text) {
            handlers.onReasoningToken?.(chunk.text);
          } else if (chunk.type === 'done') {
            handlers.onComplete(chunk.content || '', chunk.reasoning);
            settle();
          } else if (chunk.type === 'error') {
            const error = new Error(chunk.error || 'Desktop stream error');
            handlers.onError(error);
            settle(error);
          }
        });

        if (signal?.aborted) {
          handleAbort();
        } else {
          signal?.addEventListener('abort', handleAbort, { once: true });
        }
      });
    }

    return browserFallback.stream(request, handlers, signal);
  },

  async testConnection(request: any, signal?: AbortSignal): Promise<AIConnectionTestResult> {
    if (isDesktop() && window.aetherDesktop) {
      const res = await window.aetherDesktop.ai.testConnection(request);
      return {
        ...res,
        status: res.status as AIConnectionStatus,
      };
    }
    return browserFallback.testConnection(request, signal);
  },

  async listModels(request: any, signal?: AbortSignal): Promise<AIModelOption[]> {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.ai.listModels(request);
    }
    return browserFallback.listModels(request, signal);
  },

  async saveCredential(profileId: string, apiKey: string, organizationId?: string): Promise<{ success: boolean; mask: string }> {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.credentials.set({ profileId, apiKey, organizationId });
    }
    return browserFallback.saveCredential(profileId, apiKey, organizationId);
  },

  async deleteCredential(profileId: string): Promise<void> {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.credentials.remove(profileId);
    }
    return browserFallback.deleteCredential(profileId);
  },

  async getCredentialStatus(profileId: string): Promise<CredentialStatus> {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.credentials.getStatus(profileId);
    }
    return browserFallback.getCredentialStatus(profileId);
  },

  async openFile(options?: any) {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.files.openFile(options);
    }
    return { cancelled: true };
  },

  async saveFile(options: { content: string; title?: string; defaultPath?: string }) {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.files.saveFile(options);
    }
    return { cancelled: true };
  },

  async selectAndStageSources(request: SourceFileSelectionRequest) {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.sources.selectAndStage(request);
    }
    return browserFallback.selectAndStageSources();
  },

  async finaliseSourceAsset(request: AssetFinalisationRequest) {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.sources.finalise(request);
    }
    return browserFallback.finaliseSourceAsset();
  },

  async readManagedTextAsset(request: ReadManagedTextAssetRequest) {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.sources.readTextAsset(request);
    }
    return browserFallback.readManagedTextAsset();
  },

  async cancelSourceStaging(stagingToken: string) {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.sources.cancel(stagingToken);
    }
    return { cancelled: false };
  },

  async reconcileSourceFilesystem() {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.sources.reconcile();
    }
    throw new Error('Managed source storage is available only in the desktop application.');
  },

  async getSourceStorageCapabilities() {
    if (isDesktop() && window.aetherDesktop) {
      return window.aetherDesktop.sources.getCapabilities();
    }
    return {
      available: false,
      supportedExtensions: [],
      maximumFileCount: 0,
      sizeLimits: { text: 0, markdown: 0, pdf: 0, image: 0 },
      stagingReceiptLifetimeMs: 0,
      physicalAssetScope: 'shared-content-addressed' as const,
    };
  },
};
