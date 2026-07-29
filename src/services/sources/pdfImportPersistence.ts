import type { AetherDatabase } from '../../db/database';
import type {
  BoundingBox,
  SourceAsset,
  SourceChunk,
  SourceJob,
  SourceSegment,
  SourceVersion,
  StudySource,
} from '../../types';
import type {
  PdfExtractionJobResult,
  PdfPageExtraction,
} from '../../../electron/types/pdf';
import type {
  AssetFinalisationReceipt,
  SourceStagingReceipt,
} from '../../../electron/types/source-storage';
import {
  createSourceAssociations,
  uniqueSourceDisplayTitle,
  validateSourceImportContext,
} from './sourceImportContext';
import {
  deriveTextChunks,
  materializeSourceChunks,
} from './sourceChunking';
import {
  SourceImportError,
  type SourceImportContext,
  type SourceImportResult,
} from './sourceImportTypes';

export const PDF_IMPORT_PROCESSOR_FINGERPRINT =
  'aether-pdfjs:4.10.38;pages:v1;rtl-line-runs:nfkc;eval=false';
export const PDF_IMPORT_PAYLOAD_SCHEMA = 'aether-pdf-import:v1';

export interface PersistedPdfImportPayload {
  [key: string]: unknown;
  schema: typeof PDF_IMPORT_PAYLOAD_SCHEMA;
  context: SourceImportContext;
  stagingReceipt?: SourceStagingReceipt;
  assetReceipt?: AssetFinalisationReceipt;
  cancellationToken?: string;
}

export interface PendingPdfImport {
  sourceId: string;
  versionId: string;
  jobId: string;
  displayTitle: string;
}

export interface PdfPersistenceOptions {
  now?: () => number;
  createId?: () => string;
  beforePageWrite?: (segments: SourceSegment[]) => void | Promise<void>;
  beforeChunkWrite?: (chunks: SourceChunk[]) => void | Promise<void>;
}

function createDefaultId(): string {
  return globalThis.crypto.randomUUID();
}

function pdfDisplayTitle(receipt: SourceStagingReceipt, requested?: string): string {
  const fallback = receipt.originalFilename.replace(/\.pdf$/i, '').trim();
  return requested?.trim() || fallback || 'Imported PDF';
}

export function parsePersistedPdfImportPayload(value: unknown): PersistedPdfImportPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Partial<PersistedPdfImportPayload>;
  if (payload.schema !== PDF_IMPORT_PAYLOAD_SCHEMA || !payload.context) return null;
  return payload as PersistedPdfImportPayload;
}

export async function createPendingPdfImport(
  database: AetherDatabase,
  context: SourceImportContext,
  receipt: SourceStagingReceipt,
  cancellationToken: string,
  options: PdfPersistenceOptions = {},
): Promise<PendingPdfImport> {
  if (receipt.extension !== 'pdf' || receipt.mimeType !== 'application/pdf') {
    throw new SourceImportError('UNSUPPORTED_TEXT_SOURCE');
  }
  const now = options.now?.() ?? Date.now();
  const createId = options.createId ?? createDefaultId;
  return database.transaction(
    'rw',
    [
      database.users,
      database.subjects,
      database.topics,
      database.tasks,
      database.notes,
      database.study_sources,
      database.source_versions,
      database.source_jobs,
    ],
    async () => {
      await validateSourceImportContext(database, context);
      const displayTitle = await uniqueSourceDisplayTitle(
        database,
        context.userId,
        pdfDisplayTitle(receipt, context.displayTitle),
      );
      const sourceId = createId();
      const versionId = createId();
      const jobId = createId();
      const source: StudySource = {
        id: sourceId,
        userId: context.userId,
        displayName: displayTitle,
        sourceType: 'pdf',
        status: 'active',
        currentVersionId: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        trashedAt: null,
        purgedAt: null,
      };
      const version: SourceVersion = {
        id: versionId,
        userId: context.userId,
        sourceId,
        versionNumber: 1,
        assetId: null,
        originalFilename: receipt.originalFilename,
        versionReason: 'import',
        processorFingerprint: PDF_IMPORT_PROCESSOR_FINGERPRINT,
        status: 'staged',
        pageCount: null,
        lineCount: null,
        segmentCount: 0,
        charCount: 0,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        readyAt: null,
      };
      const payload: PersistedPdfImportPayload = {
        schema: PDF_IMPORT_PAYLOAD_SCHEMA,
        context,
        stagingReceipt: receipt,
        cancellationToken,
      };
      const job: SourceJob = {
        id: jobId,
        userId: context.userId,
        jobType: 'extract-text',
        status: 'running',
        sourceId,
        assetId: null,
        versionId,
        progress: 20,
        payload,
        result: null,
        error: null,
        startedAt: now,
        completedAt: null,
        createdAt: now,
      };
      await database.study_sources.add(source);
      await database.source_versions.add(version);
      await database.source_jobs.add(job);
      return { sourceId, versionId, jobId, displayTitle };
    },
  );
}

