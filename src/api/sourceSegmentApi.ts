import { db } from '../db/database';
import { SourceSegment } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function addSourceSegment(segment: SourceSegment): Promise<void> {
  try {
    const version = await db.source_versions.get(segment.sourceVersionId);
    if (!version) throw new Error('Source version does not exist');
    if (version.userId !== segment.userId) throw new Error('Source version user mismatch');
    if (version.sourceId !== segment.sourceId) throw new Error('Segment source does not match its version');
    if (['ready', 'partially_ready', 'failed'].includes(version.status)) {
      throw new Error('Cannot add evidence to a terminal source version');
    }

    const source = await db.study_sources.get(segment.sourceId);
    if (!source) throw new Error('Source does not exist');
    if (source.userId !== segment.userId) throw new Error('Source user mismatch');

    const existing = await db.source_segments
      .where('[sourceVersionId+ordinal]')
      .equals([segment.sourceVersionId, segment.ordinal])
      .first();
    if (existing) throw new Error(`Segment ordinal ${segment.ordinal} already exists for this version`);
    if (!Number.isSafeInteger(segment.ordinal) || segment.ordinal < 1) {
      throw new Error('Segment ordinal must be a positive safe integer');
    }

    if (!segment.text || segment.text.length === 0) {
      throw new Error('Segment text cannot be empty');
    }
    if (!/^[a-f0-9]{64}$/.test(segment.textHash)) {
      throw new Error('textHash must be 64-character lowercase hex SHA-256');
    }

    await db.source_segments.add(segment);
  } catch (err) {
    logger.error('Failed to add source segment', err);
    throw new StorageError('addSourceSegment', err);
  }
}

export async function getSourceSegmentsByVersion(sourceVersionId: string): Promise<SourceSegment[]> {
  try {
    return await db.source_segments
      .where('sourceVersionId')
      .equals(sourceVersionId)
      .sortBy('ordinal');
  } catch (err) {
    logger.error('Failed to fetch source segments by version', err);
    throw new StorageError('getSourceSegmentsByVersion', err);
  }
}

export async function getSourceSegmentsBySource(sourceId: string): Promise<SourceSegment[]> {
  try {
    return await db.source_segments.where('sourceId').equals(sourceId).toArray();
  } catch (err) {
    logger.error('Failed to fetch source segments by source', err);
    throw new StorageError('getSourceSegmentsBySource', err);
  }
}

export async function getSourceSegmentById(id: string): Promise<SourceSegment | undefined> {
  try {
    return await db.source_segments.get(id);
  } catch (err) {
    logger.error('Failed to fetch source segment by id', err);
    throw new StorageError('getSourceSegmentById', err);
  }
}

export async function updateSourceSegment(id: string, updates: Partial<SourceSegment>): Promise<void> {
  try {
    const current = await db.source_segments.get(id);
    if (!current) throw new NotFoundError('SourceSegment', id);
    const version = await db.source_versions.get(current.sourceVersionId);
    if (!version || ['ready', 'partially_ready', 'failed'].includes(version.status)) {
      throw new Error('Segments belonging to terminal or missing versions are immutable');
    }

    // Only allow certain fields to be updated
    const allowedUpdates: (keyof SourceSegment)[] = [
      'heading',
      'physicalPage',
      'printedPageLabel',
      'lineStart',
      'lineEnd',
      'timeStartMs',
      'timeEndMs',
      'boundingBox',
      'confidence'
    ];
    const filtered: Partial<SourceSegment> = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        (filtered as Record<string, unknown>)[key] = updates[key]!;
      }
    }

    if (Object.keys(filtered).length > 0) {
      await db.source_segments.update(id, filtered);
    }
  } catch (err) {
    logger.error('Failed to update source segment', err);
    throw err instanceof NotFoundError ? err : new StorageError('updateSourceSegment', err);
  }
}

export async function deleteSourceSegmentsByVersion(sourceVersionId: string): Promise<void> {
  try {
    const version = await db.source_versions.get(sourceVersionId);
    if (version && ['ready', 'partially_ready', 'failed'].includes(version.status)) {
      throw new Error('Durable evidence for a terminal source version cannot be deleted directly');
    }
    await db.transaction('rw', db.source_segments, db.source_chunks, async () => {
      await db.source_chunks.where('sourceVersionId').equals(sourceVersionId).delete();
      await db.source_segments.where('sourceVersionId').equals(sourceVersionId).delete();
    });
  } catch (err) {
    logger.error('Failed to delete source segments by version', err);
    throw new StorageError('deleteSourceSegmentsByVersion', err);
  }
}
