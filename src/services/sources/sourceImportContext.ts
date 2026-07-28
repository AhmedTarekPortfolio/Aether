import type { AetherDatabase } from '../../db/database';
import type {
  SourceAssociation,
  SourceAssociationTargetType,
} from '../../types';
import type { SourceStagingReceipt } from '../../../electron/types/source-storage';
import {
  SourceImportError,
  type SourceImportContext,
} from './sourceImportTypes';

function targetOwner(
  target: { userId?: string; subjectId?: string } | undefined,
  subjectOwner?: string,
): string | undefined {
  if (!target) return undefined;
  return target.userId ?? subjectOwner ?? 'default_user';
}

export async function validateSourceImportContext(
  database: AetherDatabase,
  context: SourceImportContext,
): Promise<void> {
  if (!context.subjectId) throw new SourceImportError('SUBJECT_REQUIRED');
  const user = await database.users.get(context.userId);
  const subject = await database.subjects.get(context.subjectId);
  if (!user || !subject) throw new SourceImportError('SUBJECT_NOT_FOUND');
  const subjectOwner = subject.userId ?? 'default_user';
  if (subjectOwner !== context.userId) {
    throw new SourceImportError('ASSOCIATION_USER_MISMATCH');
  }

  if (context.topicId) {
    const topic = await database.topics.get(context.topicId);
    if (!topic) throw new SourceImportError('ASSOCIATION_NOT_FOUND');
    if (topic.subjectId !== context.subjectId) {
      throw new SourceImportError('TOPIC_SUBJECT_MISMATCH');
    }
  }
  if (context.taskId) {
    const task = await database.tasks.get(context.taskId);
    const taskSubject = task?.subjectId
      ? await database.subjects.get(task.subjectId)
      : undefined;
    if (!task) throw new SourceImportError('ASSOCIATION_NOT_FOUND');
    if (targetOwner(task, taskSubject?.userId ?? 'default_user') !== context.userId) {
      throw new SourceImportError('ASSOCIATION_USER_MISMATCH');
    }
  }
  if (context.noteId) {
    const note = await database.notes.get(context.noteId);
    const noteSubject = note?.subjectId
      ? await database.subjects.get(note.subjectId)
      : undefined;
    if (!note) throw new SourceImportError('ASSOCIATION_NOT_FOUND');
    if (targetOwner(note, noteSubject?.userId ?? 'default_user') !== context.userId) {
      throw new SourceImportError('ASSOCIATION_USER_MISMATCH');
    }
  }
}

function associationTargets(context: SourceImportContext): Array<{
  targetType: SourceAssociationTargetType;
  targetId: string;
}> {
  const targets: Array<{ targetType: SourceAssociationTargetType; targetId: string }> = [
    { targetType: 'subject', targetId: context.subjectId },
  ];
  if (context.topicId) targets.push({ targetType: 'topic', targetId: context.topicId });
  if (context.taskId) targets.push({ targetType: 'task', targetId: context.taskId });
  if (context.noteId) targets.push({ targetType: 'note', targetId: context.noteId });
  return targets;
}

export function createSourceAssociations(
  context: SourceImportContext,
  sourceId: string,
  createdAt: number,
  createId: () => string,
): SourceAssociation[] {
  return associationTargets(context).map(({ targetType, targetId }) => ({
    id: createId(),
    userId: context.userId,
    sourceId,
    targetType,
    targetId,
    associationType: targetType === 'subject'
      ? 'primary'
      : context.associationType ?? 'reference',
    createdAt,
  }));
}

export async function uniqueSourceDisplayTitle(
  database: AetherDatabase,
  userId: string,
  requestedTitle: string,
): Promise<string> {
  const base = requestedTitle.trim().slice(0, 200);
  if (!base) throw new SourceImportError('INVALID_REQUEST');
  const existing = await database.study_sources.where('userId').equals(userId).toArray();
  const names = new Set(existing.map((source) => source.displayName.trim().toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new SourceImportError('IMPORT_TRANSACTION_FAILED');
}

export function displayTitleFromReceipt(
  receipt: SourceStagingReceipt,
  requestedTitle?: string,
): string {
  const fallback = receipt.originalFilename.replace(/\.(?:txt|md|markdown)$/i, '').trim();
  return requestedTitle?.trim() || fallback || 'Imported text';
}