export async function checkpointPdfFinalisation(
  database: AetherDatabase,
  pending: PendingPdfImport,
  context: SourceImportContext,
  assetReceipt: AssetFinalisationReceipt,
  cancellationToken: string,
  options: PdfPersistenceOptions = {},
): Promise<SourceAsset> {
  const now = options.now?.() ?? Date.now();
  const createId = options.createId ?? createDefaultId;
  return database.transaction(
    'rw',
    [
      database.source_assets,
      database.source_versions,
      database.source_jobs,
    ],
    async () => {
      const [version, job] = await Promise.all([
        database.source_versions.get(pending.versionId),
        database.source_jobs.get(pending.jobId),
      ]);
      if (
        !version
        || !job
        || version.userId !== context.userId
        || job.versionId !== version.id
        || assetReceipt.extension !== 'pdf'
        || assetReceipt.mimeType !== 'application/pdf'
      ) throw new SourceImportError('IMPORT_TRANSACTION_FAILED');
      let asset = await database.source_assets
        .where('[userId+contentHash]')
        .equals([context.userId, assetReceipt.contentHash])
        .first();
      if (asset) {
        if (
          asset.relativePath !== assetReceipt.relativePath
          || asset.byteSize !== assetReceipt.byteSize
          || asset.mimeType !== assetReceipt.mimeType
          || asset.extension !== assetReceipt.extension
        ) throw new SourceImportError('MANAGED_ASSET_IDENTITY_MISMATCH');
      } else {
        asset = {
          id: createId(),
          userId: context.userId,
          contentHash: assetReceipt.contentHash,
          mimeType: assetReceipt.mimeType,
          extension: assetReceipt.extension,
          byteSize: assetReceipt.byteSize,
          relativePath: assetReceipt.relativePath,
          createdAt: now,
        };
        await database.source_assets.add(asset);
      }
      await database.source_versions.update(version.id, {
        assetId: asset.id,
        status: 'extracting',
        errorCode: null,
        errorMessage: null,
      });
      await database.source_jobs.update(job.id, {
        assetId: asset.id,
        status: 'running',
        progress: 35,
        payload: {
          schema: PDF_IMPORT_PAYLOAD_SCHEMA,
          context,
          assetReceipt,
          cancellationToken,
        } satisfies PersistedPdfImportPayload,
        result: null,
        error: null,
        startedAt: job.startedAt ?? now,
        completedAt: null,
      });
      return asset;
    },
  );
}

