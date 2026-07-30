import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../../db/database';
import type { SourceStatus, SourceType } from '../../../types';
import { sha256Text } from '../../sources/textNormalisation';
import {
  MAX_SOURCE_EVIDENCE_ITEMS,
  performSourceRetrieval,
} from '../localRetrieval';

async function addSource(options: {
  id: string;
  userId?: string;
  status?: SourceStatus;
  sourceType?: SourceType;
  texts: string[];
}) {
  const userId = options.userId ?? 'u1';
  const versionId = `${options.id}-v1`;
  await db.study_sources.add({
    id: options.id,
    userId,
    displayName: options.id,
    sourceType: options.sourceType ?? 'pdf',
    status: options.status ?? 'active',
    currentVersionId: versionId,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    trashedAt: null,
    purgedAt: null,
  });
  await db.source_versions.add({
    id: versionId,
    userId,
    sourceId: options.id,
    versionNumber: 1,
    assetId: null,
    originalFilename: null,
    versionReason: 'import',
    processorFingerprint: 'test',
    status: 'ready',
    pageCount: options.texts.length,
    lineCount: null,
    segmentCount: options.texts.length,
    charCount: options.texts.join('').length,
    errorCode: null,
    errorMessage: null,
    createdAt: 1,
    readyAt: 1,
  });
  await db.source_associations.add({
    id: `${options.id}-association`,
    userId,
    sourceId: options.id,
    targetType: 'subject',
    targetId: 's1',
    associationType: 'primary',
    createdAt: 1,
  });
  for (const [index, text] of options.texts.entries()) {
    const segmentId = `${options.id}-segment-${index + 1}`;
    await db.source_segments.add({
      id: segmentId,
      userId,
      sourceId: options.id,
      sourceVersionId: versionId,
      ordinal: index + 1,
      segmentType: options.sourceType === 'pdf' || !options.sourceType ? 'pdf_page' : 'text_block',
      text,
      textHash: await sha256Text(text),
      heading: null,
      physicalPage: options.sourceType === 'pdf' || !options.sourceType ? index + 1 : null,
      printedPageLabel: index === 1 ? 'ii' : null,
      lineStart: options.sourceType === 'pdf' || !options.sourceType ? null : index + 1,
      lineEnd: options.sourceType === 'pdf' || !options.sourceType ? null : index + 1,
      timeStartMs: null,
      timeEndMs: null,
      boundingBox: null,
      confidence: null,
      extractionMethod: options.sourceType === 'pdf' || !options.sourceType ? 'pdf_text' : 'plain_text',
      createdAt: 1,
    });
    await db.source_chunks.add({
      id: `${segmentId}-chunk`,
      userId,
      sourceVersionId: versionId,
      segmentId,
      chunkerFingerprint: 'test',
      ordinal: 0,
      text,
      tokenEstimate: Math.ceil(text.length / 4),
      charStart: 0,
      charEnd: text.length,
      createdAt: 1,
    });
  }
}

