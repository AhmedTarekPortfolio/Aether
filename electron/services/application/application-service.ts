import { app } from 'electron';
import process from 'node:process';
import { DesktopAppInfo } from '../../types/desktop-api.js';

export class ApplicationService {
  public getInfo(): DesktopAppInfo {
    return {
      name: app.getName() || 'Aether',
      version: app.getVersion() || '1.0.0',
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath('userData'),
    };
  }

  public getVersion(): string {
    return app.getVersion() || '1.0.0';
  }

  public getPlatform(): string {
    return process.platform;
  }
}

export const applicationService = new ApplicationService();
