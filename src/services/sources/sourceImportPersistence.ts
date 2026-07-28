import type { AetherDatabase } from '../../db/database';
import type {
  SourceAsset,
  SourceChunk,
  SourceJob,
  SourceSegment,
  SourceType,
  SourceVersion,
  StudySource,
} from '../../types';
import type {
  AssetFinalisationReceipt,
  SourceStagingReceipt,
} from '../../../electron/types/source-storage';
import {
  createSourceAssociations,
  displayTitleFromReceipt,
  uniqueSourceDisplayTitle,
  validateSourceImportContext,
} from './sourceImportContext';
import {
  materializeSourceChunks,
  type DerivedTextChunk,
} from './sourceChunking';
import {
  SOURCE_IMPORT_PROCESSOR_FINGERPRINT,
  SourceImportError,
  type SourceImportContext,
  type SourceImportErrorCode,
  type SourceImportResult,
} from './sourceImportTypes';

const IMPORT_PAYLOAD_SCHEMA = 'aether-source-import:v1';

export interface PersistedSourceImportPayload {
  [key: string]: unknown;
  schema: typeof IMPORT_PAYLOAD_SCHEMA;
  context: SourceImportContext;
  stagingReceipt?: SourceStagingReceipt;
}

export interface PendingSourceImport {
  sourceId: string;
  versionId: string;
  jobId: string;
  displayTitle: string;
  sourceType: Extract<SourceType, 'txt' | 'markdown'>;
}

export interface SourceImportPersistenceOptions {
  now?: () => number;
  createId?: () => string;
  beforeSegmentWrite?: () => void | Promise<void>;
  beforeChunkWrite?: (chunks: SourceChunk[]) => void | Promise<void>;
}

function createDefaultId(): string {
  return globalThis.crypto.randomUUID();
}

export async function createPendingFileImport(
  database: AetherDatabase,
  context: SourceImportContext,
  receipt: SourceStagingReceipt,
  options: SourceImportPersistenceOptions = {},
): Promise<PendingSourceImport> {
  const now = options.now?.() ?? Date.now();
  const createId = options.createId ?? createDefaultId;
  const sourceType = receipt.extension === 'txt'
    ? 'txt'
    : receipt.extension === 'md' || receipt.extension === 'markdown'
      ? 'markdown'
      : null;
  if (!sourceType) throw new SourceImportError('UNSUPPORTED_TEXT_SOURCE');
  const requestedTitle = displayTitleFromReceipt(receipt, context.displayTitle);

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
      const displayTitle = await uniqueSourceDisplayTitle(database, context.userId, requestedTitle);
      const sourceId = createId();
      const versionId = createId();
      const jobId = createId();
      const source: StudySource = {
        id: sourceId,
        userId: context.userId,
        displayName: displayTitle,
        sourceType,
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
        processorFingerprint: SOURCE_IMPORT_PROCESSOR_FINGERPRINT,
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
      const payload: PersistedSourceImportPayload = {
        schema: IMPORT_PAYLOAD_SCHEMA,
        context,
        stagingReceipt: receipt,
      };
      const job: SourceJob = {
        id: jobId,
        userId: context.userId,
        jobType: 'import',
        status: 'running',
        sourceId,
        assetId: null,
        versionId,
        progress: 30,
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
      return { sourceId, versionId, jobId, displayTitle, sourceType };
    },
  );
}

