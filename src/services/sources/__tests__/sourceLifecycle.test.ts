import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AetherDatabase } from '../../../db/database';
import type {
  AIGroundingRecord,
  SourceAsset,
  SourceStatus,
  SourceType,
} from '../../../types';
import {
  BACKUP_V2_DATABASE_SCHEMA_VERSION,
  PERSISTENCE_TABLES,
} from '../../../types/backup';
import { resolveGroundingSourceNavigation } from '../../../api';
import {
  archiveSource,
  getSourceLibraryEntries,
  getSourcePurgePreview,
  moveSourceToTrash,
  purgeSourcePermanently,
  recoverInterruptedSourcePurges,
  restoreSourceFromTrash,
  SourceLifecycleError,
  unarchiveSource,
} from '..';
import {
  createSourceTestDatabase,
  deleteSourceTestDatabase,
} from './sourceTestUtils';

const databases: AetherDatabase[] = [];
const now = 1_700_000_000_000;

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteSourceTestDatabase));
});

async function createDatabase(): Promise<AetherDatabase> {
  const database = await createSourceTestDatabase();
  databases.push(database);
  return database;
}

async function addSourceGraph(
  database: AetherDatabase,
  id: string,
  options: {
    userId?: string;
    sourceType?: SourceType;
    status?: SourceStatus;
    asset?: SourceAsset | null;
  } = {},
) {
  const userId = options.userId ?? 'user-a';
  const sourceType = options.sourceType ?? 'txt';
  const status = options.status ?? 'active';
  const versionId = `${id}-version`;
  const segmentId = `${id}-segment`;
  const asset = options.asset === undefined
    ? {
        id: `${id}-asset`,
        userId,
        contentHash: id.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a'),
        mimeType: sourceType === 'pdf' ? 'application/pdf' : 'text/plain',
        extension: sourceType === 'pdf' ? 'pdf' : 'txt',
        byteSize: 12,
        relativePath: '',
        createdAt: now,
      }
    : options.asset;
  if (asset && !asset.relativePath) {
    asset.relativePath = `assets/${asset.contentHash.slice(0, 2)}/${asset.contentHash}.${asset.extension}`;
  }
  if (asset && !await database.source_assets.get(asset.id)) {
    await database.source_assets.add(asset);
  }
  await database.study_sources.add({
    id,
    userId,
    displayName: `${id} title`,
    sourceType,
    status,
    currentVersionId: versionId,
    createdAt: now,
    updatedAt: now,
    archivedAt: status === 'archived' ? now - 100 : null,
    trashedAt: status === 'trashed' ? now - 50 : null,
    purgedAt: status === 'purged' ? now - 25 : null,
  });
  await database.source_versions.add({
    id: versionId,
    userId,
    sourceId: id,
    versionNumber: 1,
    assetId: asset?.id ?? null,
    originalFilename: asset ? `${id}.${asset.extension}` : null,
    versionReason: sourceType === 'pasted-text' ? 'pasted_text' : 'import',
    processorFingerprint: 'test:v1',
    status: 'ready',
    pageCount: sourceType === 'pdf' ? 1 : null,
    lineCount: sourceType === 'pdf' ? null : 1,
    segmentCount: 1,
    charCount: 16,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    readyAt: now,
  });
  await database.source_segments.add({
    id: segmentId,
    userId,
    sourceId: id,
    sourceVersionId: versionId,
    ordinal: 1,
    segmentType: sourceType === 'pdf' ? 'pdf_page' : 'text_block',
    text: 'exact durable text',
    textHash: 'b'.repeat(64),
    heading: null,
    physicalPage: sourceType === 'pdf' ? 1 : null,
    printedPageLabel: null,
    lineStart: sourceType === 'pdf' ? null : 1,
    lineEnd: sourceType === 'pdf' ? null : 1,
    timeStartMs: null,
    timeEndMs: null,
    boundingBox: null,
    confidence: null,
    extractionMethod: sourceType === 'pdf' ? 'pdf_text' : 'plain_text',
    createdAt: now,
  });
  await database.source_chunks.add({
    id: `${id}-chunk`,
    userId,
    sourceVersionId: versionId,
    segmentId,
    chunkerFingerprint: 'test:v1',
    ordinal: 0,
    text: 'exact durable text',
    tokenEstimate: 4,
    charStart: 0,
    charEnd: 18,
    createdAt: now,
  });
  await database.source_associations.add({
    id: `${id}-association`,
    userId,
    sourceId: id,
    targetType: 'subject',
    targetId: userId === 'user-a' ? 'subject-a' : 'subject-b',
    associationType: 'primary',
    createdAt: now,
  });
  await database.source_jobs.add({
    id: `${id}-job`,
    userId,
    jobType: 'import',
    status: 'completed',
    sourceId: id,
    assetId: asset?.id ?? null,
    versionId,
    progress: 100,
    payload: {},
    result: null,
    error: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
  });
  return { asset, versionId, segmentId };
}

