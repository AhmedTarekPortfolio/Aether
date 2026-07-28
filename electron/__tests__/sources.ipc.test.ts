import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  service: {
    selectAndStage: vi.fn(),
    finalise: vi.fn(),
    readTextAsset: vi.fn(),
    cancel: vi.fn(),
    reconcile: vi.fn(),
    getCapabilities: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../services/sources/source-storage-provider.js', () => ({
  getSourceStorageService: () => mocks.service,
}));

import { registerSourcesIPCHandlers } from '../ipc/sources.ipc';
import { IPCChannel } from '../types/ipc-contracts';

describe('source-storage IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    registerSourcesIPCHandlers({} as never);
  });

  it('registers exactly the six narrow source channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual([
      IPCChannel.SOURCES_CANCEL,
      IPCChannel.SOURCES_FINALISE,
      IPCChannel.SOURCES_GET_CAPABILITIES,
      IPCChannel.SOURCES_READ_TEXT_ASSET,
      IPCChannel.SOURCES_RECONCILE,
      IPCChannel.SOURCES_SELECT_AND_STAGE,
    ].sort());
  });

  it('validates managed text reads before calling the service', async () => {
    const handler = mocks.handlers.get(IPCChannel.SOURCES_READ_TEXT_ASSET)!;
    await expect(handler({}, {
      relativePath: 'C:\\private.txt',
      expectedContentHash: 'a'.repeat(64),
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(mocks.service.readTextAsset).not.toHaveBeenCalled();

    const request = {
      relativePath: `assets/aa/${'a'.repeat(64)}.txt`,
      expectedContentHash: 'a'.repeat(64),
    };
    mocks.service.readTextAsset.mockResolvedValue({
      text: 'safe',
      contentHash: request.expectedContentHash,
      mimeType: 'text/plain',
      extension: 'txt',
      byteSize: 4,
    });
    await expect(handler({}, request)).resolves.toMatchObject({
      ok: true,
      value: { text: 'safe', byteSize: 4 },
    });
  });

  it('rejects invalid selection before the native dialog service is reached', async () => {
    const handler = mocks.handlers.get(IPCChannel.SOURCES_SELECT_AND_STAGE)!;
    const result = await handler({}, {
      selectionMode: 'single',
      allowedKinds: ['pdf'],
      maximumFileCount: 1,
      filePath: 'C:\\private.pdf',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'The source-storage request is invalid.',
      },
    });
    expect(mocks.service.selectAndStage).not.toHaveBeenCalled();
  });

  it('passes validated requests and maps stable service errors', async () => {
    const request = {
      selectionMode: 'single',
      allowedKinds: ['pdf'],
      maximumFileCount: 1,
    };
    mocks.service.selectAndStage.mockResolvedValueOnce({ cancelled: true, receipts: [] });
    const handler = mocks.handlers.get(IPCChannel.SOURCES_SELECT_AND_STAGE)!;
    await expect(handler({}, request)).resolves.toEqual({
      ok: true,
      value: { cancelled: true, receipts: [] },
    });
    expect(mocks.service.selectAndStage).toHaveBeenCalledWith({}, request);

    mocks.service.finalise.mockRejectedValueOnce(
      Object.assign(new Error('hidden path'), { code: 'STAGING_TOKEN_UNKNOWN' }),
    );
    const finalise = mocks.handlers.get(IPCChannel.SOURCES_FINALISE)!;
    const result = await finalise({}, { stagingToken: 'a'.repeat(64) });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'SOURCE_STORAGE_UNAVAILABLE',
        message: 'Managed source storage could not be initialised.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('hidden path');
  });

  it('makes invalid or repeated cancellation safe', async () => {
    const cancel = mocks.handlers.get(IPCChannel.SOURCES_CANCEL)!;
    expect(await cancel({}, '')).toEqual({ cancelled: false });
    expect(mocks.service.cancel).not.toHaveBeenCalled();

    mocks.service.cancel.mockResolvedValue({ cancelled: false });
    expect(await cancel({}, 'a'.repeat(64))).toEqual({ cancelled: false });
  });
});
