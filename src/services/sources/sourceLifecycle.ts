import { db, type AetherDatabase } from '../../db/database';
import { desktopBridge } from '../../desktop/desktopBridge';
import type {
  SourceAsset,
  SourceStatus,
  StudySource,
} from '../../types';
import type {
  DeleteManagedAssetRequest,
  DeleteManagedAssetResult,
} from '../../../electron/types/source-storage';

export type SourceLifecycleErrorCode =
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_USER_MISMATCH'
  | 'ILLEGAL_TRANSITION'
  | 'PURGE_CONFIRMATION_REQUIRED'
  | 'PURGE_RECOVERY_REQUIRED';

const SAFE_MESSAGES: Record<SourceLifecycleErrorCode, string> = {
  SOURCE_NOT_FOUND: 'The source no longer exists.',
  SOURCE_USER_MISMATCH: 'The source belongs to another user.',
  ILLEGAL_TRANSITION: 'That source lifecycle action is not allowed.',
  PURGE_CONFIRMATION_REQUIRED: 'Permanent deletion requires explicit confirmation.',
  PURGE_RECOVERY_REQUIRED: 'Permanent deletion could not finish safely and will be retried.',
};

export class SourceLifecycleError extends Error {
  constructor(public readonly code: SourceLifecycleErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'SourceLifecycleError';
  }
}

export interface SourcePurgePreview {
  sourceId: string;
  displayTitle: string;
  sourceType: StudySource['sourceType'];
  versionCount: number;
  segmentCount: number;
  managedAssetCount: number;
  sharedAsset: boolean;
  willDeletePhysicalAsset: boolean;
  willRetainPhysicalAsset: boolean;
  assetDisposition: 'no-managed-asset' | 'delete' | 'retain-shared' | 'mixed';
}

export interface SourcePurgeResult {
  sourceId: string;
  physicalAssetsDeleted: number;
  physicalAssetsAlreadyMissing: number;
  physicalAssetsRetained: number;
}

interface AssetPlan {
  asset: SourceAsset;
  otherReferenceCount: number;
}

interface LifecycleOptions {
  database?: AetherDatabase;
  now?: () => number;
}

interface PurgeOptions extends LifecycleOptions {
  confirmed: boolean;
  deleteManagedAsset?: (request: DeleteManagedAssetRequest) => Promise<DeleteManagedAssetResult>;
  beforeFinalCommit?: () => void | Promise<void>;
}

async function requireOwnedSource(
  sourceId: string,
  userId: string,
  database: AetherDatabase,
): Promise<StudySource> {
  const source = await database.study_sources.get(sourceId);
  if (!source) throw new SourceLifecycleError('SOURCE_NOT_FOUND');
  if (source.userId !== userId) throw new SourceLifecycleError('SOURCE_USER_MISMATCH');
  return source;
}

async function setLifecycleStatus(
  sourceId: string,
  userId: string,
  allowed: SourceStatus[],
  target: SourceStatus,
  updates: Partial<StudySource>,
  options: LifecycleOptions = {},
): Promise<StudySource> {
  const database = options.database ?? db;
  const source = await requireOwnedSource(sourceId, userId, database);
  if (source.status === target) return source;
  if (!allowed.includes(source.status)) throw new SourceLifecycleError('ILLEGAL_TRANSITION');
  const next = {
    ...updates,
    status: target,
    updatedAt: (options.now ?? Date.now)(),
  };
  await database.study_sources.update(source.id, next);
  return { ...source, ...next };
}

export function archiveSource(
  sourceId: string,
  userId: string,
  options: LifecycleOptions = {},
): Promise<StudySource> {
  const now = (options.now ?? Date.now)();
  return setLifecycleStatus(sourceId, userId, ['active'], 'archived', {
    archivedAt: now,
    trashedAt: null,
    purgedAt: null,
  }, { ...options, now: () => now });
}

export function unarchiveSource(
  sourceId: string,
  userId: string,
  options: LifecycleOptions = {},
): Promise<StudySource> {
  return setLifecycleStatus(sourceId, userId, ['archived'], 'active', {
    archivedAt: null,
    trashedAt: null,
    purgedAt: null,
  }, options);
}