const deleteSuccess = () => Promise.resolve({
  ok: true as const,
  value: { deleted: true, alreadyMissing: false },
});

describe('WP-LOCAL-04 source lifecycle', () => {
  it('archives, unarchives, and repeats both operations without mutating source data', async () => {
    const database = await createDatabase();
    await addSourceGraph(database, 'archive-source');
    const beforeCounts = await Promise.all([
      database.source_versions.count(),
      database.source_segments.count(),
      database.source_chunks.count(),
      database.source_associations.count(),
      database.source_jobs.count(),
    ]);

    await archiveSource('archive-source', 'user-a', { database, now: () => now + 1 });
    await archiveSource('archive-source', 'user-a', { database, now: () => now + 2 });
    expect(await database.study_sources.get('archive-source')).toMatchObject({
      status: 'archived',
      archivedAt: now + 1,
    });
    await unarchiveSource('archive-source', 'user-a', { database, now: () => now + 3 });
    await unarchiveSource('archive-source', 'user-a', { database, now: () => now + 4 });
    expect(await database.study_sources.get('archive-source')).toMatchObject({
      status: 'active',
      archivedAt: null,
    });
    expect(await Promise.all([
      database.source_versions.count(),
      database.source_segments.count(),
      database.source_chunks.count(),
      database.source_associations.count(),
      database.source_jobs.count(),
    ])).toEqual(beforeCounts);
  });

  it('moves active and archived sources to trash and restores their durable prior state', async () => {
    const database = await createDatabase();
    await addSourceGraph(database, 'active-source');
    await addSourceGraph(database, 'archived-source', { status: 'archived' });

    await moveSourceToTrash('active-source', 'user-a', { database, now: () => now + 1 });
    await moveSourceToTrash('active-source', 'user-a', { database, now: () => now + 2 });
    await moveSourceToTrash('archived-source', 'user-a', { database, now: () => now + 3 });
    expect((await database.study_sources.get('active-source'))?.archivedAt).toBeNull();
    expect((await database.study_sources.get('archived-source'))?.archivedAt).toBe(now - 100);

    await restoreSourceFromTrash('active-source', 'user-a', { database });
    await restoreSourceFromTrash('active-source', 'user-a', { database });
    await restoreSourceFromTrash('archived-source', 'user-a', { database });
    expect((await database.study_sources.get('active-source'))?.status).toBe('active');
    expect((await database.study_sources.get('archived-source'))?.status).toBe('archived');
  });

  it('rejects illegal transitions, missing sources, and cross-user operations', async () => {
    const database = await createDatabase();
    await addSourceGraph(database, 'owned-source');
    await addSourceGraph(database, 'purged-source', { status: 'purged' });
    await expect(archiveSource('owned-source', 'user-b', { database }))
      .rejects.toMatchObject({ code: 'SOURCE_USER_MISMATCH' });
    await expect(archiveSource('missing-source', 'user-a', { database }))
      .rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND' });
    await expect(restoreSourceFromTrash('purged-source', 'user-a', { database }))
      .rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    await expect(purgeSourcePermanently('owned-source', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset: deleteSuccess,
    })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('requires confirmation and reports exact purge impact without disclosing asset identities', async () => {
    const database = await createDatabase();
    await addSourceGraph(database, 'preview-source', { status: 'trashed' });
    const preview = await getSourcePurgePreview('preview-source', 'user-a', { database });
    expect(preview).toEqual({
      sourceId: 'preview-source',
      displayTitle: 'preview-source title',
      sourceType: 'txt',
      versionCount: 1,
      segmentCount: 1,
      managedAssetCount: 1,
      sharedAsset: false,
      willDeletePhysicalAsset: true,
      willRetainPhysicalAsset: false,
      assetDisposition: 'delete',
    });
    expect(JSON.stringify(preview)).not.toMatch(/relativePath|contentHash|assetId/);
    await expect(purgeSourcePermanently('preview-source', 'user-a', {
      database,
      confirmed: false,
      deleteManagedAsset: deleteSuccess,
    })).rejects.toBeInstanceOf(SourceLifecycleError);
  });

  it('retains a shared managed asset and removes only the purged source graph', async () => {
    const database = await createDatabase();
    const sharedAsset: SourceAsset = {
      id: 'shared-asset',
      userId: 'user-a',
      contentHash: 'c'.repeat(64),
      mimeType: 'text/plain',
      extension: 'txt',
      byteSize: 12,
      relativePath: `assets/cc/${'c'.repeat(64)}.txt`,
      createdAt: now,
    };
    await addSourceGraph(database, 'shared-one', { status: 'trashed', asset: sharedAsset });
    await addSourceGraph(database, 'shared-two', { asset: sharedAsset });
    const deleteManagedAsset = vi.fn(deleteSuccess);

    expect(await getSourcePurgePreview('shared-one', 'user-a', { database }))
      .toMatchObject({ sharedAsset: true, assetDisposition: 'retain-shared' });
    const result = await purgeSourcePermanently('shared-one', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset,
    });
    expect(result.physicalAssetsRetained).toBe(1);
    expect(deleteManagedAsset).not.toHaveBeenCalled();
    expect(await database.source_assets.get(sharedAsset.id)).toEqual(sharedAsset);
    expect(await database.study_sources.get('shared-one')).toBeUndefined();
    expect(await database.study_sources.get('shared-two')).toBeDefined();
  });

  it('does not let already-purged versions keep a shared asset forever', async () => {
    const database = await createDatabase();
    const sharedAsset: SourceAsset = {
      id: 'recovery-shared-asset',
      userId: 'user-a',
      contentHash: 'e'.repeat(64),
      mimeType: 'text/plain',
      extension: 'txt',
      byteSize: 12,
      relativePath: `assets/ee/${'e'.repeat(64)}.txt`,
      createdAt: now,
    };
    await addSourceGraph(database, 'purged-one', { status: 'purged', asset: sharedAsset });
    await addSourceGraph(database, 'purged-two', { status: 'purged', asset: sharedAsset });
    await database.study_sources.bulkUpdate([
      { key: 'purged-one', changes: { currentVersionId: null } },
      { key: 'purged-two', changes: { currentVersionId: null } },
    ]);
    const deleteManagedAsset = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { deleted: true, alreadyMissing: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { deleted: false, alreadyMissing: true },
      });

    await purgeSourcePermanently('purged-one', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset,
    });
    expect(deleteManagedAsset).toHaveBeenCalledTimes(1);
    expect(await database.study_sources.get('purged-one')).toBeUndefined();
    expect(await database.study_sources.get('purged-two')).toMatchObject({ status: 'purged' });
    expect(await database.source_assets.get(sharedAsset.id)).toEqual(sharedAsset);

    await purgeSourcePermanently('purged-two', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset,
    });
    expect(deleteManagedAsset).toHaveBeenCalledTimes(2);
    expect(await database.source_assets.get(sharedAsset.id)).toBeUndefined();
  });

  it('deletes the last asset reference while preserving exact historical grounding', async () => {
    const database = await createDatabase();
    const graph = await addSourceGraph(database, 'grounded-source', { status: 'trashed' });
    await database.ai_conversations.add({
      id: 'conversation-a',
      userId: 'user-a',
      role: 'assistant',
      mode: 'tutor',
      content: 'answer',
      timestamp: now,
    });
    const grounding: AIGroundingRecord = {
      id: 'grounding-a',
      userId: 'user-a',
      requestId: 'request-a',
      conversationId: 'conversation-a',
      assistantMessageId: 'message-a',
      evidenceLabel: 'S1',
      evidenceType: 'source_segment',
      sourceId: 'grounded-source',
      sourceVersionId: graph.versionId,
      segmentId: graph.segmentId,
      noteId: null,
      displayTitle: 'Grounded source',
      locatorSnapshot: 'line 1',
      excerptSnapshot: 'exact historical excerpt عربي',
      excerptHash: 'd'.repeat(64),
      sentOrder: 1,
      createdAt: now,
    };
    await database.ai_grounding_records.add(grounding);
    const deleteManagedAsset = vi.fn(deleteSuccess);

    await purgeSourcePermanently('grounded-source', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset,
    });
    expect(deleteManagedAsset).toHaveBeenCalledWith(expect.objectContaining({
      relativePath: graph.asset?.relativePath,
      expectedContentHash: graph.asset?.contentHash,
      expectedByteSize: graph.asset?.byteSize,
    }));
    expect(await database.study_sources.get('grounded-source')).toBeUndefined();
    expect(await database.source_versions.where('sourceId').equals('grounded-source').count()).toBe(0);
    expect(await database.source_segments.where('sourceId').equals('grounded-source').count()).toBe(0);
    expect(await database.source_associations.where('sourceId').equals('grounded-source').count()).toBe(0);
    expect(await database.source_jobs.where('sourceId').equals('grounded-source').count()).toBe(0);
    expect(await database.source_assets.get(graph.asset!.id)).toBeUndefined();
    expect(await database.ai_grounding_records.get('grounding-a')).toEqual(grounding);
    expect((await database.ai_grounding_records.get('grounding-a'))?.excerptSnapshot)
      .toBe('exact historical excerpt عربي');
    await expect(resolveGroundingSourceNavigation('grounding-a', 'user-a', database))
      .resolves.toEqual({ available: false, label: 'Source deleted', sourceId: 'grounded-source' });
  });

  it('rolls back metadata cleanup and recovers interrupted or failed physical deletion', async () => {
    const database = await createDatabase();
    await addSourceGraph(database, 'recover-source', { status: 'trashed' });
    const physicalFailure = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'MANAGED_ASSET_DELETE_FAILED', message: 'safe failure' },
    });
    await expect(purgeSourcePermanently('recover-source', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset: physicalFailure,
    })).rejects.toMatchObject({ code: 'PURGE_RECOVERY_REQUIRED' });
    expect(await database.study_sources.get('recover-source')).toMatchObject({ status: 'purged' });
    expect(await database.source_versions.where('sourceId').equals('recover-source').count()).toBe(1);

    const rollbackFailure = new Error('injected rollback');
    await expect(purgeSourcePermanently('recover-source', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset: async () => ({
        ok: true,
        value: { deleted: false, alreadyMissing: true },
      }),
      beforeFinalCommit: () => { throw rollbackFailure; },
    })).rejects.toThrow('injected rollback');
    expect(await database.study_sources.get('recover-source')).toMatchObject({ status: 'purged' });
    expect(await database.source_versions.where('sourceId').equals('recover-source').count()).toBe(1);

    await expect(recoverInterruptedSourcePurges('user-a', {
      database,
      deleteManagedAsset: async () => ({
        ok: true,
        value: { deleted: false, alreadyMissing: true },
      }),
    })).resolves.toEqual([{ sourceId: 'recover-source', recovered: true }]);
    expect(await database.study_sources.get('recover-source')).toBeUndefined();
    await expect(purgeSourcePermanently('recover-source', 'user-a', {
      database,
      confirmed: true,
      deleteManagedAsset: deleteSuccess,
    })).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND' });
  });

  it('filters all supported source types by lifecycle state and persists state across reopen', async () => {
    const database = await createDatabase();
    await addSourceGraph(database, 'txt-source', { sourceType: 'txt' });
    await addSourceGraph(database, 'markdown-source', { sourceType: 'markdown', status: 'archived' });
    await addSourceGraph(database, 'paste-source', { sourceType: 'pasted-text', status: 'trashed', asset: null });
    await addSourceGraph(database, 'pdf-source', { sourceType: 'pdf' });

    expect((await getSourceLibraryEntries('user-a', undefined, 'active', database))
      .map((entry) => entry.source.sourceType).sort()).toEqual(['pdf', 'txt']);
    expect((await getSourceLibraryEntries('user-a', undefined, 'archived', database))
      .map((entry) => entry.source.sourceType)).toEqual(['markdown']);
    expect((await getSourceLibraryEntries('user-a', undefined, 'trashed', database))
      .map((entry) => entry.source.sourceType)).toEqual(['pasted-text']);

    await archiveSource('txt-source', 'user-a', { database });
    database.close();
    await database.open();
    expect((await database.study_sources.get('txt-source'))?.status).toBe('archived');
  });

  it('keeps Backup V2 fixed at schema 3 with no source-domain tables', () => {
    expect(BACKUP_V2_DATABASE_SCHEMA_VERSION).toBe(3);
    expect(PERSISTENCE_TABLES).not.toEqual(expect.arrayContaining([
      'study_sources',
      'source_assets',
      'source_versions',
      'source_segments',
      'source_associations',
      'source_chunks',
      'source_jobs',
      'ai_grounding_records',
    ]));
  });
});
