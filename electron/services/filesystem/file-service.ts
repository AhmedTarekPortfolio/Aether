import { dialog, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import {
  DesktopFileOpenOptions,
  DesktopFileOpenResult,
  DesktopFileSaveOptions,
  DesktopFileSaveResult,
} from '../../types/desktop-api.js';

export class FileService {
  public async openFile(window: BrowserWindow | null, options?: DesktopFileOpenOptions): Promise<DesktopFileOpenResult> {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: options?.title || 'Open File',
      buttonLabel: options?.buttonLabel || 'Open',
      filters: options?.filters || [
        { name: 'Aether Backup & Data', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    };

    const res = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (res.canceled || !res.filePaths[0]) {
      return { cancelled: true };
    }

    const filePath = res.filePaths[0];
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { cancelled: false, filePath, content };
    } catch (err: any) {
      throw new Error(`Failed to read file '${filePath}': ${err.message}`);
    }
  }

  public async saveFile(window: BrowserWindow | null, options: DesktopFileSaveOptions): Promise<DesktopFileSaveResult> {
    const dialogOptions: Electron.SaveDialogOptions = {
      title: options.title || 'Save File',
      defaultPath: options.defaultPath || 'aether-backup.json',
      buttonLabel: options.buttonLabel || 'Save',
      filters: options.filters || [
        { name: 'JSON Data', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };

    const res = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);

    if (res.canceled || !res.filePath) {
      return { cancelled: true };
    }

    const filePath = res.filePath;
    try {
      await fs.writeFile(filePath, options.content, 'utf8');
      return { cancelled: false, filePath };
    } catch (err: any) {
      throw new Error(`Failed to save file '${filePath}': ${err.message}`);
    }
  }
}

export const fileService = new FileService();
