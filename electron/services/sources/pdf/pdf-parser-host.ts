import { app, utilityProcess, type UtilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import {
  PDF_EXTRACTION_LIMITS,
  type PdfCancellationRequest,
  type PdfErrorCode,
  type PdfExtractionJobRequest,
  type PdfExtractionJobResult,
  type PdfJobProgress,
  type PdfUtilityMessage,
} from '../../../types/pdf.js';
import { getSourceStorageService } from '../source-storage-provider.js';
import { SourceStorageError } from '../source-storage-errors.js';
import { pdfFailureResult } from './pdf-errors.js';
import { validatePdfUtilityResult } from './pdf-validator.js';

interface ActivePdfJob {
  request: PdfExtractionJobRequest;
  child: UtilityProcess;
  cancelKillTimer: ReturnType<typeof setTimeout> | null;
}

export interface PdfParserHostOptions {
  timeoutMs?: number;
  workingSetLimitBytes?: number;
  progressIntervalMs?: number;
  workerPath?: string;
  fork?: typeof utilityProcess.fork;
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { LANG: 'en_US.UTF-8' };
  for (const key of ['SYSTEMROOT', 'TEMP', 'TMP'] as const) {
    if (process.env[key]) result[key] = process.env[key];
  }
  return result;
}

function validateProgress(
  value: PdfJobProgress,
  request: PdfExtractionJobRequest,
): value is PdfJobProgress {
  return value?.jobId === request.jobId
    && ['loading', 'parsing', 'finalizing'].includes(value.stage)
    && Number.isSafeInteger(value.pagesProcessed)
    && value.pagesProcessed >= 0
    && value.pagesProcessed <= request.options.maxPages
    && (
      value.totalPages === null
      || (
        Number.isSafeInteger(value.totalPages)
        && value.totalPages >= 0
        && value.totalPages <= request.options.maxPages
      )
    )
    && Number.isSafeInteger(value.percent)
    && value.percent >= 0
    && value.percent <= 100;
}

function mapStorageFailure(error: unknown): PdfErrorCode {
  if (error instanceof SourceStorageError) {
    if (error.code === 'FILE_TOO_LARGE') return 'PDF_TOO_LARGE';
    if (error.code === 'MANAGED_ASSET_NOT_FOUND') return 'PDF_ASSET_MISSING';
    if (error.code === 'MANAGED_ASSET_IDENTITY_MISMATCH') return 'PDF_HASH_MISMATCH';
  }
  return 'PDF_OUTPUT_INVALID';
}

export class PdfParserHost {
  private active: ActivePdfJob | null = null;
  private readonly timeoutMs: number;
  private readonly workingSetLimitBytes: number;
  private readonly progressIntervalMs: number;
  private readonly workerPath: string;
  private readonly fork: typeof utilityProcess.fork;

  constructor(options: PdfParserHostOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? PDF_EXTRACTION_LIMITS.timeoutMs;
    this.workingSetLimitBytes = options.workingSetLimitBytes
      ?? PDF_EXTRACTION_LIMITS.maximumWorkingSetBytes;
    this.progressIntervalMs = options.progressIntervalMs
      ?? PDF_EXTRACTION_LIMITS.progressIntervalMs;
    this.workerPath = options.workerPath
      ?? fileURLToPath(new URL('./pdf-parser-utility.js', import.meta.url));
    this.fork = options.fork ?? utilityProcess.fork;
  }

  public async extract(
    request: PdfExtractionJobRequest,
    onProgress: (progress: PdfJobProgress) => void,
  ): Promise<PdfExtractionJobResult> {
    if (this.active) return pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID');
    let absolutePath: string;
    try {
      absolutePath = (await getSourceStorageService().resolveVerifiedPdfAsset(
        request.assetRelativePath,
        request.contentHash,
        request.byteSize,
        PDF_EXTRACTION_LIMITS.maximumBytes,
      )).absolutePath;
    } catch (error) {
      return pdfFailureResult(request.jobId, mapStorageFailure(error));
    }

    const child = this.fork(this.workerPath, [], {
      env: minimalEnvironment(),
      execArgv: ['--max-old-space-size=384'],
      serviceName: 'Aether PDF Parser',
      stdio: 'ignore',
    });
    this.active = { request, child, cancelKillTimer: null };

    return new Promise<PdfExtractionJobResult>((resolve) => {
      let settled = false;
      let ready = false;
      let lastProgressAt = 0;
      const finish = (result: PdfExtractionJobResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(memoryWatchdog);
        if (this.active?.cancelKillTimer) clearTimeout(this.active.cancelKillTimer);
        child.kill();
        if (this.active?.request.jobId === request.jobId) this.active = null;
        resolve(result);
      };
      child.on('message', (message: PdfUtilityMessage) => {
        if (!message || typeof message !== 'object') {
          finish(pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID'));
          return;
        }
        if (message.type === 'ready') {
          if (ready) {
            finish(pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID'));
            return;
          }
          ready = true;
          child.postMessage({
            type: 'extract',
            request,
            absolutePath,
          });
          return;
        }
        if (!ready) {
          finish(pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID'));
          return;
        }
        if (message.type === 'progress') {
          if (!validateProgress(message.progress, request)) {
            finish(pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID'));
            return;
          }
          const now = Date.now();
          if (
            message.progress.percent === 0
            || message.progress.percent === 100
            || now - lastProgressAt >= this.progressIntervalMs
          ) {
            lastProgressAt = now;
            try {
              onProgress(message.progress);
            } catch {
              // Progress is non-authoritative and must not change extraction.
            }
          }
          return;
        }
        if (message.type === 'result') {
          try {
            finish(validatePdfUtilityResult(message.result, request));
          } catch {
            finish(pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID'));
          }
          return;
        }
        finish(pdfFailureResult(request.jobId, 'PDF_OUTPUT_INVALID'));
      });
      child.once('exit', () => {
        if (!settled) {
          const cancelled = this.active?.request.jobId === request.jobId
            && this.active.cancelKillTimer !== null;
          finish(pdfFailureResult(
            request.jobId,
            cancelled ? 'PDF_EXTRACTION_CANCELLED' : 'PDF_PARSER_CRASHED',
          ));
        }
      });
      const timeout = setTimeout(() => {
        finish(pdfFailureResult(request.jobId, 'PDF_EXTRACTION_TIMEOUT'));
      }, this.timeoutMs);
      const memoryWatchdog = setInterval(() => {
        if (!child.pid) return;
        const metric = app.getAppMetrics().find((entry) => entry.pid === child.pid);
        if (
          metric
          && metric.memory.workingSetSize * 1024 > this.workingSetLimitBytes
        ) {
          finish(pdfFailureResult(request.jobId, 'PDF_PARSER_CRASHED'));
        }
      }, 250);
    });
  }

  public cancel(request: PdfCancellationRequest): boolean {
    const active = this.active;
    if (
      !active
      || active.request.jobId !== request.jobId
      || active.request.cancellationToken !== request.cancellationToken
    ) return false;
    active.child.postMessage({ type: 'cancel', ...request });
    if (!active.cancelKillTimer) {
      active.cancelKillTimer = setTimeout(() => {
        active.child.kill();
      }, PDF_EXTRACTION_LIMITS.cancellationGraceMs);
    }
    return true;
  }

  public shutdown(): void {
    if (!this.active) return;
    this.active.child.kill();
    if (this.active.cancelKillTimer) clearTimeout(this.active.cancelKillTimer);
    this.active = null;
  }
}

let parserHost: PdfParserHost | null = null;

export function getPdfParserHost(): PdfParserHost {
  parserHost ??= new PdfParserHost();
  return parserHost;
}

export function shutdownPdfParserHost(): void {
  parserHost?.shutdown();
  parserHost = null;
}
