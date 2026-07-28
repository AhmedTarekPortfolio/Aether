import { db } from '../db/database';
import { SourceChunk } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function addSourceChunk(chunk: SourceChunk): Promise<void> {
  try {
    const version = await db.source_versions.get(chunk.sourceVersionId);
    if (!version) throw new Error('Source version does not exist');
    if (version.userId !== chunk.userId) throw new Error('Source version user mismatch');

    const segment = await db.source_segments.get(chunk.segmentId);
    if (!segment) throw new Error('Source segment does not exist');
    if (segment.userId !== chunk.userId) throw new Error('Source segment user mismatch');
    if (segment.sourceVersionId !== chunk.sourceVersionId) {
      throw new Error('Chunk segment does not belong to the selected source version');
    }

    const existing = await db.source_chunks
      .where('[segmentId+chunkerFingerprint+ordinal]')
      .equals([chunk.segmentId, chunk.chunkerFingerprint, chunk.ordinal])
      .first();
    if (existing) throw new Error(`Chunk ordinal ${chunk.ordinal} already exists for this segment and chunker`);

    if (!chunk.text || chunk.text.length === 0) {
      throw new Error('Chunk text cannot be empty');
    }
    if (!Number.isSafeInteger(chunk.ordinal) || chunk.ordinal < 0) {
      throw new Error('Chunk ordinal must be a non-negative safe integer');
    }
    if (
      !Number.isSafeInteger(chunk.charStart)
      || !Number.isSafeInteger(chunk.charEnd)
      || chunk.charStart < 0
      || chunk.charEnd <= chunk.charStart
    ) {
      throw new Error('Chunk character offsets are invalid');
    }

    await db.source_chunks.add(chunk);
  } catch (err) {
    logger.error('Failed to add source chunk', err);
    throw new StorageError('addSourceChunk', err);
  }
}

export async function addSourceChunks(chunks: SourceChunk[]): Promise<void> {
  try {
    if (chunks.length === 0) return;

    await db.transaction(
      'rw',
      db.source_chunks,
      db.source_versions,
      db.source_segments,
      async () => {
        for (const chunk of chunks) await addSourceChunk(chunk);
      },
    );
  } catch (err) {
    logger.error('Failed to bulk add source chunks', err);
    throw new StorageError('addSourceChunks', err);
  }
}

export async function getSourceChunksByVersion(sourceVersionId: string): Promise<SourceChunk[]> {
  try {
    return await db.source_chunks.where('sourceVersionId').equals(sourceVersionId).sortBy('ordinal');
  } catch (err) {
    logger.error('Failed to fetch source chunks by version', err);
    throw new StorageError('getSourceChunksByVersion', err);
  }
}

export async function getSourceChunksBySegment(segmentId: string): Promise<SourceChunk[]> {
  try {
    return await db.source_chunks.where('segmentId').equals(segmentId).sortBy('ordinal');
  } catch (err) {
    logger.error('Failed to fetch source chunks by segment', err);
    throw new StorageError('getSourceChunksBySegment', err);
  }
}

export async function deleteSourceChunksByVersion(sourceVersionId: string): Promise<void> {
  try {
    await db.source_chunks.where('sourceVersionId').equals(sourceVersionId).delete();
  } catch (err) {
    logger.error('Failed to delete source chunks by version', err);
    throw new StorageError('deleteSourceChunksByVersion', err);
  }
}

export async function deleteSourceChunksBySegment(segmentId: string): Promise<void> {
  try {
    await db.source_chunks.where('segmentId').equals(segmentId).delete();
  } catch (err) {
    logger.error('Failed to delete source chunks by segment', err);
    throw new StorageError('deleteSourceChunksBySegment', err);
  }
}
