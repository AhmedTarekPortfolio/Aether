import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  service: {
    selectAndStage: vi.fn(),
    finalise: vi.fn(),
    readTextAsset: vi.fn(),
    deleteManagedAsset: vi.fn(),
    cancel: vi.fn(),
    reconcile: vi.fn(),
    getCapabilities: vi.fn(),
  },
  parser: {
    extract: vi.fn(),
    cancel: vi.fn(),
  },
  viewer: {
    createGrant: vi.fn(),
    revoke: vi.fn(),
    revokeSender: vi.fn(),
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

vi.mock('../services/sources/pdf/pdf-parser-host.js', () => ({
  getPdfParserHost: () => mocks.parser,
}));

vi.mock('../services/sources/pdf/pdf-viewer-service.js', () => ({
  getPdfViewerService: () => mocks.viewer,
}));

import { registerSourcesIPCHandlers } from '../ipc/sources.ipc';
import { IPCChannel } from '../types/ipc-contracts';

describe('source-storage IPC handlers', () => {
  const window = {
    isDestroyed: () => false,
    webContents: {
      id: 7,
      once: vi.fn(),
    },
  };

  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    registerSourcesIPCHandlers(window as never);
  });

  it('registers the narrow storage and PDF source channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual([
      IPCChannel.SOURCES_CANCEL,
      IPCChannel.SOURCES_FINALISE,
      IPCChannel.SOURCES_GET_CAPABILITIES,
      IPCChannel.SOURCES_READ_TEXT_ASSET,
      IPCChannel.SOURCES_DELETE_MANAGED_ASSET,
      IPCChannel.SOURCES_RECONCILE,
      IPCChannel.SOURCES_SELECT_AND_STAGE,
      IPCChannel.SOURCES_PDF_EXTRACT,
      IPCChannel.SOURCES_PDF_CANCEL,
      IPCChannel.SOURCES_PDF_VIEWER_GRANT,
      IPCChannel.SOURCES_PDF_VIEWER_REVOKE,
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

  it('accepts only narrow managed-asset deletion identities', async () => {
    const handler = mocks.handlers.get(IPCChannel.SOURCES_DELETE_MANAGED_ASSET)!;
    const event = {
      sender: {
        id: 7,
        isDestroyed: () => false,
      },
    };
    const invalid = {
      relativePath: 'C:\\private.txt',
      expectedContentHash: 'a'.repeat(64),
      expectedMimeType: 'text/plain',
      expectedExtension: 'txt',
      expectedByteSize: 4,
    };
    await expect(handler(event, invalid)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(mocks.service.deleteManagedAsset).not.toHaveBeenCalled();

    const request = {
      ...invalid,
      relativePath: `assets/aa/${'a'.repeat(64)}.txt`,
    };
    mocks.service.deleteManagedAsset.mockResolvedValue({
      deleted: true,
      alreadyMissing: false,
    });
    await expect(handler(event, request)).resolves.toEqual({
      ok: true,
      value: { deleted: true, alreadyMissing: false },
    });
    expect(mocks.service.deleteManagedAsset).toHaveBeenCalledWith(request);
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
    expect(mocks.service.selectAndStage).toHaveBeenCalledWith(window, request);

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

  it('validates the PDF sender, request, progress, and cancellation boundary', async () => {
    const hash = 'a'.repeat(64);
    const request = {
      jobId: 'job-1',
      sourceVersionId: 'version-1',
      assetRelativePath: `assets/aa/${hash}.pdf`,
      contentHash: hash,
      byteSize: 1_000,
      options: {
        maxPages: 1_000,
        maxCharacters: 5_000_000,
        maxBoundingBoxes: 100_000,
        maxOutputBytes: 16 * 1024 * 1024,
        includeCoordinates: true,
      },
      cancellationToken: 'cancel-1',
    };
    const sender = {
      id: 7,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const event = { sender };
    mocks.parser.extract.mockImplementation(async (_request, progress) => {
      progress({
        jobId: 'job-1',
        stage: 'parsing',
        pagesProcessed: 1,
        totalPages: 1,
        percent: 95,
      });
      return {
        jobId: 'job-1',
        status: 'completed',
        pageCount: 0,
        pages: [],
        scannedPageCount: 0,
        truncated: false,
        errorCode: null,
        errorMessage: null,
      };
    });
    const extract = mocks.handlers.get(IPCChannel.SOURCES_PDF_EXTRACT)!;
    await expect(extract(event, request)).resolves.toMatchObject({
      ok: true,
      value: { status: 'completed' },
    });
    expect(sender.send).toHaveBeenCalledWith(
      IPCChannel.SOURCES_PDF_PROGRESS,
      expect.objectContaining({ jobId: 'job-1' }),
    );

    await expect(extract({
      sender: { ...sender, id: 99 },
    }, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PDF_OUTPUT_INVALID' },
    });
    mocks.parser.cancel.mockReturnValue(true);
    const cancelPdf = mocks.handlers.get(IPCChannel.SOURCES_PDF_CANCEL)!;
    await expect(cancelPdf(event, {
      jobId: request.jobId,
      cancellationToken: request.cancellationToken,
    })).resolves.toEqual({ cancelled: true });
  });
});
