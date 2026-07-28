import { app, dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';
import { SourceStorageService } from './source-storage-service.js';

let service: SourceStorageService | null = null;

export function getSourceStorageService(): SourceStorageService {
  if (!service) {
    service = new SourceStorageService({
      userDataPath: app.getPath('userData'),
      dialog: {
        showOpenDialog(window: BrowserWindow | null, options: OpenDialogOptions) {
          return window
            ? dialog.showOpenDialog(window, options)
            : dialog.showOpenDialog(options);
        },
      },
    });
  }
  return service;
}

export async function initializeSourceStorage(): Promise<void> {
  const sourceStorage = getSourceStorageService();
  await sourceStorage.initialize();
  const report = await sourceStorage.reconcile();
  console.info('[SourceStorage] Reconciliation complete', {
    expiredStagingFiles: report.expiredStagingFiles,
    removedTemporaryFiles: report.removedTemporaryFiles,
    quarantinedFiles: report.quarantinedFiles,
    malformedEntries: report.malformedEntries,
    unresolvedAssetCount: report.unresolvedAssetFiles.length,
    resultTruncated: report.resultTruncated,
  });
}
