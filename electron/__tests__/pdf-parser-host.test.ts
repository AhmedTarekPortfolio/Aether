import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultPdfExtractionRequest,
  type PdfExtractionJobRequest,
  type PdfExtractionJobResult,
} from '../types/pdf';

const mocked = vi.hoisted(() => ({
  resolveVerifiedPdfAsset: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getAppMetrics: vi.fn(() => []) },
  utilityProcess: { fork: vi.fn() },
}));

vi.mock('../services/sources/source-storage-provider', () => ({
  getSourceStorageService: () => ({
    resolveVerifiedPdfAsset: mocked.resolveVerifiedPdfAsset,
  }),
}));

import { PdfParserHost } from '../services/sources/pdf/pdf-parser-host';

const hash = 'a'.repeat(64);
const request = createDefaultPdfExtractionRequest({
  jobId: 'host-job',
  sourceVersionId: 'version-1',
  assetRelativePath: `assets/aa/${hash}.pdf`,
  contentHash: hash,
  byteSize: 10,
  cancellationToken: 'cancel-host-job',
});

function resultFor(
  input: PdfExtractionJobRequest,
  overrides: Partial<PdfExtractionJobResult> = {},
): PdfExtractionJobResult {
  const text = 'Page text';
  return {
    jobId: input.jobId,
    status: 'completed',
    pageCount: 1,
    pages: [{
      ordinal: 1,
      physicalPage: 1,
      printedPageLabel: null,
      text,
      textHash: crypto.createHash('sha256').update(text).digest('hex'),
      boundingBoxes: [],
      rasterImageCount: 0,
      likelyScanned: false,
    }],
    scannedPageCount: 0,
    truncated: false,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

class FakeUtility extends EventEmitter {
  public pid = 12345;
  public killed = false;
  public posted: unknown[] = [];

  constructor(
    private readonly behavior: 'success' | 'crash' | 'invalid' | 'hang' | 'cancel',
  ) {
    super();
    queueMicrotask(() => this.emit('message', { type: 'ready' }));
  }

  postMessage(message: unknown) {
    this.posted.push(message);
    const typed = message as { type?: string; request?: PdfExtractionJobRequest };
    if (typed.type === 'cancel' && this.behavior === 'cancel') {
      queueMicrotask(() => this.emit('exit', 0));
    }
    if (typed.type !== 'extract' || !typed.request) return;
    if (this.behavior === 'success') {
      queueMicrotask(() => {
        this.emit('message', {
          type: 'progress',
          progress: {
            jobId: typed.request!.jobId,
            stage: 'parsing',
            pagesProcessed: 1,
            totalPages: 1,
            percent: 95,
          },
        });
        this.emit('message', { type: 'result', result: resultFor(typed.request!) });
      });
    } else if (this.behavior === 'invalid') {
      queueMicrotask(() => this.emit('message', {
        type: 'result',
        result: resultFor(typed.request!, { jobId: 'wrong-job' }),
      }));
    } else if (this.behavior === 'crash') {
      queueMicrotask(() => this.emit('exit', 86));
    }
  }

  kill() {
    this.killed = true;
    return true;
  }
}

function hostWith(
  behavior: ConstructorParameters<typeof FakeUtility>[0],
  timeoutMs = 1_000,
): { host: PdfParserHost; state: { child: FakeUtility | null } } {
  const state: { child: FakeUtility | null } = { child: null };
  return {
    state,
    host: new PdfParserHost({
      timeoutMs,
      workerPath: 'D:\\internal\\pdf-parser-utility.js',
      fork: vi.fn(() => {
        state.child = new FakeUtility(behavior);
        return state.child;
      }) as never,
    }),
  };
}

beforeEach(() => {
  mocked.resolveVerifiedPdfAsset.mockReset();
  mocked.resolveVerifiedPdfAsset.mockResolvedValue({
    absolutePath: 'D:\\internal\\managed.pdf',
    byteSize: 10,
    contentHash: hash,
  });
});

describe('Main-owned PDF utility-process supervision', () => {
  it('forks a utility, validates its result, and forwards bounded progress', async () => {
    const { host, state } = hostWith('success');
    const progress = vi.fn();
    await expect(host.extract(request, progress)).resolves.toMatchObject({
      status: 'completed',
      pageCount: 1,
    });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ jobId: request.jobId }));
    expect(state.child?.killed).toBe(true);
    expect(JSON.stringify(state.child?.posted)).not.toContain('sourceVersionId":"C:');
  });

  it('contains parser crashes and rejects invalid output', async () => {
    const crashed = hostWith('crash');
    await expect(crashed.host.extract(request, vi.fn())).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'PDF_PARSER_CRASHED',
    });
    const invalid = hostWith('invalid');
    await expect(invalid.host.extract(request, vi.fn())).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'PDF_OUTPUT_INVALID',
    });
  });

  it('times out and terminates a stuck utility', async () => {
    const { host, state } = hostWith('hang', 10);
    await expect(host.extract(request, vi.fn())).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'PDF_EXTRACTION_TIMEOUT',
    });
    expect(state.child?.killed).toBe(true);
  });

  it('accepts cancellation only for the exact active job and token', async () => {
    const { host } = hostWith('cancel');
    const extraction = host.extract(request, vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.cancel({ jobId: 'other', cancellationToken: request.cancellationToken }))
      .toBe(false);
    expect(host.cancel({
      jobId: request.jobId,
      cancellationToken: request.cancellationToken,
    })).toBe(true);
    await expect(extraction).resolves.toMatchObject({
      status: 'cancelled',
      errorCode: 'PDF_EXTRACTION_CANCELLED',
    });
  });
});
