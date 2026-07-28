import { db, type AetherDatabase } from '../../db/database';
import type {
  AssetFinalisationReceipt,
  SourceStagingReceipt,
} from '../../../electron/types/source-storage';
import { desktopBridge } from '../../desktop/desktopBridge';
import { deriveTextChunks } from './sourceChunking';
import {
  completeTextImport,
  createPendingFileImport,
  discardIncompleteSource as discardIncompleteSourceRecords,
  markSourceImportCancelled,
  markSourceImportFailed,
  parsePersistedImportPayload,
  persistFinalisationCheckpoint,
  type PendingSourceImport,
  type SourceImportPersistenceOptions,
} from './sourceImportPersistence';
import { createPastedTextImport } from './pastedTextPersistence';
import { validateSourceImportContext } from './sourceImportContext';
import {
  SourceImportError,
  toSourceImportError,
  type SourceImportContext,
  type SourceImportProgress,
  type SourceImportResult,
} from './sourceImportTypes';
import { normalizeImportedText, sha256Text } from './textNormalisation';

export interface SourceImportRuntime {
  selectAndStageSources: typeof desktopBridge.selectAndStageSources;
  finaliseSourceAsset: typeof desktopBridge.finaliseSourceAsset;
  readManagedTextAsset: typeof desktopBridge.readManagedTextAsset;
  cancelSourceStaging: typeof desktopBridge.cancelSourceStaging;
}

export interface SourceImportServiceOptions extends SourceImportPersistenceOptions {
  database?: AetherDatabase;
  runtime?: SourceImportRuntime;
}

export interface ImportTextFileOptions extends SourceImportServiceOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SourceImportProgress) => void;
}

const defaultRuntime: SourceImportRuntime = {
  selectAndStageSources: desktopBridge.selectAndStageSources,
  finaliseSourceAsset: desktopBridge.finaliseSourceAsset,
  readManagedTextAsset: desktopBridge.readManagedTextAsset,
  cancelSourceStaging: desktopBridge.cancelSourceStaging,
};

