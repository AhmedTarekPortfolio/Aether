import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  validateAssetFinalisationRequest,
  validateDeleteManagedAssetRequest,
  validateReadManagedTextAssetRequest,
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
  DeleteManagedAssetResult,
  ReadManagedTextAssetResult,
  SourceFileSelectionRequest,
  SourceStageOperationResult,
} from '../types/source-storage.js';
import type {
  PdfCancellationResult,
  PdfExtractionOperationResult,
  PdfViewerGrantResult,
} from '../types/pdf.js';
import {
  validatePdfCancellationRequest,
  validatePdfExtractionRequest,
  validatePdfViewerGrantRequest,
  validatePdfViewerRevokeRequest,
} from '../services/sources/pdf/pdf-validator.js';
import {
  getPdfParserHost,
} from '../services/sources/pdf/pdf-parser-host.js';
import {
  getPdfViewerService,
} from '../services/sources/pdf/pdf-viewer-service.js';
import { pdfOperationFailure } from '../services/sources/pdf/pdf-errors.js';

function trustedSender(window: BrowserWindow, event: IpcMainInvokeEvent): boolean {
  return !window.isDestroyed()
    && !event.sender.isDestroyed()
    && event.sender.id === window.webContents.id;
}

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
    IPCChannel.SOURCES_READ_TEXT_ASSET,
    async (_event, input: unknown): Promise<ReadManagedTextAssetResult> => {
      if (!validateReadManagedTextAssetRequest(input)) {
        return sourceOperationFailure(new SourceStorageError('INVALID_REQUEST'));
      }
      try {
        return {
          ok: true,
          value: await getSourceStorageService().readTextAsset(input),
        };
      } catch (error) {
        return sourceOperationFailure(error);
      }
    },
  );

  ipcMain.handle(
    IPCChannel.SOURCES_DELETE_MANAGED_ASSET,
    async (event, input: unknown): Promise<DeleteManagedAssetResult> => {
      if (!trustedSender(window, event) || !validateDeleteManagedAssetRequest(input)) {
        return sourceOperationFailure(new SourceStorageError('INVALID_REQUEST'));
      }
      try {
        return {
          ok: true,
          value: await getSourceStorageService().deleteManagedAsset(input),
        };
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

  ipcMain.handle(
    IPCChannel.SOURCES_PDF_EXTRACT,
    async (event, input: unknown): Promise<PdfExtractionOperationResult> => {
      if (!trustedSender(window, event)) return pdfOperationFailure('PDF_OUTPUT_INVALID');
      let request;
      try {
        request = validatePdfExtractionRequest(input);
      } catch {
        return pdfOperationFailure('PDF_OUTPUT_INVALID');
      }
      const value = await getPdfParserHost().extract(request, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPCChannel.SOURCES_PDF_PROGRESS, progress);
        }
      });
      return { ok: true, value };
    },
  );

  ipcMain.handle(
    IPCChannel.SOURCES_PDF_CANCEL,
    async (event, input: unknown): Promise<PdfCancellationResult> => {
      if (!trustedSender(window, event)) return { cancelled: false };
      try {
        return {
          cancelled: getPdfParserHost().cancel(validatePdfCancellationRequest(input)),
        };
      } catch {
        return { cancelled: false };
      }
    },
  );

  ipcMain.handle(
    IPCChannel.SOURCES_PDF_VIEWER_GRANT,
    async (event, input: unknown): Promise<PdfViewerGrantResult> => {
      if (!trustedSender(window, event)) return pdfOperationFailure('PDF_OUTPUT_INVALID');
      try {
        return {
          ok: true,
          value: await getPdfViewerService().createGrant(
            event.sender.id,
            validatePdfViewerGrantRequest(input),
          ),
        };
      } catch (error) {
        if (error instanceof SourceStorageError) {
          if (error.code === 'MANAGED_ASSET_NOT_FOUND') {
            return pdfOperationFailure('PDF_ASSET_MISSING');
          }
          if (error.code === 'MANAGED_ASSET_IDENTITY_MISMATCH') {
            return pdfOperationFailure('PDF_HASH_MISMATCH');
          }
        }
        return pdfOperationFailure('PDF_OUTPUT_INVALID');
      }
    },
  );

  ipcMain.handle(
    IPCChannel.SOURCES_PDF_VIEWER_REVOKE,
    async (event, input: unknown): Promise<{ revoked: boolean }> => {
      if (!trustedSender(window, event)) return { revoked: false };
      try {
        const request = validatePdfViewerRevokeRequest(input);
        return {
          revoked: getPdfViewerService().revoke(event.sender.id, request.url),
        };
      } catch {
        return { revoked: false };
      }
    },
  );

  window.webContents.once('destroyed', () => {
    getPdfViewerService().revokeSender(window.webContents.id);
  });
}
