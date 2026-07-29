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
import type {
  AssetFinalisationRequest,
  AssetFinalisationResult,
  ReadManagedTextAssetRequest,
  ReadManagedTextAssetResult,
  SourceCancellationResult,
  SourceFileSelectionRequest,
  SourceFilesystemReconciliationReport,
  SourceStageOperationResult,
  SourceStorageCapabilities,
} from './types/source-storage.js';
import type {
  PdfCancellationRequest,
  PdfCancellationResult,
  PdfExtractionJobRequest,
  PdfExtractionOperationResult,
  PdfJobProgress,
  PdfViewerGrantRequest,
  PdfViewerGrantResult,
  PdfViewerRevokeRequest,
} from './types/pdf.js';

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
  sources: {
    selectAndStage(request: SourceFileSelectionRequest): Promise<SourceStageOperationResult> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_SELECT_AND_STAGE, request);
    },
    finalise(request: AssetFinalisationRequest): Promise<AssetFinalisationResult> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_FINALISE, request);
    },
    readTextAsset(request: ReadManagedTextAssetRequest): Promise<ReadManagedTextAssetResult> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_READ_TEXT_ASSET, request);
    },
    cancel(stagingToken: string): Promise<SourceCancellationResult> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_CANCEL, stagingToken);
    },
    reconcile(): Promise<SourceFilesystemReconciliationReport> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_RECONCILE);
    },
    getCapabilities(): Promise<SourceStorageCapabilities> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_GET_CAPABILITIES);
    },
    extractPdf(
      request: PdfExtractionJobRequest,
      onProgress: (progress: PdfJobProgress) => void,
    ): Promise<PdfExtractionOperationResult> {
      const listener = (_event: Electron.IpcRendererEvent, progress: PdfJobProgress) => {
        if (progress?.jobId === request.jobId) onProgress(progress);
      };
      ipcRenderer.on(IPCChannel.SOURCES_PDF_PROGRESS, listener);
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_EXTRACT, request)
        .finally(() => {
          ipcRenderer.removeListener(IPCChannel.SOURCES_PDF_PROGRESS, listener);
        });
    },
    cancelPdf(request: PdfCancellationRequest): Promise<PdfCancellationResult> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_CANCEL, request);
    },
    createPdfViewerGrant(request: PdfViewerGrantRequest): Promise<PdfViewerGrantResult> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_VIEWER_GRANT, request);
    },
    revokePdfViewerGrant(request: PdfViewerRevokeRequest): Promise<{ revoked: boolean }> {
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_VIEWER_REVOKE, request);
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
