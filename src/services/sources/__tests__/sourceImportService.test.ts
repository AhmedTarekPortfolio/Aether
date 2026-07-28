import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AetherDatabase } from '../../../db/database';
import type {
  AssetFinalisationReceipt,
  SourceStagingReceipt,
} from '../../../../electron/types/source-storage';
import {
  createPendingFileImport,
  type PersistedSourceImportPayload,
} from '../sourceImportPersistence';
import {
  discardIncompleteSource,
  importPastedText,
  importTextFile,
  recoverInterruptedTextImports,
  retryTextImport,
  type SourceImportRuntime,
} from '../sourceImportService';
import type { SourceImportContext } from '../sourceImportTypes';
import {
  createSourceTestDatabase,
  deleteSourceTestDatabase,
} from './sourceTestUtils';

const databases: AetherDatabase[] = [];
const now = 1_700_000_000_000;
const defaultContext: SourceImportContext = {
  userId: 'user-a',
  subjectId: 'subject-a',
};

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteSourceTestDatabase));
});

async function testDatabase(): Promise<AetherDatabase> {
  const database = await createSourceTestDatabase();
  databases.push(database);
  return database;
}

function receipt(
  extension: 'txt' | 'md' | 'markdown' = 'txt',
  text = 'Local source text',
): SourceStagingReceipt {
  const contentHash = extension === 'txt' ? 'a'.repeat(64) : 'b'.repeat(64);
  return {
    stagingToken: 'c'.repeat(64),
    contentHash,
    mimeType: extension === 'txt' ? 'text/plain' : 'text/markdown',
    extension,
    byteSize: new TextEncoder().encode(text).byteLength,
    originalFilename: `lesson.${extension}`,
    proposedRelativePath: `assets/${contentHash.slice(0, 2)}/${contentHash}.${extension}`,
    createdAt: now,
  };
}

function finalisation(staging: SourceStagingReceipt): AssetFinalisationReceipt {
  return {
    stagingToken: staging.stagingToken,
    contentHash: staging.contentHash,
    mimeType: staging.mimeType,
    extension: staging.extension,
    byteSize: staging.byteSize,
    relativePath: staging.proposedRelativePath,
    finalisedAt: now,
    reusedExistingAssetFile: false,
  };
}

function runtimeFor(
  staging: SourceStagingReceipt,
  text = 'Local source text',
  overrides: Partial<SourceImportRuntime> = {},
): SourceImportRuntime {
  return {
    selectAndStageSources: vi.fn().mockResolvedValue({
      ok: true,
      value: { cancelled: false, receipts: [staging] },
    }),
    finaliseSourceAsset: vi.fn().mockResolvedValue({
      ok: true,
      value: finalisation(staging),
    }),
    readManagedTextAsset: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        text,
        contentHash: staging.contentHash,
        mimeType: staging.mimeType,
        extension: staging.extension,
        byteSize: staging.byteSize,
      },
    }),
    cancelSourceStaging: vi.fn().mockResolvedValue({ cancelled: true }),
    ...overrides,
  };
}

