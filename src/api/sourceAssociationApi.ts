import { db } from '../db/database';
import { SourceAssociation, SourceAssociationTargetType, SourceAssociationType } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

async function getAssociationTargetOwner(
  targetType: SourceAssociationTargetType,
  targetId: string,
): Promise<string | undefined> {
  if (targetType === 'subject') {
    const subject = await db.subjects.get(targetId);
    return subject ? subject.userId ?? 'default_user' : undefined;
  }
  if (targetType === 'topic') {
    const topic = await db.topics.get(targetId);
    if (!topic) return undefined;
    const subject = await db.subjects.get(topic.subjectId);
    return subject ? subject.userId ?? 'default_user' : undefined;
  }
  const target = targetType === 'task'
    ? await db.tasks.get(targetId)
    : await db.notes.get(targetId);
  if (!target) return undefined;
  if (target.userId) return target.userId;
  if (target.subjectId) {
    const subject = await db.subjects.get(target.subjectId);
    return subject ? subject.userId ?? 'default_user' : undefined;
  }
  return 'default_user';
}

export async function addSourceAssociation(assoc: SourceAssociation): Promise<void> {
  try {
    // Verify source exists and belongs to same user
    const source = await db.study_sources.get(assoc.sourceId);
    if (!source) throw new Error('Source does not exist');
    if (source.userId !== assoc.userId) throw new Error('Source user mismatch');

    const targetOwner = await getAssociationTargetOwner(assoc.targetType, assoc.targetId);
    if (!targetOwner) throw new Error(`${assoc.targetType} does not exist`);
    if (targetOwner !== assoc.userId) throw new Error('Target user mismatch');

    // Verify uniqueness
    const existing = await db.source_associations
      .where('[sourceId+targetType+targetId]')
      .equals([assoc.sourceId, assoc.targetType, assoc.targetId])
      .first();
    if (existing) throw new Error('Association already exists');

    await db.source_associations.add(assoc);
  } catch (err) {
    logger.error('Failed to add source association', err);
    throw new StorageError('addSourceAssociation', err);
  }
}

export async function getSourceAssociationsBySource(sourceId: string): Promise<SourceAssociation[]> {
  try {
    return await db.source_associations.where('sourceId').equals(sourceId).toArray();
  } catch (err) {
    logger.error('Failed to fetch source associations by source', err);
    throw new StorageError('getSourceAssociationsBySource', err);
  }
}

export async function getSourceAssociationsForUser(
  sourceId: string,
  userId: string,
): Promise<SourceAssociation[]> {
  try {
    const source = await db.study_sources.get(sourceId);
    if (!source) throw new NotFoundError('StudySource', sourceId);
    if (source.userId !== userId) throw new Error('Source user mismatch');
    return (await db.source_associations.where('sourceId').equals(sourceId).toArray())
      .filter((association) => association.userId === userId);
  } catch (err) {
    logger.error('Failed to fetch source associations for user', err);
    throw err instanceof NotFoundError
      ? err
      : new StorageError('getSourceAssociationsForUser', err);
  }
}

export async function getSourceAssociationsByTarget(targetType: SourceAssociationTargetType, targetId: string): Promise<SourceAssociation[]> {
  try {
    return await db.source_associations
      .where('[targetType+targetId]')
      .equals([targetType, targetId])
      .toArray();
  } catch (err) {
    logger.error('Failed to fetch source associations by target', err);
    throw new StorageError('getSourceAssociationsByTarget', err);
  }
}

export async function getSourceAssociationsByUser(userId: string): Promise<SourceAssociation[]> {
  try {
    return await db.source_associations.where('userId').equals(userId).toArray();
  } catch (err) {
    logger.error('Failed to fetch source associations by user', err);
    throw new StorageError('getSourceAssociationsByUser', err);
  }
}

export async function deleteSourceAssociation(sourceId: string, targetType: SourceAssociationTargetType, targetId: string): Promise<void> {
  try {
    const deleted = await db.source_associations
      .where('[sourceId+targetType+targetId]')
      .equals([sourceId, targetType, targetId])
      .delete();
    if (deleted === 0) throw new NotFoundError('SourceAssociation', `${sourceId}-${targetType}-${targetId}`);
  } catch (err) {
    logger.error('Failed to delete source association', err);
    throw err instanceof NotFoundError ? err : new StorageError('deleteSourceAssociation', err);
  }
}

export async function deleteSourceAssociationForUser(
  sourceId: string,
  userId: string,
  targetType: SourceAssociationTargetType,
  targetId: string,
): Promise<void> {
  try {
    const source = await db.study_sources.get(sourceId);
    if (!source) throw new NotFoundError('StudySource', sourceId);
    if (source.userId !== userId) throw new Error('Source user mismatch');
    const association = await db.source_associations
      .where('[sourceId+targetType+targetId]')
      .equals([sourceId, targetType, targetId])
      .first();
    if (!association) {
      throw new NotFoundError('SourceAssociation', `${sourceId}-${targetType}-${targetId}`);
    }
    if (association.userId !== userId) throw new Error('Association user mismatch');
    await db.source_associations.delete(association.id);
  } catch (err) {
    logger.error('Failed to delete source association for user', err);
    throw err instanceof NotFoundError
      ? err
      : new StorageError('deleteSourceAssociationForUser', err);
  }
}

export async function updateSourceAssociationType(
  sourceId: string,
  userId: string,
  targetType: SourceAssociationTargetType,
  targetId: string,
  associationType: SourceAssociationType,
): Promise<void> {
  try {
    const source = await db.study_sources.get(sourceId);
    if (!source) throw new NotFoundError('StudySource', sourceId);
    if (source.userId !== userId) throw new Error('Source user mismatch');
    const association = await db.source_associations
      .where('[sourceId+targetType+targetId]')
      .equals([sourceId, targetType, targetId])
      .first();
    if (!association) {
      throw new NotFoundError('SourceAssociation', `${sourceId}-${targetType}-${targetId}`);
    }
    if (association.userId !== userId) throw new Error('Association user mismatch');
    await db.source_associations.update(association.id, { associationType });
  } catch (err) {
    logger.error('Failed to update source association type', err);
    throw err instanceof NotFoundError
      ? err
      : new StorageError('updateSourceAssociationType', err);
  }
}

export async function deleteSourceAssociationsBySource(sourceId: string): Promise<void> {
  try {
    await db.source_associations.where('sourceId').equals(sourceId).delete();
  } catch (err) {
    logger.error('Failed to delete source associations by source', err);
    throw new StorageError('deleteSourceAssociationsBySource', err);
  }
}

export async function countSourceAssociationsBySource(sourceId: string): Promise<number> {
  try {
    return await db.source_associations.where('sourceId').equals(sourceId).count();
  } catch (err) {
    logger.error('Failed to count source associations by source', err);
    throw new StorageError('countSourceAssociationsBySource', err);
  }
}
