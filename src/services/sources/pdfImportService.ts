import { db, type AetherDatabase } from '../../db/database';
import type {
  AssetFinalisationReceipt,
  SourceStagingReceipt,
} from '../../../electron/types/source-storage';
import {
  createDefaultPdfExtractionRequest,
  type PdfExtractionJobResult,
  type PdfJobProgress,
} from '../../../electron/types/pdf';
import { desktopBridge } from '../../desktop/desktopBridge';
import {
  checkpointPdfFinalisation,
  completePdfImport,
  createPendingPdfImport,
  createPdfRetryJob,
  failPdfImport,
  parsePersistedPdfImportPayload,
  updatePdfJobProgress,
  type PendingPdfImport,
  type PdfPersistenceOptions,
  type PersistedPdfImportPayload,
} from './pdfImportPersistence';
import { validateSourceImportContext } from './sourceImportContext';
import {
  SourceImportError,
  toSourceImportError,
  type SourceImportContext,
  type SourceImportProgress,
  type SourceImportResult,
} from './sourceImportTypes';

export interface PdfImportRuntime {
  selectAndStageSources: typeof desktopBridge.selectAndStageSources;
  finaliseSourceAsset: typeof desktopBridge.finaliseSourceAsset;
  cancelSourceStaging: typeof desktopBridge.cancelSourceStaging;
  extractPdf: typeof desktopBridge.extractPdf;
  cancelPdfExtraction: typeof desktopBridge.cancelPdfExtraction;
}

export interface PdfImportServiceOptions extends PdfPersistenceOptions {
  database?: AetherDatabase;
  runtime?: PdfImportRuntime;
  signal?: AbortSignal;
  onProgress?: (progress: SourceImportProgress) => void;
}

const defaultRuntime: PdfImportRuntime = {
  selectAndStageSources: desktopBridge.selectAndStageSources,
  finaliseSourceAsset: desktopBridge.finaliseSourceAsset,
  cancelSourceStaging: desktopBridge.cancelSourceStaging,
  extractPdf: desktopBridge.extractPdf,
  cancelPdfExtraction: desktopBridge.cancelPdfExtraction,
};

function createDefaultId(): string {
  return globalThis.crypto.randomUUID();
}

