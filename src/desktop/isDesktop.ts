import './desktopTypes';

/**
 * Returns true if the application is running inside the native Electron desktop shell.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.aetherDesktop;
}