function pageEnvelope(boxes: PdfPageExtraction['boundingBoxes']): BoundingBox | null {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pageRows(
  pending: PendingPdfImport,
  context: SourceImportContext,
  pages: PdfPageExtraction[],
  now: number,
): { segments: SourceSegment[]; chunks: SourceChunk[] } {
  const segments: SourceSegment[] = [];
  const chunks: SourceChunk[] = [];
  let versionOffset = 0;
  for (const page of pages) {
    const segmentId = `pdf-segment:${pending.versionId}:${page.ordinal}`;
    segments.push({
      id: segmentId,
      userId: context.userId,
      sourceId: pending.sourceId,
      sourceVersionId: pending.versionId,
      ordinal: page.ordinal,
      segmentType: 'pdf_page',
      text: page.text,
      textHash: page.textHash,
      heading: null,
      physicalPage: page.physicalPage,
      printedPageLabel: page.printedPageLabel,
      lineStart: null,
      lineEnd: null,
      timeStartMs: null,
      timeEndMs: null,
      boundingBox: pageEnvelope(page.boundingBoxes),
      confidence: null,
      extractionMethod: 'pdf_text',
      createdAt: now,
    });
    if (page.text.length > 0) {
      const derived = deriveTextChunks(page.text).map((chunk) => ({
        ...chunk,
        charStart: chunk.charStart + versionOffset,
        charEnd: chunk.charEnd + versionOffset,
      }));
      let index = 0;
      chunks.push(...materializeSourceChunks(derived, {
        userId: context.userId,
        sourceVersionId: pending.versionId,
        segmentId,
        createdAt: now,
        createId: () => `pdf-chunk:${pending.versionId}:${page.ordinal}:${index++}`,
      }));
    }
    versionOffset += page.text.length + 1;
  }
  return { segments, chunks };
}

export async function completePdfImport(
  database: AetherDatabase,
  pending: PendingPdfImport,
  context: SourceImportContext,
  assetReceipt: AssetFinalisationReceipt,
  result: PdfExtractionJobResult,
  options: PdfPersistenceOptions = {},
): Promise<SourceImportResult> {
  if (
    result.jobId !== pending.jobId
    || !['completed', 'partially_completed'].includes(result.status)
    || result.pages.length === 0
  ) throw new SourceImportError(result.errorCode ?? 'PDF_OUTPUT_INVALID');
  const now = options.now?.() ?? Date.now();
  const createId = options.createId ?? createDefaultId;
  const rows = pageRows(pending, context, result.pages, now);
  const characterCount = result.pages.reduce((sum, page) => sum + page.text.length, 0);

  return database.transaction(
    'rw',
    [
      database.users,
      database.subjects,
      database.topics,
      database.tasks,
      database.notes,
      database.study_sources,
      database.source_assets,
      database.source_versions,
      database.source_segments,
      database.source_chunks,
      database.source_associations,
      database.source_jobs,
    ],
    async () => {
      await validateSourceImportContext(database, context);
      const [source, version, job, asset] = await Promise.all([
        database.study_sources.get(pending.sourceId),
        database.source_versions.get(pending.versionId),
        database.source_jobs.get(pending.jobId),
        database.source_assets
          .where('[userId+contentHash]')
          .equals([context.userId, assetReceipt.contentHash])
          .first(),
      ]);
      if (
        !source
        || !version
        || !job
        || !asset
        || source.sourceType !== 'pdf'
        || version.assetId !== asset.id
        || job.versionId !== version.id
      ) throw new SourceImportError('IMPORT_TRANSACTION_FAILED');

      await database.source_chunks.where('sourceVersionId').equals(version.id).delete();
      await database.source_segments.where('sourceVersionId').equals(version.id).delete();
      await options.beforePageWrite?.(rows.segments);
      await database.source_segments.bulkAdd(rows.segments);
      await options.beforeChunkWrite?.(rows.chunks);
      if (rows.chunks.length) await database.source_chunks.bulkAdd(rows.chunks);
      await database.source_associations.where('sourceId').equals(source.id).delete();
      await database.source_associations.bulkAdd(
        createSourceAssociations(context, source.id, now, createId),
      );
      await database.source_versions.update(version.id, {
        status: result.status === 'partially_completed' ? 'partially_ready' : 'ready',
        pageCount: result.pageCount,
        lineCount: null,
        segmentCount: rows.segments.length,
        charCount: characterCount,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        readyAt: now,
      });
      await database.study_sources.update(source.id, {
        currentVersionId: version.id,
        updatedAt: now,
      });
      await database.source_jobs.update(job.id, {
        status: 'completed',
        progress: 100,
        payload: {
          schema: PDF_IMPORT_PAYLOAD_SCHEMA,
          context,
          assetReceipt,
        } satisfies PersistedPdfImportPayload,
        result: {
          status: result.status,
          pageCount: result.pageCount,
          extractedPageCount: result.pages.length,
          scannedPageCount: result.scannedPageCount,
          scannedPages: result.pages
            .filter((page) => page.likelyScanned)
            .map((page) => page.physicalPage),
          chunkCount: rows.chunks.length,
          truncated: result.truncated,
          processorFingerprint: PDF_IMPORT_PROCESSOR_FINGERPRINT,
        },
        error: result.errorMessage,
        completedAt: now,
      });
      return {
        sourceId: source.id,
        versionId: version.id,
        displayTitle: source.displayName,
        sourceType: 'pdf',
        byteSize: asset.byteSize,
        characterCount,
        chunkCount: rows.chunks.length,
        reusedManagedAsset: assetReceipt.reusedExistingAssetFile,
        pageCount: result.pageCount,
        scannedPageCount: result.scannedPageCount,
        partiallyReady: result.status === 'partially_completed',
      };
    },
  );
}

export async function updatePdfJobProgress(
  database: AetherDatabase,
  jobId: string,
  percent: number,
): Promise<void> {
  await database.source_jobs.update(jobId, {
    progress: Math.min(99, Math.max(35, percent)),
  });
}

export async function failPdfImport(
  database: AetherDatabase,
  pending: Pick<PendingPdfImport, 'versionId' | 'jobId'>,
  code: string,
  message: string,
  cancelled: boolean,
  now = Date.now(),
): Promise<void> {
  await database.transaction(
    'rw',
    database.source_versions,
    database.source_jobs,
    async () => {
      await database.source_versions.update(pending.versionId, {
        status: 'failed',
        errorCode: code,
        errorMessage: message,
        readyAt: null,
      });
      await database.source_jobs.update(pending.jobId, {
        status: cancelled ? 'cancelled' : 'failed',
        error: message,
        completedAt: now,
      });
    },
  );
}

export async function createPdfRetryJob(
  database: AetherDatabase,
  sourceId: string,
  userId: string,
  cancellationToken: string,
  options: PdfPersistenceOptions = {},
): Promise<{ pending: PendingPdfImport; payload: PersistedPdfImportPayload }> {
  const now = options.now?.() ?? Date.now();
  const createId = options.createId ?? createDefaultId;
  return database.transaction(
    'rw',
    [
      database.study_sources,
      database.source_versions,
      database.source_jobs,
    ],
    async () => {
      const source = await database.study_sources.get(sourceId);
      if (
        !source
        || source.userId !== userId
        || source.sourceType !== 'pdf'
        || source.currentVersionId
      ) throw new SourceImportError('INVALID_REQUEST');
      const versions = await database.source_versions.where('sourceId').equals(sourceId).toArray();
      const version = versions.sort((left, right) => right.versionNumber - left.versionNumber)[0];
      if (!version || version.status !== 'failed' || !version.assetId) {
        throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
      }
      const priorJobs = await database.source_jobs.where('sourceId').equals(sourceId).toArray();
      const prior = priorJobs
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((job) => parsePersistedPdfImportPayload(job.payload))
        .find((payload) => payload?.assetReceipt);
      if (!prior?.assetReceipt) throw new SourceImportError('IMPORT_RECOVERY_UNAVAILABLE');
      const jobId = createId();
      const payload = { ...prior, cancellationToken };
      await database.source_jobs.add({
        id: jobId,
        userId,
        jobType: 'extract-text',
        status: 'running',
        sourceId,
        assetId: version.assetId,
        versionId: version.id,
        progress: 35,
        payload,
        result: null,
        error: null,
        startedAt: now,
        completedAt: null,
        createdAt: now,
      });
      await database.source_versions.update(version.id, {
        status: 'extracting',
        errorCode: null,
        errorMessage: null,
      });
      return {
        pending: {
          sourceId,
          versionId: version.id,
          jobId,
          displayTitle: source.displayName,
        },
        payload,
      };
    },
  );
}
