import { db } from '../db/database';
import { SourceVersion } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function addSourceVersion(version: SourceVersion): Promise<void> {
  try {
    if (!await db.users.get(version.userId)) throw new Error('Version user does not exist');
    // Verify source exists and belongs to same user
    const source = await db.study_sources.get(version.sourceId);
    if (!source) throw new Error('Source does not exist');
    if (source.userId !== version.userId) throw new Error('Source user mismatch');

    // Verify asset exists if provided
    if (version.assetId) {
      const asset = await db.source_assets.get(version.assetId);
      if (!asset) throw new Error('Asset does not exist');
      if (asset.userId !== version.userId) throw new Error('Asset user mismatch');
    }

    // Verify version number is unique for this source
    const existing = await db.source_versions
      .where('[sourceId+versionNumber]')
      .equals([version.sourceId, version.versionNumber])
      .first();
    if (existing) throw new Error(`Version ${version.versionNumber} already exists for this source`);
    if (!Number.isSafeInteger(version.versionNumber) || version.versionNumber < 1) {
      throw new Error('versionNumber must be a positive safe integer');
    }

    // Verify processorFingerprint is provided
    if (!version.processorFingerprint) {
      throw new Error('processorFingerprint is required');
    }

    await db.source_versions.add(version);
  } catch (err) {
    logger.error('Failed to add source version', err);
    throw new StorageError('addSourceVersion', err);
  }
}

export async function getSourceVersionById(id: string): Promise<SourceVersion | undefined> {
  try {
    return await db.source_versions.get(id);
  } catch (err) {
    logger.error('Failed to fetch source version by id', err);
    throw new StorageError('getSourceVersionById', err);
  }
}

export async function getSourceVersionsBySource(sourceId: string): Promise<SourceVersion[]> {
  try {
    return await db.source_versions.where('sourceId').equals(sourceId).sortBy('versionNumber');
  } catch (err) {
    logger.error('Failed to fetch source versions by source', err);
    throw new StorageError('getSourceVersionsBySource', err);
  }
}

export async function getCurrentSourceVersion(sourceId: string): Promise<SourceVersion | undefined> {
  try {
    const source = await db.study_sources.get(sourceId);
    if (!source || !source.currentVersionId) return undefined;
    return await db.source_versions.get(source.currentVersionId);
  } catch (err) {
    logger.error('Failed to fetch current source version', err);
    throw new StorageError('getCurrentSourceVersion', err);
  }
}

export async function updateSourceVersion(id: string, updates: Partial<SourceVersion>): Promise<void> {
  try {
    const current = await db.source_versions.get(id);
    if (!current) throw new NotFoundError('SourceVersion', id);

    if (['ready', 'partially_ready', 'failed'].includes(current.status)) {
      throw new Error('Terminal source versions are immutable; create a new version to reprocess');
    }

    const allowedUpdates: (keyof SourceVersion)[] = [
      'assetId', 'status', 'segmentCount', 'charCount', 'pageCount', 'lineCount',
      'errorCode', 'errorMessage', 'readyAt'
    ];

    const filteredUpdates: Partial<SourceVersion> = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        (filteredUpdates as Record<string, unknown>)[key] = updates[key]!;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) return;

    if (updates.assetId !== undefined && updates.assetId !== null) {
      const asset = await db.source_assets.get(updates.assetId);
      if (!asset || asset.userId !== current.userId) {
        throw new Error('Asset must exist and belong to the version user');
      }
    }

    // When transitioning to ready/partially_ready, set readyAt if not set
    if ((updates.status === 'ready' || updates.status === 'partially_ready') && !current.readyAt) {
      filteredUpdates.readyAt = Date.now();
    }

    await db.source_versions.update(id, filteredUpdates);
  } catch (err) {
    logger.error('Failed to update source version', err);
    throw err instanceof NotFoundError ? err : new StorageError('updateSourceVersion', err);
  }
}

export async function deleteSourceVersion(versionId: string): Promise<void> {
  try {
    const version = await db.source_versions.get(versionId);
    if (!version) throw new NotFoundError('SourceVersion', versionId);
    const source = await db.study_sources.get(version.sourceId);
    if (source?.currentVersionId === versionId) {
      throw new Error('The current source version cannot be deleted');
    }
    const jobs = await db.source_jobs.where('versionId').equals(versionId).count();
    if (jobs > 0) throw new Error('Source version cannot be deleted while jobs reference it');

    await db.transaction(
      'rw',
      db.source_versions,
      db.source_segments,
      db.source_chunks,
      async () => {
        await db.source_chunks.where('sourceVersionId').equals(versionId).delete();
        await db.source_segments.where('sourceVersionId').equals(versionId).delete();
        await db.source_versions.delete(versionId);
      },
    );
  } catch (err) {
    logger.error('Failed to delete source version', err);
    throw err instanceof NotFoundError ? err : new StorageError('deleteSourceVersion', err);
  }
}