export async function moveSourceToTrash(
  sourceId: string,
  userId: string,
  options: LifecycleOptions = {},
): Promise<StudySource> {
  const database = options.database ?? db;
  const source = await requireOwnedSource(sourceId, userId, database);
  if (source.status === 'trashed') return source;
  if (source.status !== 'active' && source.status !== 'archived') {
    throw new SourceLifecycleError('ILLEGAL_TRANSITION');
  }
  const now = (options.now ?? Date.now)();
  const updates: Partial<StudySource> = {
    status: 'trashed',
    updatedAt: now,
    trashedAt: now,
    purgedAt: null,
    archivedAt: source.status === 'archived'
      ? source.archivedAt ?? now
      : null,
  };
  await database.study_sources.update(source.id, updates);
  return { ...source, ...updates };
}

export async function restoreSourceFromTrash(
  sourceId: string,
  userId: string,
  options: LifecycleOptions = {},
): Promise<StudySource> {
  const database = options.database ?? db;
  const source = await requireOwnedSource(sourceId, userId, database);
  if (source.status === 'active' || source.status === 'archived') return source;
  if (source.status !== 'trashed') throw new SourceLifecycleError('ILLEGAL_TRANSITION');
  const restoredStatus = source.archivedAt === null ? 'active' : 'archived';
  const updates: Partial<StudySource> = {
    status: restoredStatus,
    updatedAt: (options.now ?? Date.now)(),
    archivedAt: restoredStatus === 'archived' ? source.archivedAt : null,
    trashedAt: null,
    purgedAt: null,
  };
  await database.study_sources.update(source.id, updates);
  return { ...source, ...updates };
}

async function createAssetPlan(
  source: StudySource,
  database: AetherDatabase,
): Promise<{ versionIds: string[]; assets: AssetPlan[] }> {
  const versions = await database.source_versions.where('sourceId').equals(source.id).toArray();
  const assetIds = [...new Set(
    versions.map((version) => version.assetId).filter((id): id is string => Boolean(id)),
  )];
  const assets: AssetPlan[] = [];
  for (const assetId of assetIds) {
    const asset = await database.source_assets.get(assetId);
    if (!asset || asset.userId !== source.userId) continue;
    const references = await database.source_versions.where('assetId').equals(assetId).toArray();
    const otherReferences = references.filter((version) => version.sourceId !== source.id);
    const otherSources = await database.study_sources.bulkGet(
      [...new Set(otherReferences.map((version) => version.sourceId))],
    );
    const purgedSourceIds = new Set(
      otherSources
        .filter((otherSource) => otherSource?.status === 'purged')
        .map((otherSource) => otherSource!.id),
    );
    assets.push({
      asset,
      otherReferenceCount: otherReferences.filter(
        (version) => !purgedSourceIds.has(version.sourceId),
      ).length,
    });
  }
  return { versionIds: versions.map((version) => version.id), assets };
}

export async function getSourcePurgePreview(
  sourceId: string,
  userId: string,
  options: LifecycleOptions = {},
): Promise<SourcePurgePreview> {
  const database = options.database ?? db;
  const source = await requireOwnedSource(sourceId, userId, database);
  if (source.status !== 'trashed') throw new SourceLifecycleError('ILLEGAL_TRANSITION');
  const { versionIds, assets } = await createAssetPlan(source, database);
  const segmentCount = await database.source_segments.where('sourceId').equals(source.id).count();
  const sharedCount = assets.filter((item) => item.otherReferenceCount > 0).length;
  const deleteCount = assets.length - sharedCount;
  const assetDisposition = assets.length === 0
    ? 'no-managed-asset'
    : sharedCount === assets.length
      ? 'retain-shared'
      : deleteCount === assets.length
        ? 'delete'
        : 'mixed';
  return {
    sourceId,
    displayTitle: source.displayName,
    sourceType: source.sourceType,
    versionCount: versionIds.length,
    segmentCount,
    managedAssetCount: assets.length,
    sharedAsset: sharedCount > 0,
    willDeletePhysicalAsset: deleteCount > 0,
    willRetainPhysicalAsset: sharedCount > 0,
    assetDisposition,
  };
}

function deletionRequest(asset: SourceAsset): DeleteManagedAssetRequest {
  return {
    relativePath: asset.relativePath,
    expectedContentHash: asset.contentHash,
    expectedMimeType: asset.mimeType,
    expectedExtension: asset.extension,
    expectedByteSize: asset.byteSize,
  };
}

