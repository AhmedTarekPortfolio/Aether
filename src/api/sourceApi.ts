import { db } from '../db/database';
import { StudySource, SourceStatus } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function validateSourceName(name: string, userId: string, excludeSourceId?: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Source name cannot be empty');
  const all = await db.study_sources.where('userId').equals(userId).toArray();
  const duplicate = all.find(
    (s) => s.id !== excludeSourceId && s.displayName.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) throw new Error(`A source named '${duplicate.displayName}' already exists.`);
  return true;
}

export async function addStudySource(source: StudySource): Promise<void> {
  try {
    if (!await db.users.get(source.userId)) throw new Error('Source user does not exist');
    await validateSourceName(source.displayName, source.userId);
    if (source.currentVersionId !== null) {
      throw new Error('A new source cannot reference a version before it is created');
    }
    await db.study_sources.add(source);
  } catch (err) {
    logger.error('Failed to add study source', err);
    throw new StorageError('addStudySource', err);
  }
}

export async function getStudySources(userId: string, status?: SourceStatus): Promise<StudySource[]> {
  try {
    let collection = db.study_sources.where('userId').equals(userId);
    if (status) {
      collection = collection.filter((s) => s.status === status);
    }
    return await collection.sortBy('updatedAt');
  } catch (err) {
    logger.error('Failed to fetch study sources', err);
    throw new StorageError('getStudySources', err);
  }
}

export async function getStudySourceById(id: string): Promise<StudySource | undefined> {
  try {
    return await db.study_sources.get(id);
  } catch (err) {
    logger.error('Failed to fetch study source by id', err);
    throw new StorageError('getStudySourceById', err);
  }
}

export async function updateStudySource(id: string, updates: Partial<StudySource>): Promise<void> {
  try {
    const source = await db.study_sources.get(id);
    if (!source) throw new NotFoundError('StudySource', id);
    if (updates.displayName !== undefined) {
      await validateSourceName(updates.displayName, source.userId, id);
    }
    if (updates.currentVersionId !== undefined && updates.currentVersionId !== null) {
      const version = await db.source_versions.get(updates.currentVersionId);
      if (!version || version.sourceId !== id || version.userId !== source.userId) {
        throw new Error('Current version must belong to the same source and user');
      }
    }
    const allowedUpdates: Partial<StudySource> = {};
    if (updates.displayName !== undefined) allowedUpdates.displayName = updates.displayName.trim();
    if (updates.currentVersionId !== undefined) allowedUpdates.currentVersionId = updates.currentVersionId;
    allowedUpdates.updatedAt = Date.now();
    await db.study_sources.update(id, allowedUpdates);
  } catch (err) {
    logger.error('Failed to update study source', err);
    throw err instanceof NotFoundError ? err : new StorageError('updateStudySource', err);
  }
}

export async function updateStudySourceStatus(id: string, status: SourceStatus): Promise<void> {
  try {
    const source = await db.study_sources.get(id);
    if (!source) throw new NotFoundError('StudySource', id);

    const updates: Partial<StudySource> = { status, updatedAt: Date.now() };
    if (status === 'archived') updates.archivedAt = Date.now();
    else if (status === 'trashed') updates.trashedAt = Date.now();
    else if (status === 'purged') updates.purgedAt = Date.now();
    else if (status === 'active') {
      updates.archivedAt = null;
      updates.trashedAt = null;
      updates.purgedAt = null;
    }

    await db.study_sources.update(id, updates);
  } catch (err) {
    logger.error('Failed to update study source status', err);
    throw err instanceof NotFoundError ? err : new StorageError('updateStudySourceStatus', err);
  }
}

export async function deleteStudySource(id: string): Promise<void> {
  try {
    if (!await db.study_sources.get(id)) throw new NotFoundError('StudySource', id);
    const references = await checkSourceReferences(id);
    if (!references.isDeletable) {
      throw new Error(`Source cannot be deleted because it has ${references.totalReferences} strict reference(s)`);
    }
    await db.study_sources.delete(id);
  } catch (err) {
    logger.error('Failed to delete study source', err);
    throw err instanceof NotFoundError ? err : new StorageError('deleteStudySource', err);
  }
}

export async function checkSourceReferences(sourceId: string): Promise<{
  versions: number;
  associations: number;
  jobs: number;
  totalReferences: number;
  isDeletable: boolean;
}> {
  try {
    const [versions, associations, jobs] = await Promise.all([
      db.source_versions.where('sourceId').equals(sourceId).count(),
      db.source_associations.where('sourceId').equals(sourceId).count(),
      db.source_jobs.where('sourceId').equals(sourceId).count(),
    ]);
    const totalReferences = versions + associations + jobs;
    return { versions, associations, jobs, totalReferences, isDeletable: totalReferences === 0 };
  } catch (err) {
    logger.error('Failed to check source references', err);
    throw new StorageError('checkSourceReferences', err);
  }
}