function progress(
  callback: ImportTextFileOptions['onProgress'],
  value: SourceImportProgress,
): void {
  callback?.(value);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SourceImportError('IMPORT_CANCELLED');
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

async function readAndProcessAsset(
  runtime: SourceImportRuntime,
  asset: AssetFinalisationReceipt,
): Promise<{
  normalizedText: string;
  textHash: string;
  chunks: ReturnType<typeof deriveTextChunks>;
}> {
  const readResult = await runtime.readManagedTextAsset({
    relativePath: asset.relativePath,
    expectedContentHash: asset.contentHash,
  });
  if (!readResult.ok) {
    throw new SourceImportError(readResult.error.code, false);
  }
  if (
    readResult.value.contentHash !== asset.contentHash
    || readResult.value.byteSize !== asset.byteSize
    || readResult.value.extension !== asset.extension
    || readResult.value.mimeType !== asset.mimeType
  ) {
    throw new SourceImportError('MANAGED_ASSET_IDENTITY_MISMATCH');
  }
  const normalizedText = normalizeImportedText(readResult.value.text);
  const [textHash, chunks] = await Promise.all([
    sha256Text(normalizedText),
    Promise.resolve(deriveTextChunks(normalizedText)),
  ]);
  return { normalizedText, textHash, chunks };
}

export async function importTextFile(
  context: SourceImportContext,
  options: ImportTextFileOptions = {},
): Promise<SourceImportResult> {
  const database = options.database ?? db;
  const runtime = options.runtime ?? defaultRuntime;
  let stagingReceipt: SourceStagingReceipt | null = null;
  let pending: PendingSourceImport | null = null;

  try {
    await validateSourceImportContext(database, context);
    throwIfAborted(options.signal);
    progress(options.onProgress, {
      stage: 'selecting',
      message: 'Choose a TXT or Markdown file.',
    });
    progress(options.onProgress, {
      stage: 'staging',
      message: 'Validating and staging the selected file…',
    });
    const stageResult = await runtime.selectAndStageSources({
      selectionMode: 'single',
      allowedKinds: ['text', 'markdown'],
      maximumFileCount: 1,
    });
    if (!stageResult.ok) throw new SourceImportError(stageResult.error.code);
    if (stageResult.value.cancelled || stageResult.value.receipts.length === 0) {
      throw new SourceImportError('IMPORT_CANCELLED');
    }
    if (stageResult.value.receipts.length !== 1) {
      throw new SourceImportError('INVALID_REQUEST');
    }
    stagingReceipt = stageResult.value.receipts[0];
    throwIfAborted(options.signal);

    pending = await createPendingFileImport(database, context, stagingReceipt, options);
    progress(options.onProgress, {
      stage: 'finalising',
      message: 'Moving the file into managed local storage…',
      filename: stagingReceipt.originalFilename,
      sourceType: pending.sourceType,
      byteSize: stagingReceipt.byteSize,
    });
    throwIfAborted(options.signal);
    const finaliseResult = await runtime.finaliseSourceAsset({
      stagingToken: stagingReceipt.stagingToken,
    });
    if (!finaliseResult.ok) throw new SourceImportError(finaliseResult.error.code, true);
    await persistFinalisationCheckpoint(database, pending);

    progress(options.onProgress, {
      stage: 'reading',
      message: 'Reading validated UTF-8 text…',
      filename: stagingReceipt.originalFilename,
      sourceType: pending.sourceType,
      byteSize: stagingReceipt.byteSize,
    });
    throwIfAborted(options.signal);
    const processed = await readAndProcessAsset(runtime, finaliseResult.value);
    progress(options.onProgress, {
      stage: 'processing',
      message: 'Creating the durable text segment and local-search chunks…',
      filename: stagingReceipt.originalFilename,
      sourceType: pending.sourceType,
      byteSize: stagingReceipt.byteSize,
    });
    throwIfAborted(options.signal);
    progress(options.onProgress, {
      stage: 'saving',
      message: 'Saving the source atomically…',
      filename: stagingReceipt.originalFilename,
      sourceType: pending.sourceType,
      byteSize: stagingReceipt.byteSize,
    });
    const result = await completeTextImport(
      database,
      pending,
      context,
      finaliseResult.value,
      processed.normalizedText,
      processed.textHash,
      processed.chunks,
      options,
    );
    progress(options.onProgress, {
      stage: 'completed',
      message: 'Source import completed.',
      filename: stagingReceipt.originalFilename,
      sourceType: pending.sourceType,
      byteSize: stagingReceipt.byteSize,
    });
    return result;
  } catch (error) {
    const safeError = toSourceImportError(error);
    if (stagingReceipt && !pending) {
      await runtime.cancelSourceStaging(stagingReceipt.stagingToken).catch(() => {});
    } else if (stagingReceipt && pending && safeError.code === 'IMPORT_CANCELLED') {
      await runtime.cancelSourceStaging(stagingReceipt.stagingToken).catch(() => {});
      await markSourceImportCancelled(database, pending).catch(() => {});
    } else if (pending) {
      await markSourceImportFailed(
        database,
        pending,
        safeError.code,
        safeError.message,
        options.now?.() ?? Date.now(),
      ).catch(() => {});
    }
    progress(options.onProgress, {
      stage: safeError.code === 'IMPORT_CANCELLED' ? 'cancelled' : 'failed',
      message: safeError.message,
      filename: stagingReceipt?.originalFilename,
      sourceType: pending?.sourceType,
      byteSize: stagingReceipt?.byteSize,
    });
    throw safeError;
  }
}

export async function importPastedText(
  context: SourceImportContext,
  text: string,
  options: SourceImportServiceOptions & {
    onProgress?: (progress: SourceImportProgress) => void;
  } = {},
): Promise<SourceImportResult> {
  const database = options.database ?? db;
  progress(options.onProgress, { stage: 'processing', message: 'Normalising pasted text…' });
  try {
    const normalizedText = normalizeImportedText(text, { pasted: true });
    const [textHash, chunks] = await Promise.all([
      sha256Text(normalizedText),
      Promise.resolve(deriveTextChunks(normalizedText)),
    ]);
    progress(options.onProgress, {
      stage: 'saving',
      message: 'Saving the pasted source atomically…',
      sourceType: 'pasted-text',
    });
    const result = await createPastedTextImport(
      database,
      context,
      normalizedText,
      textHash,
      chunks,
      options,
    );
    progress(options.onProgress, {
      stage: 'completed',
      message: 'Pasted text was imported.',
      sourceType: 'pasted-text',
    });
    return result;
  } catch (error) {
    const safeError = toSourceImportError(error);
    progress(options.onProgress, { stage: 'failed', message: safeError.message });
    throw safeError;
  }
}

async function resumePendingImport(
  database: AetherDatabase,
  runtime: SourceImportRuntime,
  pending: PendingSourceImport,
  options: SourceImportServiceOptions,
): Promise<SourceImportResult> {
  const job = await database.source_jobs.get(pending.jobId);
  const version = await database.source_versions.get(pending.versionId);
  if (!job || !version) throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
  const payload = parsePersistedImportPayload(job.payload);
  if (!payload) throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');

  const existingSegment = await database.source_segments
    .where('sourceVersionId')
    .equals(version.id)
    .first();
  const existingAsset = version.assetId
    ? await database.source_assets.get(version.assetId)
    : payload.stagingReceipt
      ? await database.source_assets
          .where('[userId+contentHash]')
          .equals([version.userId, payload.stagingReceipt.contentHash])
          .first()
      : undefined;

  let assetReceipt: AssetFinalisationReceipt;
  if (existingAsset) {
    assetReceipt = {
      stagingToken: payload.stagingReceipt?.stagingToken ?? '0'.repeat(64),
      contentHash: existingAsset.contentHash,
      mimeType: existingAsset.mimeType,
      extension: existingAsset.extension,
      byteSize: existingAsset.byteSize,
      relativePath: existingAsset.relativePath,
      finalisedAt: Date.now(),
      reusedExistingAssetFile: true,
    };
  } else if (payload.stagingReceipt) {
    const finalise = await runtime.finaliseSourceAsset({
      stagingToken: payload.stagingReceipt.stagingToken,
    });
    if (finalise.ok) {
      assetReceipt = finalise.value;
    } else {
      const probe = await runtime.readManagedTextAsset({
        relativePath: payload.stagingReceipt.proposedRelativePath,
        expectedContentHash: payload.stagingReceipt.contentHash,
      });
      if (!probe.ok) throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
      assetReceipt = finalisationFromStaging(payload.stagingReceipt);
    }
    await persistFinalisationCheckpoint(database, pending);
  } else {
    throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
  }

  const processed = existingSegment
    ? {
        normalizedText: normalizeImportedText(existingSegment.text),
        textHash: await sha256Text(normalizeImportedText(existingSegment.text)),
        chunks: deriveTextChunks(normalizeImportedText(existingSegment.text)),
      }
    : await readAndProcessAsset(runtime, assetReceipt);
  return completeTextImport(
    database,
    pending,
    payload.context,
    assetReceipt,
    processed.normalizedText,
    processed.textHash,
    processed.chunks,
    options,
  );
}

function pendingFromRows(
  source: { id: string; displayName: string; sourceType: string },
  version: { id: string },
  job: { id: string },
): PendingSourceImport {
  if (source.sourceType !== 'txt' && source.sourceType !== 'markdown') {
    throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
  }
  return {
    sourceId: source.id,
    versionId: version.id,
    jobId: job.id,
    displayTitle: source.displayName,
    sourceType: source.sourceType,
  };
}

export async function recoverInterruptedTextImports(
  userId: string,
  options: SourceImportServiceOptions = {},
): Promise<Array<{ sourceId: string; recovered: boolean; message: string }>> {
  const database = options.database ?? db;
  const runtime = options.runtime ?? defaultRuntime;
  const jobs = (await database.source_jobs.where('userId').equals(userId).toArray())
    .filter((job) => job.jobType === 'import' && (job.status === 'pending' || job.status === 'running'));
  const results: Array<{ sourceId: string; recovered: boolean; message: string }> = [];
  for (const job of jobs) {
    if (!job.sourceId || !job.versionId) continue;
    const [source, version] = await Promise.all([
      database.study_sources.get(job.sourceId),
      database.source_versions.get(job.versionId),
    ]);
    if (!source || !version || version.status === 'ready') continue;
    const pending = pendingFromRows(source, version, job);
    try {
      await resumePendingImport(database, runtime, pending, options);
      results.push({ sourceId: source.id, recovered: true, message: 'Import recovered.' });
    } catch (error) {
      const safeError = toSourceImportError(error);
      await markSourceImportFailed(
        database,
        pending,
        safeError.code,
        safeError.message,
        options.now?.() ?? Date.now(),
      );
      results.push({ sourceId: source.id, recovered: false, message: safeError.message });
    }
  }
  return results;
}

export async function retryTextImport(
  sourceId: string,
  userId: string,
  options: SourceImportServiceOptions = {},
): Promise<SourceImportResult> {
  const database = options.database ?? db;
  const runtime = options.runtime ?? defaultRuntime;
  const source = await database.study_sources.get(sourceId);
  if (!source || source.userId !== userId || source.currentVersionId) {
    throw new SourceImportError('INVALID_REQUEST');
  }
  const versions = await database.source_versions.where('sourceId').equals(sourceId).toArray();
  const version = versions.sort((left, right) => right.versionNumber - left.versionNumber)[0];
  const jobs = await database.source_jobs.where('sourceId').equals(sourceId).toArray();
  const job = jobs.sort((left, right) => right.createdAt - left.createdAt)[0];
  if (!version || !job) throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
  return resumePendingImport(
    database,
    runtime,
    pendingFromRows(source, version, job),
    options,
  );
}

export async function discardIncompleteSource(
  sourceId: string,
  userId: string,
  options: SourceImportServiceOptions = {},
): Promise<void> {
  return discardIncompleteSourceRecords(options.database ?? db, sourceId, userId);
}