export async function purgeSourcePermanently(
  sourceId: string,
  userId: string,
  options: PurgeOptions,
): Promise<SourcePurgeResult> {
  if (!options.confirmed) throw new SourceLifecycleError('PURGE_CONFIRMATION_REQUIRED');
  const database = options.database ?? db;
  let source = await requireOwnedSource(sourceId, userId, database);
  if (source.status !== 'trashed' && source.status !== 'purged') {
    throw new SourceLifecycleError('ILLEGAL_TRANSITION');
  }

  if (source.status === 'trashed') {
    const now = (options.now ?? Date.now)();
    await database.transaction('rw', database.study_sources, async () => {
      const current = await requireOwnedSource(sourceId, userId, database);
      if (current.status !== 'trashed') throw new SourceLifecycleError('ILLEGAL_TRANSITION');
      await database.study_sources.update(sourceId, {
        status: 'purged',
        currentVersionId: null,
        updatedAt: now,
        purgedAt: now,
      });
    });
    source = { ...source, status: 'purged', currentVersionId: null, purgedAt: now };
  }

  const { assets } = await createAssetPlan(source, database);
  const deleteManagedAsset = options.deleteManagedAsset
    ?? ((request) => desktopBridge.deleteManagedSourceAsset(request));
  let physicalAssetsDeleted = 0;
  let physicalAssetsAlreadyMissing = 0;
  let physicalAssetsRetained = 0;
  for (const plan of assets) {
    if (plan.otherReferenceCount > 0) {
      physicalAssetsRetained += 1;
      continue;
    }
    const result = await deleteManagedAsset(deletionRequest(plan.asset));
    if (!result.ok) throw new SourceLifecycleError('PURGE_RECOVERY_REQUIRED');
    if (result.value.deleted) physicalAssetsDeleted += 1;
    if (result.value.alreadyMissing) physicalAssetsAlreadyMissing += 1;
  }

  await database.transaction(
    'rw',
    [
      database.study_sources,
      database.source_assets,
      database.source_versions,
      database.source_segments,
      database.source_chunks,
      database.source_associations,
      database.source_jobs,
    ],
    async () => {
      const current = await requireOwnedSource(sourceId, userId, database);
      if (current.status !== 'purged') throw new SourceLifecycleError('ILLEGAL_TRANSITION');
      const versions = await database.source_versions.where('sourceId').equals(sourceId).toArray();
      const versionIds = versions.map((version) => version.id);
      const assetIds = [...new Set(
        versions.map((version) => version.assetId).filter((id): id is string => Boolean(id)),
      )];
      if (versionIds.length > 0) {
        await database.source_chunks.where('sourceVersionId').anyOf(versionIds).delete();
      }
      await database.source_segments.where('sourceId').equals(sourceId).delete();
      await database.source_associations.where('sourceId').equals(sourceId).delete();
      await database.source_jobs.where('sourceId').equals(sourceId).delete();
      await database.source_versions.where('sourceId').equals(sourceId).delete();
      for (const assetId of assetIds) {
        if (await database.source_versions.where('assetId').equals(assetId).count() === 0) {
          await database.source_assets.delete(assetId);
        }
      }
      await database.study_sources.delete(sourceId);
      await options.beforeFinalCommit?.();
    },
  );

  return {
    sourceId,
    physicalAssetsDeleted,
    physicalAssetsAlreadyMissing,
    physicalAssetsRetained,
  };
}

export async function recoverInterruptedSourcePurges(
  userId: string,
  options: Omit<PurgeOptions, 'confirmed'> = {},
): Promise<Array<{ sourceId: string; recovered: boolean }>> {
  const database = options.database ?? db;
  const pending = await database.study_sources
    .where('[userId+status]')
    .equals([userId, 'purged'])
    .toArray();
  const results: Array<{ sourceId: string; recovered: boolean }> = [];
  for (const source of pending) {
    try {
      await purgeSourcePermanently(source.id, userId, { ...options, confirmed: true });
      results.push({ sourceId: source.id, recovered: true });
    } catch {
      results.push({ sourceId: source.id, recovered: false });
    }
  }
  return results;
}