describe('WP-LOCAL-05 imported-source grounding retrieval', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
    await db.users.bulkAdd([
      { id: 'u1', name: 'One', email: 'one@test.dev', academicLevel: 'UG', createdAt: 1, updatedAt: 1 },
      { id: 'u2', name: 'Two', email: 'two@test.dev', academicLevel: 'UG', createdAt: 1, updatedAt: 1 },
    ]);
    await db.subjects.add({
      id: 's1', userId: 'u1', name: 'Biology', color: '#fff', confidenceRating: 0, createdAt: 1,
    });
    await db.subjects.add({
      id: 'other-subject', userId: 'u2', name: 'Private', color: '#000',
      confidenceRating: 0, createdAt: 1,
    });
  });

  afterEach(() => db.close());

  it('enforces selected-source, user, lifecycle, and subject-association boundaries', async () => {
    await addSource({ id: 'selected', texts: ['mitochondria selected evidence'] });
    await addSource({ id: 'unselected', texts: ['mitochondria private unselected'] });
    await addSource({ id: 'archived', status: 'archived', texts: ['mitochondria archived'] });
    await addSource({ id: 'trashed', status: 'trashed', texts: ['mitochondria trashed'] });
    await addSource({ id: 'purged', status: 'purged', texts: ['mitochondria purged'] });
    await addSource({ id: 'other-user', userId: 'u2', texts: ['mitochondria other user'] });

    const result = await performSourceRetrieval('mitochondria', {
      userId: 'u1',
      subjectId: 's1',
      selections: [
        { sourceId: 'selected' },
        { sourceId: 'archived' },
        { sourceId: 'trashed' },
        { sourceId: 'purged' },
        { sourceId: 'other-user' },
      ],
    });

    expect(result.status).toBe('success');
    expect(result.excerpts.map((item) => item.importedSourceId)).toEqual(['selected']);
    expect(JSON.stringify(result.excerpts)).not.toContain('private unselected');
    expect(result.excerpts[0]).toMatchObject({
      evidenceType: 'source_segment',
      label: 'S1',
      sourceVersionId: 'selected-v1',
      segmentId: 'selected-segment-1',
    });

    await db.source_associations.add({
      id: 'foreign-subject-association',
      userId: 'u1',
      sourceId: 'selected',
      targetType: 'subject',
      targetId: 'other-subject',
      associationType: 'reference',
      createdAt: 1,
    });
    const foreignSubject = await performSourceRetrieval('mitochondria', {
      userId: 'u1',
      subjectId: 'other-subject',
      selections: [{ sourceId: 'selected' }],
    });
    expect(foreignSubject).toMatchObject({ status: 'no-evidence', excerpts: [] });
  });

  it('applies PDF page and explicit segment restrictions before ranking', async () => {
    await addSource({
      id: 'pdf',
      texts: ['gravity weak', 'gravity strongest evidence', 'gravity medium evidence'],
    });
    const pageRestricted = await performSourceRetrieval('gravity evidence', {
      userId: 'u1',
      subjectId: 's1',
      selections: [{ sourceId: 'pdf', pageRanges: [{ start: 3, end: 3 }] }],
    });
    expect(pageRestricted.excerpts.map((item) => item.physicalPage)).toEqual([3]);
    expect(pageRestricted.excerpts[0].locator).toBe('Physical page 3');

    const segmentRestricted = await performSourceRetrieval('gravity', {
      userId: 'u1',
      subjectId: 's1',
      selections: [{ sourceId: 'pdf', segmentIds: ['pdf-segment-2'] }],
    });
    expect(segmentRestricted.excerpts.map((item) => item.segmentId)).toEqual(['pdf-segment-2']);
    expect(segmentRestricted.excerpts[0].locator).toContain('printed label ii');
  });

  it('resolves chunk matches to durable segments and orders stable ties by source order', async () => {
    await addSource({ id: 'first', texts: ['orbit evidence'] });
    await addSource({ id: 'second', texts: ['orbit evidence'] });
    const result = await performSourceRetrieval('orbit', {
      userId: 'u1',
      subjectId: 's1',
      selections: [{ sourceId: 'second' }, { sourceId: 'first' }],
    });
    expect(result.excerpts.map((item) => item.importedSourceId)).toEqual(['second', 'first']);
    expect(result.excerpts.every((item) => item.segmentId?.includes('segment'))).toBe(true);
    expect(result.excerpts.every((item) => !item.id.includes('chunk'))).toBe(true);
  });

  it('matches Arabic and mixed Arabic-English text and keeps evidence bounded', async () => {
    await addSource({
      id: 'mixed',
      texts: Array.from(
        { length: 8 },
        (_, index) => `الطاقة energy دليل ${index} ${'س'.repeat(1_500)}`,
      ),
    });
    const result = await performSourceRetrieval('الطاقة energy', {
      userId: 'u1',
      subjectId: 's1',
      selections: [{ sourceId: 'mixed' }],
    });
    expect(result.status).toBe('success');
    expect(result.excerpts.length).toBeLessThanOrEqual(MAX_SOURCE_EVIDENCE_ITEMS);
    expect(result.excerpts.every((item) => item.excerpt.length <= 1_200)).toBe(true);
    expect(result.excerpts.every((item) => /^[a-f0-9]{64}$/.test(item.excerptHash))).toBe(true);
  });

  it('distinguishes cancellation and retrieval failure from no evidence', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(performSourceRetrieval('orbit', {
      userId: 'u1',
      subjectId: 's1',
      selections: [{ sourceId: 'missing' }],
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    await db.close();
    const failed = await performSourceRetrieval('orbit', {
      userId: 'u1',
      subjectId: 's1',
      selections: [{ sourceId: 'missing' }],
    });
    expect(failed.status).toBe('error');
  });

  it('rejects more than the central selected-source limit', async () => {
    await expect(performSourceRetrieval('orbit', {
      userId: 'u1',
      subjectId: 's1',
      selections: Array.from({ length: 6 }, (_, index) => ({
        sourceId: `source-${index}`,
      })),
    })).rejects.toThrow(/at most 5 imported sources/i);
  });
});
