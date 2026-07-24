import { AetherDesktopAPI } from '../../electron/types/desktop-api';

declare global {
  interface Window {
    aetherDesktop?: AetherDesktopAPI;
  }
}

export {};
