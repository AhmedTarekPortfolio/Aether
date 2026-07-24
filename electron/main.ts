import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { registerAllIPCHandlers } from './ipc/register-ipc-handlers.js';
import { setupNavigationPolicy } from './security/navigation-policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow(): void {
  const isDev = process.env.NODE_ENV === 'development';

  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
    ? path.join(__dirname, 'preload.cjs')
    : path.join(__dirname, 'preload.js');
  const rendererPath = path.join(app.getAppPath(), 'dist', 'index.html');
  const fallbackPath = path.join(__dirname, '../dist/index.html');

  const resolvedRendererPath = fs.existsSync(rendererPath)
    ? rendererPath
    : fs.existsSync(fallbackPath)
      ? fallbackPath
      : rendererPath;

  console.log('ELECTRON_STARTUP_DIAGNOSTICS:', {
    isPackaged: app.isPackaged,
    nodeEnv: process.env.NODE_ENV,
    appPath: app.getAppPath(),
    dirname: __dirname,
    rendererPath,
    fallbackPath,
    resolvedRendererPath,
    preloadPath,
    rendererExists: fs.existsSync(resolvedRendererPath),
    preloadExists: fs.existsSync(preloadPath),
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 1024,
    minHeight: 700,
    title: 'Aether — Intelligent Study & Productivity Workspace',
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('Preload failed', {
      preloadPath,
      error,
    });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process terminated', details);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer:${level}]`, message, sourceId, line);
  });

  // Setup IPC Handlers
  registerAllIPCHandlers(mainWindow);

  // Setup Navigation Security Policy
  setupNavigationPolicy(mainWindow);

  // Ready to show
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load URL or file
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    try {
      mainWindow.loadFile(resolvedRendererPath);
    } catch (error) {
      console.error('Failed to load renderer', error);
    }
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