function notify(
  callback: PdfImportServiceOptions['onProgress'],
  progress: SourceImportProgress,
): void {
  try {
    callback?.(progress);
  } catch {
    // UI progress observers are never authoritative.
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SourceImportError('PDF_EXTRACTION_CANCELLED');
}

function finalisationFromStaging(receipt: SourceStagingReceipt): AssetFinalisationReceipt {
  return {
    stagingToken: receipt.stagingToken,
    contentHash: receipt.contentHash,
    mimeType: receipt.mimeType,
    extension: receipt.extension,
    byteSize: receipt.byteSize,
    relativePath: receipt.proposedRelativePath,
    finalisedAt: Date.now(),
    reusedExistingAssetFile: true,
  };
}

async function runExtraction(
  database: AetherDatabase,
  runtime: PdfImportRuntime,
  pending: PendingPdfImport,
  assetReceipt: AssetFinalisationReceipt,
  cancellationToken: string,
  options: PdfImportServiceOptions,
): Promise<PdfExtractionJobResult> {
  throwIfAborted(options.signal);
  let cancelSent = false;
  const cancel = () => {
    if (cancelSent) return;
    cancelSent = true;
    void runtime.cancelPdfExtraction({
      jobId: pending.jobId,
      cancellationToken,
    });
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const operation = await runtime.extractPdf(
      createDefaultPdfExtractionRequest({
        jobId: pending.jobId,
        sourceVersionId: pending.versionId,
        assetRelativePath: assetReceipt.relativePath,
        contentHash: assetReceipt.contentHash,
        byteSize: assetReceipt.byteSize,
        cancellationToken,
      }),
      (progress: PdfJobProgress) => {
        void updatePdfJobProgress(database, pending.jobId, progress.percent).catch(() => {});
        notify(options.onProgress, {
          stage: 'extracting',
          message: progress.totalPages
            ? `Extracting page ${progress.pagesProcessed.toLocaleString()} of ${progress.totalPages.toLocaleString()}…`
            : 'Loading the PDF in the isolated parser…',
          sourceType: 'pdf',
          byteSize: assetReceipt.byteSize,
        });
      },
    );
    if (!operation.ok) throw new SourceImportError(operation.error.code);
    return operation.value;
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }
}

async function persistExtractionOutcome(
  database: AetherDatabase,
  pending: PendingPdfImport,
  context: SourceImportContext,
  assetReceipt: AssetFinalisationReceipt,
  result: PdfExtractionJobResult,
  options: PdfImportServiceOptions,
): Promise<SourceImportResult> {
  if (result.status === 'completed' || result.status === 'partially_completed') {
    notify(options.onProgress, {
      stage: 'saving',
      message: 'Saving page segments and deterministic local-search chunks atomically…',
      sourceType: 'pdf',
      byteSize: assetReceipt.byteSize,
    });
    return completePdfImport(
      database,
      pending,
      context,
      assetReceipt,
      result,
      options,
    );
  }
  const code = result.errorCode ?? 'PDF_OUTPUT_INVALID';
  const error = new SourceImportError(code);
  await failPdfImport(
    database,
    pending,
    code,
    error.message,
    result.status === 'cancelled',
    options.now?.() ?? Date.now(),
  );
  throw error;
}

export async function importPdfFile(
  context: SourceImportContext,
  options: PdfImportServiceOptions = {},
): Promise<SourceImportResult> {
  const database = options.database ?? db;
  const runtime = options.runtime ?? defaultRuntime;
  const createId = options.createId ?? createDefaultId;
  const cancellationToken = createId();
  let stagingReceipt: SourceStagingReceipt | null = null;
  let pending: PendingPdfImport | null = null;
  try {
    await validateSourceImportContext(database, context);
    throwIfAborted(options.signal);
    notify(options.onProgress, {
      stage: 'selecting',
      message: 'Choose a PDF file.',
      sourceType: 'pdf',
    });
    const staged = await runtime.selectAndStageSources({
      selectionMode: 'single',
      allowedKinds: ['pdf'],
      maximumFileCount: 1,
    });
    if (!staged.ok) throw new SourceImportError(staged.error.code);
    if (staged.value.cancelled || staged.value.receipts.length === 0) {
      throw new SourceImportError('IMPORT_CANCELLED');
    }
    if (staged.value.receipts.length !== 1) throw new SourceImportError('INVALID_REQUEST');
    stagingReceipt = staged.value.receipts[0];
    if (
      stagingReceipt.extension !== 'pdf'
      || stagingReceipt.mimeType !== 'application/pdf'
    ) throw new SourceImportError('UNSUPPORTED_TEXT_SOURCE');
    throwIfAborted(options.signal);

    pending = await createPendingPdfImport(
      database,
      context,
      stagingReceipt,
      cancellationToken,
      { ...options, createId },
    );
    notify(options.onProgress, {
      stage: 'finalising',
      message: 'Finalising the managed PDF asset…',
      filename: stagingReceipt.originalFilename,
      sourceType: 'pdf',
      byteSize: stagingReceipt.byteSize,
    });
    const finalised = await runtime.finaliseSourceAsset({
      stagingToken: stagingReceipt.stagingToken,
    });
    if (!finalised.ok) throw new SourceImportError(finalised.error.code, true);
    await checkpointPdfFinalisation(
      database,
      pending,
      context,
      finalised.value,
      cancellationToken,
      { ...options, createId },
    );
    const extraction = await runExtraction(
      database,
      runtime,
      pending,
      finalised.value,
      cancellationToken,
      options,
    );
    const result = await persistExtractionOutcome(
      database,
      pending,
      context,
      finalised.value,
      extraction,
      options,
    );
    notify(options.onProgress, {
      stage: 'completed',
      message: result.partiallyReady
        ? 'The PDF is partially ready. Extracted pages remain available.'
        : 'The PDF is ready.',
      filename: stagingReceipt.originalFilename,
      sourceType: 'pdf',
      byteSize: stagingReceipt.byteSize,
    });
    return result;
  } catch (error) {
    const safeError = toSourceImportError(error);
    if (stagingReceipt && !pending) {
      await runtime.cancelSourceStaging(stagingReceipt.stagingToken).catch(() => {});
    } else if (pending) {
      await failPdfImport(
        database,
        pending,
        safeError.code,
        safeError.message,
        safeError.code === 'IMPORT_CANCELLED'
          || safeError.code === 'PDF_EXTRACTION_CANCELLED',
        options.now?.() ?? Date.now(),
      ).catch(() => {});
    }
    notify(options.onProgress, {
      stage: safeError.code === 'IMPORT_CANCELLED'
        || safeError.code === 'PDF_EXTRACTION_CANCELLED'
        ? 'cancelled'
        : 'failed',
      message: safeError.message,
      filename: stagingReceipt?.originalFilename,
      sourceType: 'pdf',
      byteSize: stagingReceipt?.byteSize,
    });
    throw safeError;
  }
}

async function recoverPdfJob(
  database: AetherDatabase,
  runtime: PdfImportRuntime,
  pending: PendingPdfImport,
  payload: PersistedPdfImportPayload,
  options: PdfImportServiceOptions,
): Promise<SourceImportResult> {
  const cancellationToken = (options.createId ?? createDefaultId)();
  let assetReceipt = payload.assetReceipt;
  if (!assetReceipt && payload.stagingReceipt) {
    const finalised = await runtime.finaliseSourceAsset({
      stagingToken: payload.stagingReceipt.stagingToken,
    });
    assetReceipt = finalised.ok
      ? finalised.value
      : finalisationFromStaging(payload.stagingReceipt);
  }
  if (!assetReceipt) throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
  await checkpointPdfFinalisation(
    database,
    pending,
    payload.context,
    assetReceipt,
    cancellationToken,
    options,
  );
  const extraction = await runExtraction(
    database,
    runtime,
    pending,
    assetReceipt,
    cancellationToken,
    options,
  );
  return persistExtractionOutcome(
    database,
    pending,
    payload.context,
    assetReceipt,
    extraction,
    options,
  );
}

export async function recoverInterruptedPdfImports(
  userId: string,
  options: PdfImportServiceOptions = {},
): Promise<Array<{ sourceId: string; recovered: boolean; message: string }>> {
  const database = options.database ?? db;
  const runtime = options.runtime ?? defaultRuntime;
  const jobs = (await database.source_jobs.where('userId').equals(userId).toArray())
    .filter((job) =>
      job.jobType === 'extract-text'
      && (job.status === 'pending' || job.status === 'running')
      && parsePersistedPdfImportPayload(job.payload));
  const outcomes: Array<{ sourceId: string; recovered: boolean; message: string }> = [];
  for (const job of jobs) {
    if (!job.sourceId || !job.versionId) continue;
    const [source, version] = await Promise.all([
      database.study_sources.get(job.sourceId),
      database.source_versions.get(job.versionId),
    ]);
    const payload = parsePersistedPdfImportPayload(job.payload);
    if (!source || !version || !payload || source.sourceType !== 'pdf') continue;
    const pending = {
      sourceId: source.id,
      versionId: version.id,
      jobId: job.id,
      displayTitle: source.displayName,
    };
    try {
      await recoverPdfJob(database, runtime, pending, payload, options);
      outcomes.push({ sourceId: source.id, recovered: true, message: 'PDF import recovered.' });
    } catch (error) {
      const safeError = toSourceImportError(error);
      await failPdfImport(
        database,
        pending,
        safeError.code,
        safeError.message,
        safeError.code === 'PDF_EXTRACTION_CANCELLED',
        options.now?.() ?? Date.now(),
      );
      outcomes.push({ sourceId: source.id, recovered: false, message: safeError.message });
    }
  }
  return outcomes;
}

export async function retryPdfImport(
  sourceId: string,
  userId: string,
  options: PdfImportServiceOptions = {},
): Promise<SourceImportResult> {
  const database = options.database ?? db;
  const runtime = options.runtime ?? defaultRuntime;
  const cancellationToken = (options.createId ?? createDefaultId)();
  const { pending, payload } = await createPdfRetryJob(
    database,
    sourceId,
    userId,
    cancellationToken,
    options,
  );
  try {
    return await recoverPdfJob(database, runtime, pending, payload, options);
  } catch (error) {
    const safeError = toSourceImportError(error);
    await failPdfImport(
      database,
      pending,
      safeError.code,
      safeError.message,
      safeError.code === 'PDF_EXTRACTION_CANCELLED',
      options.now?.() ?? Date.now(),
    );
    throw safeError;
  }
}