describe('file source import orchestration', () => {
  it.each(['txt', 'md', 'markdown'] as const)(
    'imports .%s through WP-LOCAL-02 into ready durable records',
    async (extension) => {
      const database = await testDatabase();
      const text = extension === 'txt' ? 'Line one\r\nLine two 😀' : '# Heading\n\nArabic العربية';
      const staging = receipt(extension, text);
      const runtime = runtimeFor(staging, text);
      const stages: string[] = [];

      const result = await importTextFile(defaultContext, {
        database,
        runtime,
        now: () => now,
        onProgress: (value) => stages.push(value.stage),
      });

      expect(result.sourceType).toBe(extension === 'txt' ? 'txt' : 'markdown');
      expect(stages).toEqual([
        'selecting',
        'staging',
        'finalising',
        'reading',
        'processing',
        'saving',
        'completed',
      ]);
      expect(runtime.selectAndStageSources).toHaveBeenCalledWith({
        selectionMode: 'single',
        allowedKinds: ['text', 'markdown'],
        maximumFileCount: 1,
      });
      const source = await database.study_sources.get(result.sourceId);
      const version = await database.source_versions.get(result.versionId);
      const segment = await database.source_segments
        .where('sourceVersionId')
        .equals(result.versionId)
        .first();
      expect(source).toMatchObject({
        status: 'active',
        currentVersionId: result.versionId,
      });
      expect(version).toMatchObject({
        status: 'ready',
        assetId: expect.any(String),
        segmentCount: 1,
        charCount: text.replace(/\r\n?/g, '\n').length,
        errorCode: null,
      });
      expect(segment).toMatchObject({
        ordinal: 1,
        segmentType: 'text_block',
        extractionMethod: 'plain_text',
        text: text.replace(/\r\n?/g, '\n'),
        lineStart: 1,
        lineEnd: text.replace(/\r\n?/g, '\n').split('\n').length,
      });
      expect(await database.source_chunks.where('sourceVersionId').equals(result.versionId).count())
        .toBe(result.chunkCount);
      expect(await database.source_associations.where('sourceId').equals(result.sourceId).toArray())
        .toEqual([expect.objectContaining({
          targetType: 'subject',
          targetId: 'subject-a',
          associationType: 'primary',
        })]);
      expect(await database.source_jobs.where('sourceId').equals(result.sourceId).first())
        .toMatchObject({ status: 'completed', progress: 100 });
    },
  );

  it('does not let progress-observer failures corrupt a committed ready import', async () => {
    const database = await testDatabase();
    const staging = receipt();
    let completedObserved = false;

    const result = await importTextFile(defaultContext, {
      database,
      runtime: runtimeFor(staging),
      now: () => now,
      onProgress: ({ stage }) => {
        if (stage === 'completed') {
          completedObserved = true;
          throw new Error('UI observer failed');
        }
      },
    });

    expect(completedObserved).toBe(true);
    expect(await database.study_sources.get(result.sourceId)).toMatchObject({
      currentVersionId: result.versionId,
    });
    expect(await database.source_versions.get(result.versionId)).toMatchObject({
      status: 'ready',
      errorCode: null,
    });
    expect(await database.source_jobs.where('sourceId').equals(result.sourceId).first())
      .toMatchObject({ status: 'completed', progress: 100 });
  });

  it('reuses one per-user asset while creating separate visible sources', async () => {
    const database = await testDatabase();
    const staging = receipt();
    const runtime = runtimeFor(staging);
    const first = await importTextFile(defaultContext, { database, runtime });
    const second = await importTextFile(defaultContext, { database, runtime });

    expect(first.sourceId).not.toBe(second.sourceId);
    expect(await database.study_sources.count()).toBe(2);
    expect(await database.source_versions.count()).toBe(2);
    expect(await database.source_assets.count()).toBe(1);
    expect((await database.study_sources.toArray()).map((source) => source.displayName).sort())
      .toEqual(['lesson', 'lesson (2)']);
    expect(second.reusedManagedAsset).toBe(true);
  });

  it('creates validated optional associations and rejects cross-user or wrong-subject targets', async () => {
    const database = await testDatabase();
    const staging = receipt();
    const runtime = runtimeFor(staging);
    const result = await importTextFile({
      ...defaultContext,
      topicId: 'topic-a',
      taskId: 'task-a',
      noteId: 'note-a',
      associationType: 'supplementary',
    }, { database, runtime });
    const associations = await database.source_associations
      .where('sourceId')
      .equals(result.sourceId)
      .toArray();
    expect(associations).toHaveLength(4);
    expect(associations.find((item) => item.targetType === 'subject')?.associationType)
      .toBe('primary');
    expect(associations.filter((item) => item.targetType !== 'subject'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ targetType: 'topic', associationType: 'supplementary' }),
        expect.objectContaining({ targetType: 'task', associationType: 'supplementary' }),
        expect.objectContaining({ targetType: 'note', associationType: 'supplementary' }),
      ]));

    await expect(importTextFile({
      ...defaultContext,
      topicId: 'topic-b',
    }, { database, runtime })).rejects.toMatchObject({ code: 'TOPIC_SUBJECT_MISMATCH' });
    await expect(importTextFile({
      ...defaultContext,
      taskId: 'task-b',
    }, { database, runtime })).rejects.toMatchObject({ code: 'ASSOCIATION_USER_MISMATCH' });
    expect(runtime.selectAndStageSources).toHaveBeenCalledTimes(1);
  });

  it('handles native cancellation without creating metadata', async () => {
    const database = await testDatabase();
    const staging = receipt();
    const runtime = runtimeFor(staging, 'Local source text', {
      selectAndStageSources: vi.fn().mockResolvedValue({
        ok: true,
        value: { cancelled: true, receipts: [] },
      }),
    });
    await expect(importTextFile(defaultContext, { database, runtime }))
      .rejects.toMatchObject({ code: 'IMPORT_CANCELLED' });
    expect(await database.study_sources.count()).toBe(0);
    expect(await database.source_versions.count()).toBe(0);
  });

  it.each([
    ['finalisation', {
      finaliseSourceAsset: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'ASSET_PROMOTION_FAILED', message: 'hidden' },
      }),
    }],
    ['managed read', {
      readManagedTextAsset: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'INVALID_TEXT_ENCODING', message: 'hidden' },
      }),
    }],
  ] as const)('persists safe failed state when %s fails', async (_label, overrides) => {
    const database = await testDatabase();
    const staging = receipt();
    const runtime = runtimeFor(staging, 'Local source text', overrides as Partial<SourceImportRuntime>);
    await expect(importTextFile(defaultContext, { database, runtime })).rejects.toBeInstanceOf(Error);
    expect(await database.source_versions.toCollection().first()).toMatchObject({
      status: 'failed',
      readyAt: null,
    });
    expect(await database.source_jobs.toCollection().first()).toMatchObject({
      status: 'failed',
      completedAt: expect.any(Number),
    });
    expect(JSON.stringify(await database.source_jobs.toArray())).not.toContain('hidden');
  });

  it('rolls back asset, segment, chunks, associations, and ready state on chunk failure', async () => {
    const database = await testDatabase();
    const staging = receipt();
    await expect(importTextFile(defaultContext, {
      database,
      runtime: runtimeFor(staging),
      beforeChunkWrite: () => {
        throw new Error('injected chunk failure');
      },
    })).rejects.toMatchObject({ code: 'IMPORT_TRANSACTION_FAILED' });

    expect(await database.source_assets.count()).toBe(0);
    expect(await database.source_segments.count()).toBe(0);
    expect(await database.source_chunks.count()).toBe(0);
    expect(await database.source_associations.count()).toBe(0);
    expect(await database.source_versions.toCollection().first()).toMatchObject({
      status: 'failed',
      assetId: null,
    });
  });
});

