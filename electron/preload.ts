import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannel } from './types/ipc-contracts.js';
import {
  DesktopAIRequest,
  DesktopAIResponse,
  DesktopStreamChunk,
  DesktopTestRequest,
  DesktopTestResult,
  DesktopModelOption,
  DesktopCredentialInput,
  DesktopCredentialStatus,
  DesktopFileOpenOptions,
  DesktopFileOpenResult,
  DesktopFileSaveOptions,
  DesktopFileSaveResult,
  DesktopAppInfo,
  AetherDesktopAPI,
} from './types/desktop-api.js';

const aetherDesktopAPI: AetherDesktopAPI = {
  ai: {
    generate(request: DesktopAIRequest): Promise<DesktopAIResponse> {
      return ipcRenderer.invoke(IPCChannel.AI_GENERATE, request);
    },
    stream(
      request: DesktopAIRequest,
      onChunk: (chunk: DesktopStreamChunk) => void
    ): () => void {
      const channel = IPCChannel.AI_STREAM_CHUNK;

      const listener = (_event: Electron.IpcRendererEvent, chunk: DesktopStreamChunk) => {
        if (chunk && chunk.requestId === request.requestId) {
          onChunk(chunk);
          if (chunk.type === 'done' || chunk.type === 'error') {
            ipcRenderer.removeListener(channel, listener);
          }
        }
      };

      ipcRenderer.on(channel, listener);
      ipcRenderer.invoke(IPCChannel.AI_STREAM_START, request).catch((err) => {
        onChunk({
          requestId: request.requestId,
          type: 'error',
          error: err?.message || 'Failed to start stream',
        });
        ipcRenderer.removeListener(channel, listener);
      });

      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
    cancel(requestId: string): Promise<void> {
      return ipcRenderer.invoke(IPCChannel.AI_CANCEL, requestId);
    },
    testConnection(request: DesktopTestRequest): Promise<DesktopTestResult> {
      return ipcRenderer.invoke(IPCChannel.AI_TEST_CONNECTION, request);
    },
    listModels(request: { profileId: string; providerType: string; baseUrl: string }): Promise<DesktopModelOption[]> {
      return ipcRenderer.invoke(IPCChannel.AI_LIST_MODELS, request);
    },
  },
  credentials: {
    set(input: DesktopCredentialInput): Promise<{ success: boolean; mask: string }> {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_SET, input);
    },
    has(profileId: string): Promise<boolean> {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_HAS, profileId);
    },
    remove(profileId: string): Promise<void> {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_REMOVE, profileId);
    },
    getStatus(profileId: string): Promise<DesktopCredentialStatus> {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_GET_STATUS, profileId);
    },
  },
  files: {
    openFile(options?: DesktopFileOpenOptions): Promise<DesktopFileOpenResult> {
      return ipcRenderer.invoke(IPCChannel.FILES_OPEN, options);
    },
    saveFile(options: DesktopFileSaveOptions): Promise<DesktopFileSaveResult> {
      return ipcRenderer.invoke(IPCChannel.FILES_SAVE, options);
    },
  },
  app: {
    getInfo(): Promise<DesktopAppInfo> {
      return ipcRenderer.invoke(IPCChannel.APP_GET_INFO);
    },
    getVersion(): Promise<string> {
      return ipcRenderer.invoke(IPCChannel.APP_GET_VERSION);
    },
    getPlatform(): Promise<string> {
      return ipcRenderer.invoke(IPCChannel.APP_GET_PLATFORM);
    },
  },
  window: {
    minimize(): Promise<void> {
      return ipcRenderer.invoke(IPCChannel.WINDOW_MINIMIZE);
    },
    maximize(): Promise<void> {
      return ipcRenderer.invoke(IPCChannel.WINDOW_MAXIMIZE);
    },
    close(): Promise<void> {
      return ipcRenderer.invoke(IPCChannel.WINDOW_CLOSE);
    },
  },
};

// Expose safe, typed API to main world
contextBridge.exposeInMainWorld('aetherDesktop', aetherDesktopAPI);
