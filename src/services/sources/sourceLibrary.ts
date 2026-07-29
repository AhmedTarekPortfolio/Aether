import { db, type AetherDatabase } from '../../db/database';
import type {
  SourceAssociation,
  SourceAsset,
  SourceJob,
  SourceSegment,
  SourceStatus,
  SourceVersion,
  StudySource,
} from '../../types';
import { parsePersistedImportPayload } from './sourceImportPersistence';
import { parsePersistedPdfImportPayload } from './pdfImportPersistence';

export interface SourceAssociationDisplay extends SourceAssociation {
  label: string;
}

export interface SourceLibraryEntry {
  source: StudySource;
  version: SourceVersion | null;
  segment: SourceSegment | null;
  segments?: SourceSegment[];
  asset: SourceAsset | null;
  associations: SourceAssociationDisplay[];
  pendingContextLabels: string[];
  chunkCount: number;
  latestJob?: SourceJob | null;
}

function pendingContextFromJob(job: SourceJob | undefined) {
  return parsePersistedImportPayload(job?.payload)?.context
    ?? parsePersistedPdfImportPayload(job?.payload)?.context;
}

async function associationLabel(
  database: AetherDatabase,
  association: SourceAssociation,
): Promise<string> {
  if (association.targetType === 'subject') {
    return (await database.subjects.get(association.targetId))?.name ?? 'Unavailable subject';
  }
  if (association.targetType === 'topic') {
    return (await database.topics.get(association.targetId))?.title ?? 'Unavailable topic';
  }
  if (association.targetType === 'task') {
    return (await database.tasks.get(association.targetId))?.title ?? 'Unavailable task';
  }
  return (await database.notes.get(association.targetId))?.title ?? 'Unavailable note';
}

export async function getSourceLibraryEntries(
  userId: string,
  subjectId?: string,
  status: Exclude<SourceStatus, 'purged'> = 'active',
  database: AetherDatabase = db,
): Promise<SourceLibraryEntry[]> {
  let sources = (await database.study_sources.where('userId').equals(userId).toArray())
    .filter((source) =>
      source.status === status
      && (source.sourceType === 'txt'
        || source.sourceType === 'markdown'
        || source.sourceType === 'pdf'
        || source.sourceType === 'pasted-text'));
  if (subjectId) {
    const associatedIds = new Set(
      (await database.source_associations
        .where('[targetType+targetId]')
        .equals(['subject', subjectId])
        .toArray())
        .filter((association) => association.userId === userId)
        .map((association) => association.sourceId),
    );
    const pendingIds = new Set<string>();
    for (const source of sources) {
      const jobs = await database.source_jobs.where('sourceId').equals(source.id).toArray();
      const latest = jobs.sort((left, right) => right.createdAt - left.createdAt)[0];
      if (pendingContextFromJob(latest)?.subjectId === subjectId) {
        pendingIds.add(source.id);
      }
    }
    sources = sources.filter((source) => associatedIds.has(source.id) || pendingIds.has(source.id));
  }

  const entries = await Promise.all(sources.map(async (source): Promise<SourceLibraryEntry> => {
    const versions = await database.source_versions
      .where('sourceId')
      .equals(source.id)
      .sortBy('versionNumber');
    const version = source.currentVersionId
      ? await database.source_versions.get(source.currentVersionId) ?? null
      : versions.at(-1) ?? null;
    const [segments, asset, associations, chunkCount] = version
      ? await Promise.all([
          database.source_segments
            .where('sourceVersionId')
            .equals(version.id)
            .sortBy('ordinal'),
          version.assetId ? database.source_assets.get(version.assetId) : undefined,
          database.source_associations.where('sourceId').equals(source.id).toArray(),
          database.source_chunks.where('sourceVersionId').equals(version.id).count(),
        ])
      : [[], undefined, [], 0];
    const displayedAssociations = await Promise.all(
      associations.map(async (association) => ({
        ...association,
        label: await associationLabel(database, association),
      })),
    );
    const jobs = await database.source_jobs.where('sourceId').equals(source.id).toArray();
    const latestJob = jobs.sort((left, right) => right.createdAt - left.createdAt)[0];
    const pendingContext = pendingContextFromJob(latestJob);
    const pendingContextLabels: string[] = [];
    if (displayedAssociations.length === 0 && pendingContext) {
      const [subject, topic, task, note] = await Promise.all([
        database.subjects.get(pendingContext.subjectId),
        pendingContext.topicId ? database.topics.get(pendingContext.topicId) : undefined,
        pendingContext.taskId ? database.tasks.get(pendingContext.taskId) : undefined,
        pendingContext.noteId ? database.notes.get(pendingContext.noteId) : undefined,
      ]);
      if (subject) pendingContextLabels.push(`subject: ${subject.name} (pending)`);
      if (topic) pendingContextLabels.push(`topic: ${topic.title} (pending)`);
      if (task) pendingContextLabels.push(`task: ${task.title} (pending)`);
      if (note) pendingContextLabels.push(`note: ${note.title} (pending)`);
    }
    return {
      source,
      version,
      segment: segments[0] ?? null,
      segments,
      asset: asset ?? null,
      associations: displayedAssociations,
      pendingContextLabels,
      chunkCount,
      latestJob: latestJob ?? null,
    };
  }));

  return entries.sort((left, right) =>
    right.source.createdAt - left.source.createdAt
    || left.source.displayName.localeCompare(right.source.displayName));
}
