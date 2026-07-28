import { BrowserWindow } from 'electron';
import { registerAIIPCHandlers } from './ai.ipc.js';
import { registerCredentialsIPCHandlers } from './credentials.ipc.js';
import { registerFilesIPCHandlers } from './files.ipc.js';
import { registerSettingsIPCHandlers } from './settings.ipc.js';
import { registerSourcesIPCHandlers } from './sources.ipc.js';
import { registerWindowIPCHandlers } from './window.ipc.js';

export function registerAllIPCHandlers(window: BrowserWindow): void {
  registerAIIPCHandlers(window);
  registerCredentialsIPCHandlers();
  registerFilesIPCHandlers(window);
  registerSettingsIPCHandlers();
  registerSourcesIPCHandlers(window);
  registerWindowIPCHandlers(window);
}
