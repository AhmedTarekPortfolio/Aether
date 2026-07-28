import { db } from '../db/database';
import { SourceJob, SourceJobType, SourceJobStatus } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function addSourceJob(job: SourceJob): Promise<void> {
  try {
    if (!job.userId) throw new Error('userId is required');
    if (!await db.users.get(job.userId)) throw new Error('Job user does not exist');
    if (!job.jobType) throw new Error('jobType is required');
    if (!job.status) throw new Error('status is required');
    if (job.progress !== undefined && (job.progress < 0 || job.progress > 100)) {
      throw new Error('progress must be between 0 and 100');
    }

    // Validate references if provided
    if (job.sourceId) {
      const source = await db.study_sources.get(job.sourceId);
      if (!source) throw new Error('Source does not exist');
      if (source.userId !== job.userId) throw new Error('Source user mismatch');
    }
    if (job.assetId) {
      const asset = await db.source_assets.get(job.assetId);
      if (!asset) throw new Error('Asset does not exist');
      if (asset.userId !== job.userId) throw new Error('Asset user mismatch');
    }
    if (job.versionId) {
      const version = await db.source_versions.get(job.versionId);
      if (!version) throw new Error('Version does not exist');
      if (version.userId !== job.userId) throw new Error('Version user mismatch');
      if (job.sourceId && version.sourceId !== job.sourceId) {
        throw new Error('Version does not belong to the selected source');
      }
      if (job.assetId && version.assetId !== job.assetId) {
        throw new Error('Version does not reference the selected asset');
      }
    }

    await db.source_jobs.add(job);
  } catch (err) {
    logger.error('Failed to add source job', err);
    throw new StorageError('addSourceJob', err);
  }
}

export async function getSourceJobById(id: string): Promise<SourceJob | undefined> {
  try {
    return await db.source_jobs.get(id);
  } catch (err) {
    logger.error('Failed to fetch source job by id', err);
    throw new StorageError('getSourceJobById', err);
  }
}

export async function getSourceJobsByUser(userId: string, status?: SourceJobStatus): Promise<SourceJob[]> {
  try {
    let collection = db.source_jobs.where('userId').equals(userId);
    if (status) {
      collection = collection.filter((j) => j.status === status);
    }
    return await collection.sortBy('createdAt');
  } catch (err) {
    logger.error('Failed to fetch source jobs by user', err);
    throw new StorageError('getSourceJobsByUser', err);
  }
}

export async function getSourceJobsBySource(sourceId: string): Promise<SourceJob[]> {
  try {
    return await db.source_jobs.where('sourceId').equals(sourceId).sortBy('createdAt');
  } catch (err) {
    logger.error('Failed to fetch source jobs by source', err);
    throw new StorageError('getSourceJobsBySource', err);
  }
}

export async function getPendingJobs(): Promise<SourceJob[]> {
  try {
    return await db.source_jobs
      .where('status')
      .equals('pending')
      .sortBy('createdAt');
  } catch (err) {
    logger.error('Failed to fetch pending source jobs', err);
    throw new StorageError('getPendingJobs', err);
  }
}

export async function updateSourceJob(id: string, updates: Partial<SourceJob>): Promise<void> {
  try {
    const job = await db.source_jobs.get(id);
    if (!job) throw new NotFoundError('SourceJob', id);

    // Validate progress if provided
    if (updates.progress !== undefined && (updates.progress < 0 || updates.progress > 100)) {
      throw new Error('progress must be between 0 and 100');
    }

    const allowedUpdates: Partial<SourceJob> = {};
    for (const key of ['status', 'progress', 'result', 'error'] as const) {
      if (updates[key] !== undefined) {
        (allowedUpdates as Record<string, unknown>)[key] = updates[key];
      }
    }

    if (['completed', 'failed', 'cancelled'].includes(updates.status as SourceJobStatus) && !job.completedAt) {
      allowedUpdates.completedAt = Date.now();
    }
    if (updates.status === 'running' && !job.startedAt) {
      allowedUpdates.startedAt = Date.now();
    }

    await db.source_jobs.update(id, allowedUpdates);
  } catch (err) {
    logger.error('Failed to update source job', err);
    throw err instanceof NotFoundError ? err : new StorageError('updateSourceJob', err);
  }
}

export async function deleteSourceJob(id: string): Promise<void> {
  try {
    const job = await db.source_jobs.get(id);
    if (!job) throw new NotFoundError('SourceJob', id);
    await db.source_jobs.delete(id);
  } catch (err) {
    logger.error('Failed to delete source job', err);
    throw err instanceof NotFoundError ? err : new StorageError('deleteSourceJob', err);
  }
}

export async function deleteSourceJobsBySource(sourceId: string): Promise<void> {
  try {
    await db.source_jobs.where('sourceId').equals(sourceId).delete();
  } catch (err) {
    logger.error('Failed to delete source jobs by source', err);
    throw new StorageError('deleteSourceJobsBySource', err);
  }
}

export async function getJobCountsByStatus(userId: string): Promise<Record<SourceJobStatus, number>> {
  try {
    const jobs = await db.source_jobs.where('userId').equals(userId).toArray();
    const counts: Record<SourceJobStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const job of jobs) {
      counts[job.status]++;
    }
    return counts;
  } catch (err) {
    logger.error('Failed to get job counts by status', err);
    throw new StorageError('getJobCountsByStatus', err);
  }
}
