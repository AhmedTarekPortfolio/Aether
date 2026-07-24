import { ipcMain } from 'electron';
import { IPCChannel } from '../types/ipc-contracts.js';
import { applicationService } from '../services/application/application-service.js';

export function registerSettingsIPCHandlers(): void {
  ipcMain.handle(IPCChannel.APP_GET_INFO, async () => {
    return applicationService.getInfo();
  });

  ipcMain.handle(IPCChannel.APP_GET_VERSION, async () => {
    return applicationService.getVersion();
  });

  ipcMain.handle(IPCChannel.APP_GET_PLATFORM, async () => {
    return applicationService.getPlatform();
  });
}
