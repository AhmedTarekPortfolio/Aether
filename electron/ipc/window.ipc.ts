import { ipcMain, BrowserWindow } from 'electron';
import { IPCChannel } from '../types/ipc-contracts.js';

export function registerWindowIPCHandlers(window: BrowserWindow): void {
  ipcMain.handle(IPCChannel.WINDOW_MINIMIZE, async () => {
    if (!window.isDestroyed()) {
      window.minimize();
    }
  });

  ipcMain.handle(IPCChannel.WINDOW_MAXIMIZE, async () => {
    if (!window.isDestroyed()) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  });

  ipcMain.handle(IPCChannel.WINDOW_CLOSE, async () => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });
}