export async function completeTextImport(
  database: AetherDatabase,
  pending: PendingSourceImport,
  context: SourceImportContext,
  assetReceipt: AssetFinalisationReceipt,
  normalizedText: string,
  textHash: string,
  derivedChunks: DerivedTextChunk[],
  options: SourceImportPersistenceOptions = {},
): Promise<SourceImportResult> {
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
      database.source_assets,
      database.source_versions,
      database.source_segments,
      database.source_chunks,
      database.source_associations,
      database.source_jobs,
    ],
    async () => {
      await validateSourceImportContext(database, context);
      const source = await database.study_sources.get(pending.sourceId);
      const version = await database.source_versions.get(pending.versionId);
      const job = await database.source_jobs.get(pending.jobId);
      if (
        !source
        || !version
        || !job
        || source.userId !== context.userId
        || version.sourceId !== source.id
        || job.versionId !== version.id
        || version.status === 'ready'
      ) {
        throw new SourceImportError('IMPORT_TRANSACTION_FAILED');
      }

      let asset = await database.source_assets
        .where('[userId+contentHash]')
        .equals([context.userId, assetReceipt.contentHash])
        .first();
      const reusedAssetRecord = Boolean(asset);
      if (asset) {
        if (
          asset.relativePath !== assetReceipt.relativePath
          || asset.byteSize !== assetReceipt.byteSize
          || asset.mimeType !== assetReceipt.mimeType
          || asset.extension !== assetReceipt.extension
        ) {
          throw new SourceImportError('MANAGED_ASSET_IDENTITY_MISMATCH');
        }
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
        } satisfies SourceAsset;
        await database.source_assets.add(asset);
      }

      const segmentId = createId();
      const segment: SourceSegment = {
        id: segmentId,
        userId: context.userId,
        sourceId: source.id,
        sourceVersionId: version.id,
        ordinal: 1,
        segmentType: 'text_block',
        text: normalizedText,
        textHash,
        heading: null,
        physicalPage: null,
        printedPageLabel: null,
        lineStart: 1,
        lineEnd: normalizedText.split('\n').length,
        timeStartMs: null,
        timeEndMs: null,
        boundingBox: null,
        confidence: null,
        extractionMethod: 'plain_text',
        createdAt: now,
      };
      const chunks = materializeSourceChunks(derivedChunks, {
        userId: context.userId,
        sourceVersionId: version.id,
        segmentId,
        createdAt: now,
        createId,
      });

      await database.source_chunks.where('sourceVersionId').equals(version.id).delete();
      await database.source_segments.where('sourceVersionId').equals(version.id).delete();
      await options.beforeSegmentWrite?.();
      await database.source_segments.add(segment);
      await options.beforeChunkWrite?.(chunks);
      await database.source_chunks.bulkAdd(chunks);
      await database.source_associations.where('sourceId').equals(source.id).delete();
      await database.source_associations.bulkAdd(
        createSourceAssociations(context, source.id, now, createId),
      );
      await database.source_versions.update(version.id, {
        assetId: asset.id,
        status: 'ready',
        lineCount: segment.lineEnd,
        segmentCount: 1,
        charCount: normalizedText.length,
        errorCode: null,
        errorMessage: null,
        readyAt: now,
      });
      await database.study_sources.update(source.id, {
        currentVersionId: version.id,
        updatedAt: now,
      });
      await database.source_jobs.update(job.id, {
        assetId: asset.id,
        status: 'completed',
        progress: 100,
        payload: { schema: IMPORT_PAYLOAD_SCHEMA, context },
        result: {
          chunkCount: chunks.length,
          reusedManagedAsset: assetReceipt.reusedExistingAssetFile || reusedAssetRecord,
        },
        error: null,
        completedAt: now,
      });

      return {
        sourceId: source.id,
        versionId: version.id,
        displayTitle: source.displayName,
        sourceType: pending.sourceType,
        byteSize: asset.byteSize,
        characterCount: normalizedText.length,
        chunkCount: chunks.length,
        reusedManagedAsset: assetReceipt.reusedExistingAssetFile || reusedAssetRecord,
      };
    },
  );
}

export async function persistFinalisationCheckpoint(
  database: AetherDatabase,
  pending: PendingSourceImport,
): Promise<void> {
  await database.transaction(
    'rw',
    database.source_versions,
    database.source_jobs,
    async () => {
      await database.source_versions.update(pending.versionId, { status: 'extracting' });
      await database.source_jobs.update(pending.jobId, { progress: 55 });
    },
  );
}

export async function markSourceImportFailed(
  database: AetherDatabase,
  pending: Pick<PendingSourceImport, 'versionId' | 'jobId'>,
  code: SourceImportErrorCode,
  safeMessage: string,
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
        errorMessage: safeMessage,
        readyAt: null,
      });
      await database.source_jobs.update(pending.jobId, {
        status: 'failed',
        error: safeMessage,
        completedAt: now,
      });
    },
  );
}

export async function markSourceImportCancelled(
  database: AetherDatabase,
  pending: Pick<PendingSourceImport, 'versionId' | 'jobId'>,
  now = Date.now(),
): Promise<void> {
  await database.transaction(
    'rw',
    database.source_versions,
    database.source_jobs,
    async () => {
      await database.source_versions.update(pending.versionId, {
        status: 'failed',
        errorCode: 'IMPORT_CANCELLED',
        errorMessage: 'The source import was cancelled.',
        readyAt: null,
      });
      await database.source_jobs.update(pending.jobId, {
        status: 'cancelled',
        error: 'The source import was cancelled.',
        completedAt: now,
      });
    },
  );
}

export function parsePersistedImportPayload(value: unknown): PersistedSourceImportPayload | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<PersistedSourceImportPayload>;
  if (record.schema !== IMPORT_PAYLOAD_SCHEMA || !record.context) return null;
  return record as PersistedSourceImportPayload;
}

export async function discardIncompleteSource(
  database: AetherDatabase,
  sourceId: string,
  userId: string,
): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.study_sources,
      database.source_versions,
      database.source_segments,
      database.source_chunks,
      database.source_associations,
      database.source_jobs,
    ],
    async () => {
      const source = await database.study_sources.get(sourceId);
      if (!source) return;
      if (source.userId !== userId || source.currentVersionId) {
        throw new SourceImportError('INVALID_REQUEST');
      }
      const versions = await database.source_versions.where('sourceId').equals(sourceId).toArray();
      if (versions.some((version) => version.status === 'ready')) {
        throw new SourceImportError('INVALID_REQUEST');
      }
      const versionIds = versions.map((version) => version.id);
      for (const versionId of versionIds) {
        await database.source_chunks.where('sourceVersionId').equals(versionId).delete();
        await database.source_segments.where('sourceVersionId').equals(versionId).delete();
      }
      await database.source_jobs.where('sourceId').equals(sourceId).delete();
      await database.source_associations.where('sourceId').equals(sourceId).delete();
      await database.source_versions.where('sourceId').equals(sourceId).delete();
      await database.study_sources.delete(sourceId);
    },
  );
}
