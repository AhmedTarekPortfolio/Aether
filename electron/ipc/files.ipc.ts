import { ipcMain, BrowserWindow } from 'electron';
import { IPCChannel } from '../types/ipc-contracts.js';
import { fileService } from '../services/filesystem/file-service.js';

export function registerFilesIPCHandlers(window: BrowserWindow): void {
  ipcMain.handle(IPCChannel.FILES_OPEN, async (_event, options) => {
    return fileService.openFile(window, options);
  });

  ipcMain.handle(IPCChannel.FILES_SAVE, async (_event, options) => {
    if (!options || typeof options.content !== 'string') {
      throw new Error('Save options must contain content string');
    }
    return fileService.saveFile(window, options);
  });
}
