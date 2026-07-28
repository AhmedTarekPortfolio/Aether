import type { AetherDatabase } from '../../db/database';
import type {
  SourceJob,
  SourceSegment,
  SourceVersion,
  StudySource,
} from '../../types';
import {
  materializeSourceChunks,
  type DerivedTextChunk,
} from './sourceChunking';
import {
  createSourceAssociations,
  uniqueSourceDisplayTitle,
  validateSourceImportContext,
} from './sourceImportContext';
import type { SourceImportPersistenceOptions } from './sourceImportPersistence';
import {
  SOURCE_IMPORT_PROCESSOR_FINGERPRINT,
  type SourceImportContext,
  type SourceImportResult,
} from './sourceImportTypes';

function createDefaultId(): string {
  return globalThis.crypto.randomUUID();
}

export async function createPastedTextImport(
  database: AetherDatabase,
  context: SourceImportContext,
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
      database.source_versions,
      database.source_segments,
      database.source_chunks,
      database.source_associations,
      database.source_jobs,
    ],
    async () => {
      await validateSourceImportContext(database, context);
      const displayTitle = await uniqueSourceDisplayTitle(
        database,
        context.userId,
        context.displayTitle?.trim() || 'Pasted text',
      );
      const sourceId = createId();
      const versionId = createId();
      const segmentId = createId();
      const jobId = createId();
      const source: StudySource = {
        id: sourceId,
        userId: context.userId,
        displayName: displayTitle,
        sourceType: 'pasted-text',
        status: 'active',
        currentVersionId: versionId,
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
        originalFilename: null,
        versionReason: 'pasted_text',
        processorFingerprint: SOURCE_IMPORT_PROCESSOR_FINGERPRINT,
        status: 'ready',
        pageCount: null,
        lineCount: normalizedText.split('\n').length,
        segmentCount: 1,
        charCount: normalizedText.length,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        readyAt: now,
      };
      const segment: SourceSegment = {
        id: segmentId,
        userId: context.userId,
        sourceId,
        sourceVersionId: versionId,
        ordinal: 1,
        segmentType: 'text_block',
        text: normalizedText,
        textHash,
        heading: null,
        physicalPage: null,
        printedPageLabel: null,
        lineStart: 1,
        lineEnd: version.lineCount,
        timeStartMs: null,
        timeEndMs: null,
        boundingBox: null,
        confidence: null,
        extractionMethod: 'plain_text',
        createdAt: now,
      };
      const chunks = materializeSourceChunks(derivedChunks, {
        userId: context.userId,
        sourceVersionId: versionId,
        segmentId,
        createdAt: now,
        createId,
      });
      const job: SourceJob = {
        id: jobId,
        userId: context.userId,
        jobType: 'import',
        status: 'completed',
        sourceId,
        assetId: null,
        versionId,
        progress: 100,
        payload: { schema: 'aether-source-import:v1', context },
        result: { chunkCount: chunks.length, reusedManagedAsset: false },
        error: null,
        startedAt: now,
        completedAt: now,
        createdAt: now,
      };

      await database.study_sources.add(source);
      await database.source_versions.add(version);
      await options.beforeSegmentWrite?.();
      await database.source_segments.add(segment);
      await options.beforeChunkWrite?.(chunks);
      await database.source_chunks.bulkAdd(chunks);
      await database.source_associations.bulkAdd(
        createSourceAssociations(context, sourceId, now, createId),
      );
      await database.source_jobs.add(job);
      return {
        sourceId,
        versionId,
        displayTitle,
        sourceType: 'pasted-text',
        byteSize: null,
        characterCount: normalizedText.length,
        chunkCount: chunks.length,
        reusedManagedAsset: false,
      };
    },
  );
}
