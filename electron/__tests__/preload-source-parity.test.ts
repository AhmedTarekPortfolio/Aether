import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPCChannel } from '../types/ipc-contracts';

const sourceMethods = [
  'selectAndStage',
  'finalise',
  'cancel',
  'reconcile',
  'getCapabilities',
] as const;

const sourceChannels = [
  IPCChannel.SOURCES_SELECT_AND_STAGE,
  IPCChannel.SOURCES_FINALISE,
  IPCChannel.SOURCES_CANCEL,
  IPCChannel.SOURCES_RECONCILE,
  IPCChannel.SOURCES_GET_CAPABILITIES,
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
