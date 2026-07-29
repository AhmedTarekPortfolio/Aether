const { contextBridge, ipcRenderer } = require('electron');

const IPCChannel = {
  AI_GENERATE: 'aether:ai:generate',
  AI_STREAM_START: 'aether:ai:stream-start',
  AI_STREAM_CHUNK: 'aether:ai:stream-chunk',
  AI_CANCEL: 'aether:ai:cancel',
  AI_TEST_CONNECTION: 'aether:ai:test-connection',
  AI_LIST_MODELS: 'aether:ai:list-models',

  CREDENTIALS_SET: 'aether:credentials:set',
  CREDENTIALS_HAS: 'aether:credentials:has',
  CREDENTIALS_REMOVE: 'aether:credentials:remove',
  CREDENTIALS_GET_STATUS: 'aether:credentials:get-status',

  FILES_OPEN: 'aether:files:open',
  FILES_SAVE: 'aether:files:save',

  SOURCES_SELECT_AND_STAGE: 'aether:sources:select-and-stage',
  SOURCES_FINALISE: 'aether:sources:finalise',
  SOURCES_READ_TEXT_ASSET: 'aether:sources:read-text-asset',
  SOURCES_CANCEL: 'aether:sources:cancel',
  SOURCES_RECONCILE: 'aether:sources:reconcile',
  SOURCES_GET_CAPABILITIES: 'aether:sources:get-capabilities',
  SOURCES_PDF_EXTRACT: 'aether:sources:pdf-extract',
  SOURCES_PDF_CANCEL: 'aether:sources:pdf-cancel',
  SOURCES_PDF_PROGRESS: 'aether:sources:pdf-progress',
  SOURCES_PDF_VIEWER_GRANT: 'aether:sources:pdf-viewer-grant',
  SOURCES_PDF_VIEWER_REVOKE: 'aether:sources:pdf-viewer-revoke',

  APP_GET_INFO: 'aether:app:get-info',
  APP_GET_VERSION: 'aether:app:get-version',
  APP_GET_PLATFORM: 'aether:app:get-platform',

  WINDOW_MINIMIZE: 'aether:window:minimize',
  WINDOW_MAXIMIZE: 'aether:window:maximize',
  WINDOW_CLOSE: 'aether:window:close',
};

const aetherDesktopAPI = {
  ai: {
    generate(request) {
      return ipcRenderer.invoke(IPCChannel.AI_GENERATE, request);
    },
    stream(request, onChunk) {
      const channel = IPCChannel.AI_STREAM_CHUNK;

      const listener = (_event, chunk) => {
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
    cancel(requestId) {
      return ipcRenderer.invoke(IPCChannel.AI_CANCEL, requestId);
    },
    testConnection(request) {
      return ipcRenderer.invoke(IPCChannel.AI_TEST_CONNECTION, request);
    },
    listModels(request) {
      return ipcRenderer.invoke(IPCChannel.AI_LIST_MODELS, request);
    },
  },
  credentials: {
    set(input) {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_SET, input);
    },
    has(profileId) {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_HAS, profileId);
    },
    remove(profileId) {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_REMOVE, profileId);
    },
    getStatus(profileId) {
      return ipcRenderer.invoke(IPCChannel.CREDENTIALS_GET_STATUS, profileId);
    },
  },
  files: {
    openFile(options) {
      return ipcRenderer.invoke(IPCChannel.FILES_OPEN, options);
    },
    saveFile(options) {
      return ipcRenderer.invoke(IPCChannel.FILES_SAVE, options);
    },
  },
  sources: {
    selectAndStage(request) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_SELECT_AND_STAGE, request);
    },
    finalise(request) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_FINALISE, request);
    },
    readTextAsset(request) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_READ_TEXT_ASSET, request);
    },
    cancel(stagingToken) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_CANCEL, stagingToken);
    },
    reconcile() {
      return ipcRenderer.invoke(IPCChannel.SOURCES_RECONCILE);
    },
    getCapabilities() {
      return ipcRenderer.invoke(IPCChannel.SOURCES_GET_CAPABILITIES);
    },
    extractPdf(request, onProgress) {
      const listener = (_event, progress) => {
        if (progress && progress.jobId === request.jobId) onProgress(progress);
      };
      ipcRenderer.on(IPCChannel.SOURCES_PDF_PROGRESS, listener);
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_EXTRACT, request)
        .finally(() => {
          ipcRenderer.removeListener(IPCChannel.SOURCES_PDF_PROGRESS, listener);
        });
    },
    cancelPdf(request) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_CANCEL, request);
    },
    createPdfViewerGrant(request) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_VIEWER_GRANT, request);
    },
    revokePdfViewerGrant(request) {
      return ipcRenderer.invoke(IPCChannel.SOURCES_PDF_VIEWER_REVOKE, request);
    },
  },
  app: {
    getInfo() {
      return ipcRenderer.invoke(IPCChannel.APP_GET_INFO);
    },
    getVersion() {
      return ipcRenderer.invoke(IPCChannel.APP_GET_VERSION);
    },
    getPlatform() {
      return ipcRenderer.invoke(IPCChannel.APP_GET_PLATFORM);
    },
  },
  window: {
    minimize() {
      return ipcRenderer.invoke(IPCChannel.WINDOW_MINIMIZE);
    },
    maximize() {
      return ipcRenderer.invoke(IPCChannel.WINDOW_MAXIMIZE);
    },
    close() {
      return ipcRenderer.invoke(IPCChannel.WINDOW_CLOSE);
    },
  },
};

// Expose safe, typed API to main world
contextBridge.exposeInMainWorld('aetherDesktop', aetherDesktopAPI);
