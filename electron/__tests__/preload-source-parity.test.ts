import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPCChannel } from '../types/ipc-contracts';

const sourceMethods = [
  'selectAndStage',
  'finalise',
  'readTextAsset',
  'deleteManagedAsset',
  'cancel',
  'reconcile',
  'getCapabilities',
  'extractPdf',
  'cancelPdf',
  'createPdfViewerGrant',
  'revokePdfViewerGrant',
] as const;

const sourceChannels = [
  IPCChannel.SOURCES_SELECT_AND_STAGE,
  IPCChannel.SOURCES_FINALISE,
  IPCChannel.SOURCES_READ_TEXT_ASSET,
  IPCChannel.SOURCES_DELETE_MANAGED_ASSET,
  IPCChannel.SOURCES_CANCEL,
  IPCChannel.SOURCES_RECONCILE,
  IPCChannel.SOURCES_GET_CAPABILITIES,
  IPCChannel.SOURCES_PDF_EXTRACT,
  IPCChannel.SOURCES_PDF_CANCEL,
  IPCChannel.SOURCES_PDF_PROGRESS,
  IPCChannel.SOURCES_PDF_VIEWER_GRANT,
  IPCChannel.SOURCES_PDF_VIEWER_REVOKE,
] as const;

describe('source preload parity', () => {
  it('keeps TypeScript and CommonJS preloads on the same narrow source surface', () => {
    const root = process.cwd();
    const typed = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');
    const commonJs = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
    const desktopApi = fs.readFileSync(path.join(root, 'electron', 'types', 'desktop-api.ts'), 'utf8');

    for (const method of sourceMethods) {
      expect(typed).toContain(`${method}(`);
      expect(commonJs).toContain(`${method}(`);
      expect(desktopApi).toContain(`${method}(`);
    }
    for (const channel of sourceChannels) {
      expect(commonJs).toContain(channel);
    }
    expect(typed).not.toContain('ipcRenderer:');
    expect(commonJs).not.toContain('ipcRenderer:');
    expect(desktopApi).not.toMatch(/\b(readFile|writeFile|deleteFile|listDirectory)\s*\(/);
  });
});