describe('pasted text and import recovery', () => {
  it('commits pasted Unicode text atomically with no asset and durable associations', async () => {
    const database = await testDatabase();
    const result = await importPastedText({
      ...defaultContext,
      displayTitle: 'My paste',
      topicId: 'topic-a',
    }, 'Arabic العربية\r\nEmoji 😀', { database, now: () => now });

    expect(result).toMatchObject({
      displayTitle: 'My paste',
      sourceType: 'pasted-text',
      byteSize: null,
      reusedManagedAsset: false,
    });
    expect(await database.source_assets.count()).toBe(0);
    expect(await database.source_versions.get(result.versionId)).toMatchObject({
      status: 'ready',
      assetId: null,
      versionReason: 'pasted_text',
    });
    expect(await database.source_segments.where('sourceVersionId').equals(result.versionId).first())
      .toMatchObject({ text: 'Arabic العربية\nEmoji 😀' });
    expect(await database.source_associations.where('sourceId').equals(result.sourceId).count())
      .toBe(2);

    const databaseName = database.name;
    database.close();
    await database.open();
    expect(database.name).toBe(databaseName);
    expect(await database.study_sources.get(result.sourceId)).toBeDefined();
    expect(await database.source_chunks.where('sourceVersionId').equals(result.versionId).count())
      .toBe(result.chunkCount);
  });

  it('rejects invalid pasted text and rolls back injected transaction failures', async () => {
    const database = await testDatabase();
    await expect(importPastedText(defaultContext, '   \n', { database }))
      .rejects.toMatchObject({ code: 'EMPTY_TEXT' });
    await expect(importPastedText(defaultContext, 'valid text', {
      database,
      beforeSegmentWrite: () => {
        throw new Error('injected');
      },
    })).rejects.toMatchObject({ code: 'IMPORT_TRANSACTION_FAILED' });
    expect(await database.study_sources.count()).toBe(0);
    expect(await database.source_versions.count()).toBe(0);
    expect(await database.source_jobs.count()).toBe(0);
  });

  it('recovers a staged version, and rebuilds incomplete derived chunks without duplicates', async () => {
    const database = await testDatabase();
    const staging = receipt();
    const pending = await createPendingFileImport(database, defaultContext, staging);
    const runtime = runtimeFor(staging);

    await expect(recoverInterruptedTextImports('user-a', { database, runtime }))
      .resolves.toEqual([{
        sourceId: pending.sourceId,
        recovered: true,
        message: 'Import recovered.',
      }]);
    expect(await database.source_versions.get(pending.versionId)).toMatchObject({ status: 'ready' });
    expect(await database.source_segments.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(1);
    const originalChunkCount = await database.source_chunks
      .where('sourceVersionId')
      .equals(pending.versionId)
      .count();

    const job = await database.source_jobs.get(pending.jobId);
    await database.transaction(
      'rw',
      database.study_sources,
      database.source_versions,
      database.source_chunks,
      database.source_jobs,
      async () => {
        await database.study_sources.update(pending.sourceId, { currentVersionId: null });
        await database.source_versions.update(pending.versionId, { status: 'extracting' });
        await database.source_chunks.where('sourceVersionId').equals(pending.versionId).delete();
        const payload: PersistedSourceImportPayload = {
          schema: 'aether-source-import:v1',
          context: defaultContext,
          stagingReceipt: staging,
        };
        await database.source_jobs.update(pending.jobId, {
          status: 'running',
          completedAt: null,
          payload,
          result: null,
        });
      },
    );
    expect(job).toBeDefined();
    await recoverInterruptedTextImports('user-a', { database, runtime });
    expect(await database.source_segments.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(1);
    expect(await database.source_chunks.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(originalChunkCount);
  });

  it('marks expired recovery safely, supports retry when the asset exists, and discards only metadata', async () => {
    const database = await testDatabase();
    const staging = receipt();
    const pending = await createPendingFileImport(database, defaultContext, staging);
    const unavailable = runtimeFor(staging, 'Local source text', {
      finaliseSourceAsset: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'STAGING_TOKEN_EXPIRED', message: 'expired' },
      }),
      readManagedTextAsset: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'MANAGED_ASSET_NOT_FOUND', message: 'missing' },
      }),
    });
    await recoverInterruptedTextImports('user-a', { database, runtime: unavailable });
    expect(await database.source_versions.get(pending.versionId)).toMatchObject({
      status: 'failed',
      errorCode: 'IMPORT_RECOVERY_UNAVAILABLE',
    });

    const available = runtimeFor(staging);
    await retryTextImport(pending.sourceId, 'user-a', { database, runtime: available });
    expect(await database.source_versions.get(pending.versionId)).toMatchObject({ status: 'ready' });

    const second = await createPendingFileImport(database, {
      ...defaultContext,
      displayTitle: 'Discard me',
    }, { ...staging, stagingToken: 'd'.repeat(64) });
    await database.source_versions.update(second.versionId, { status: 'failed' });
    await discardIncompleteSource(second.sourceId, 'user-a', { database });
    await expect(discardIncompleteSource(second.sourceId, 'user-a', { database }))
      .resolves.toBeUndefined();
    expect(await database.study_sources.get(second.sourceId)).toBeUndefined();
    expect(await database.source_assets.count()).toBe(1);
  });
});
