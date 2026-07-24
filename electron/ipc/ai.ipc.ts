import { ipcMain, BrowserWindow } from 'electron';
import { IPCChannel } from '../types/ipc-contracts.js';
import { desktopAIService, redactSecretsInString } from '../services/ai/desktop-ai-service.js';
import { validateAIRequest, validateString } from '../security/validate-ipc-input.js';

export function registerAIIPCHandlers(window: BrowserWindow): void {
  ipcMain.handle(IPCChannel.AI_GENERATE, async (_event, request) => {
    const val = validateAIRequest(request);
    if (!val.valid) {
      throw new Error(`Invalid IPC AI Request: ${val.error}`);
    }
    return desktopAIService.generate(request);
  });

  ipcMain.handle(IPCChannel.AI_STREAM_START, async (_event, request) => {
    const val = validateAIRequest(request);
    if (!val.valid) {
      throw new Error(`Invalid IPC AI Stream Request: ${val.error}`);
    }
    void desktopAIService.stream(window, request).catch((error) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPCChannel.AI_STREAM_CHUNK, {
          requestId: request.requestId,
          type: 'error',
          error: redactSecretsInString(error?.message || 'Stream execution failed.'),
        });
      }
    });
    return { success: true };
  });

  ipcMain.handle(IPCChannel.AI_CANCEL, async (_event, requestId) => {
    const val = validateString(requestId, 'requestId');
    if (val.valid) {
      desktopAIService.cancel(requestId);
    }
    return { success: true };
  });

  ipcMain.handle(IPCChannel.AI_TEST_CONNECTION, async (_event, request) => {
    if (!request || typeof request.profileId !== 'string' || typeof request.providerType !== 'string' || typeof request.baseUrl !== 'string') {
      throw new Error('Invalid IPC connection-test request.');
    }
    return desktopAIService.testConnection(request);
  });

  ipcMain.handle(IPCChannel.AI_LIST_MODELS, async (_event, request) => {
    if (!request || typeof request.profileId !== 'string' || typeof request.providerType !== 'string' || typeof request.baseUrl !== 'string') {
      throw new Error('Invalid IPC model-list request.');
    }
    return desktopAIService.listModels(request);
  });
}
