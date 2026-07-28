import { ipcMain, type BrowserWindow } from 'electron';
import {
  validateAssetFinalisationRequest,
  validateSourceFileSelectionRequest,
  validateStagingToken,
} from '../security/validate-ipc-input.js';
import { getSourceStorageService } from '../services/sources/source-storage-provider.js';
import {
  sourceOperationFailure,
  SourceStorageError,
} from '../services/sources/source-storage-errors.js';
import { IPCChannel } from '../types/ipc-contracts.js';
import type {
  AssetFinalisationRequest,
  AssetFinalisationResult,
  SourceFileSelectionRequest,
  SourceStageOperationResult,
} from '../types/source-storage.js';

export function registerSourcesIPCHandlers(window: BrowserWindow): void {
  ipcMain.handle(
    IPCChannel.SOURCES_SELECT_AND_STAGE,
    async (_event, input: unknown): Promise<SourceStageOperationResult> => {
      const validation = validateSourceFileSelectionRequest(input);
      if (!validation.valid) return sourceOperationFailure(
        new SourceStorageError('INVALID_REQUEST'),
      );
      try {
        const value = await getSourceStorageService().selectAndStage(
          window,
          input as SourceFileSelectionRequest,
        );
        return { ok: true, value };
      } catch (error) {
        return sourceOperationFailure(error);
      }
    },
  );

  ipcMain.handle(
    IPCChannel.SOURCES_FINALISE,
    async (_event, input: unknown): Promise<AssetFinalisationResult> => {
      const validation = validateAssetFinalisationRequest(input);
      if (!validation.valid) return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'The source-storage request is invalid.' },
      };
      try {
        const request = input as AssetFinalisationRequest;
        return {
          ok: true,
          value: await getSourceStorageService().finalise(request.stagingToken),
        };
      } catch (error) {
        return sourceOperationFailure(error);
      }
    },
  );

  ipcMain.handle(IPCChannel.SOURCES_CANCEL, async (_event, input: unknown) => {
    const validation = validateStagingToken(input);
    if (!validation.valid) return { cancelled: false };
    return getSourceStorageService().cancel(input as string);
  });

  ipcMain.handle(IPCChannel.SOURCES_RECONCILE, async () => {
    return getSourceStorageService().reconcile();
  });

  ipcMain.handle(IPCChannel.SOURCES_GET_CAPABILITIES, async () => {
    return getSourceStorageService().getCapabilities();
  });
}
