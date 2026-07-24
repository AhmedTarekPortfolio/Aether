import { BrowserWindow, shell } from 'electron';

export function setupNavigationPolicy(window: BrowserWindow): void {
  // Prevent untrusted in-app frame navigation
  window.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // Allow dev server hot reloads
    if (parsedUrl.origin.startsWith('http://localhost:5173') || parsedUrl.origin.startsWith('http://127.0.0.1:5173')) {
      return;
    }
    // Block all other navigation inside the main window
    event.preventDefault();
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      shell.openExternal(url);
    }
  });

  // Intercept window.open / target="_blank" links and open in external default OS browser
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Invalid URL ignored
    }
    return { action: 'deny' };
  });
}
