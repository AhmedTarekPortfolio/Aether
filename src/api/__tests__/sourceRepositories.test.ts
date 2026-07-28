import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../db/database';
import type {
  AIGroundingRecord,
  SourceAsset,
  SourceChunk,
  SourceSegment,
  SourceVersion,
  StudySource,
} from '../../types';
import {
  addAIGroundingRecord,
  addSourceAssociation,
  addSourceAsset,
  addSourceChunk,
  addSourceChunks,
  addSourceJob,
  addSourceSegment,
  addSourceVersion,
  addStudySource,
  getAIGroundingRecordsByConversation,
  getSourceAssetByHash,
  updateSourceVersion,
  updateStudySource,
} from '..';

const now = 1_700_000_000_000;
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function source(id: string, userId = 'user-a'): StudySource {
  return {
    id,
    userId,
    displayName: id,
    sourceType: 'txt',
    status: 'active',
    currentVersionId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    trashedAt: null,
    purgedAt: null,
  };
}

function asset(id: string, userId = 'user-a'): SourceAsset {
  return {
    id,
    userId,
    contentHash: userId === 'user-a' ? hashA : hashB,
    mimeType: 'text/plain',
    extension: 'txt',
    byteSize: 12,
    relativePath: `assets/aa/${id}.txt`,
    createdAt: now,
  };
}

function version(
  id: string,
  sourceId: string,
  userId = 'user-a',
  assetId: string | null = null,
): SourceVersion {
  return {
    id,
    userId,
    sourceId,
    versionNumber: 1,
    assetId,
    originalFilename: assetId ? `${id}.txt` : null,
    versionReason: 'import',
    processorFingerprint: 'plain-text:v1',
    status: 'extracting',
    pageCount: null,
    lineCount: null,
    segmentCount: 0,
    charCount: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    readyAt: null,
  };
}

function segment(
  id: string,
  sourceId: string,
  sourceVersionId: string,
  userId = 'user-a',
): SourceSegment {
  return {
    id,
    userId,
    sourceId,
    sourceVersionId,
    ordinal: 1,
    segmentType: 'text_block',
    text: 'durable evidence',
    textHash: hashA,
    heading: null,
    physicalPage: null,
    printedPageLabel: null,
    lineStart: 1,
    lineEnd: 1,
    timeStartMs: null,
    timeEndMs: null,
    boundingBox: null,
    confidence: null,
    extractionMethod: 'plain_text',
    createdAt: now,
  };
}

function chunk(id: string, sourceVersionId: string, segmentId: string): SourceChunk {
  return {
    id,
    userId: 'user-a',
    sourceVersionId,
    segmentId,
    chunkerFingerprint: 'chunker:v1',
    ordinal: 0,
    text: 'durable',
    tokenEstimate: 2,
    charStart: 0,
    charEnd: 7,
    createdAt: now,
  };
}

beforeEach(async () => {
  db.close();
  await Dexie.delete('AetherPhase1DB');
  await db.open();
  await db.users.bulkAdd([
    {
      id: 'user-a',
      name: 'User A',
      email: 'a@example.test',
      academicLevel: 'Test',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-b',
      name: 'User B',
      email: 'b@example.test',
      academicLevel: 'Test',
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

afterEach(() => db.close());

describe('WP-LOCAL-01 source repositories', () => {
  it('persists source, asset, and version lineage with per-user asset deduplication', async () => {
    await addStudySource(source('source-a'));
    await addSourceAsset(asset('asset-a'));
    await addSourceVersion(version('version-a', 'source-a', 'user-a', 'asset-a'));
    await updateStudySource('source-a', { currentVersionId: 'version-a' });

    expect(await getSourceAssetByHash('user-a', hashA)).toMatchObject({ id: 'asset-a' });
    await expect(addSourceAsset({ ...asset('asset-duplicate'), id: 'asset-duplicate' }))
      .rejects.toThrow();
    expect(await db.study_sources.get('source-a')).toMatchObject({
      currentVersionId: 'version-a',
    });
  });

  it('rejects absolute, traversal, cross-user, and cross-lineage relationships', async () => {
    await addStudySource(source('source-a'));
    await addStudySource(source('source-b', 'user-b'));
    await expect(addSourceAsset({
      ...asset('bad-path'),
      relativePath: 'assets/../secret.txt',
    })).rejects.toThrow(/relativePath/);
    await expect(addSourceVersion(
      version('version-cross-user', 'source-a', 'user-b'),
    )).rejects.toThrow(/user mismatch/i);

    await addSourceVersion(version('version-a', 'source-a'));
    await expect(addSourceSegment(
      segment('segment-wrong-source', 'source-b', 'version-a'),
    )).rejects.toThrow(/does not match/i);
  });

  it('validates all four association targets and derives topic ownership through subject', async () => {
    await db.subjects.bulkAdd([
      {
        id: 'subject-a',
        userId: 'user-a',
        name: 'Subject A',
        color: '#000000',
        confidenceRating: 50,
        createdAt: now,
      },
      {
        id: 'subject-b',
        userId: 'user-b',
        name: 'Subject B',
        color: '#ffffff',
        confidenceRating: 50,
        createdAt: now,
      },
    ]);
    await db.topics.bulkAdd([
      { id: 'topic-a', subjectId: 'subject-a', title: 'A', masteryLevel: 0 },
      { id: 'topic-b', subjectId: 'subject-b', title: 'B', masteryLevel: 0 },
    ]);
    await addStudySource(source('source-a'));

    await addSourceAssociation({
      id: 'association-a',
      userId: 'user-a',
      sourceId: 'source-a',
      targetType: 'topic',
      targetId: 'topic-a',
      associationType: 'primary',
      createdAt: now,
    });
    await expect(addSourceAssociation({
      id: 'association-b',
      userId: 'user-a',
      sourceId: 'source-a',
      targetType: 'topic',
      targetId: 'topic-b',
      associationType: 'reference',
      createdAt: now,
    })).rejects.toThrow(/user mismatch/i);
  });

  it('validates chunk lineage and makes bulk insertion atomic', async () => {
    await addStudySource(source('source-a'));
    await addSourceVersion(version('version-a', 'source-a'));
    await addSourceSegment(segment('segment-a', 'source-a', 'version-a'));

    const valid = chunk('chunk-a', 'version-a', 'segment-a');
    const invalid = {
      ...chunk('chunk-b', 'version-a', 'segment-a'),
      ordinal: 1,
      charEnd: 0,
    };
    await expect(addSourceChunks([valid, invalid])).rejects.toThrow(/offsets/i);
    expect(await db.source_chunks.count()).toBe(0);

    await addSourceChunk(valid);
    await expect(addSourceChunk({ ...valid, id: 'chunk-duplicate' })).rejects.toThrow();
  });

  it('validates operational job references without implementing processing behavior', async () => {
    await addStudySource(source('source-a'));
    await addStudySource(source('source-b'));
    await addSourceVersion(version('version-a', 'source-a'));

    await expect(addSourceJob({
      id: 'job-invalid',
      userId: 'user-a',
      jobType: 'chunk',
      status: 'pending',
      sourceId: 'source-b',
      assetId: null,
      versionId: 'version-a',
      progress: 0,
      payload: {},
      result: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
    })).rejects.toThrow(/selected source/i);
  });

  it('keeps terminal versions immutable', async () => {
    await addStudySource(source('source-a'));
    await addSourceVersion(version('version-a', 'source-a'));
    await updateSourceVersion('version-a', { status: 'ready', segmentCount: 1, charCount: 16 });

    await expect(updateSourceVersion('version-a', { charCount: 17 }))
      .rejects.toThrow(/immutable/i);
  });

  it('persists immutable grounding snapshots and treats source pointers as historical', async () => {
    await db.ai_conversations.add({
      id: 'conversation-a',
      userId: 'user-a',
      role: 'assistant',
      mode: 'tutor',
      content: 'answer',
      timestamp: now,
    });
    const record: AIGroundingRecord = {
      id: 'grounding-a',
      userId: 'user-a',
      requestId: 'request-a',
      conversationId: 'conversation-a',
      assistantMessageId: 'message-a',
      evidenceLabel: 'S1',
      evidenceType: 'source_segment',
      sourceId: 'purged-source',
      sourceVersionId: 'purged-version',
      segmentId: 'purged-segment',
      noteId: null,
      displayTitle: 'Deleted source',
      locatorSnapshot: 'line 1',
      excerptSnapshot: 'exact excerpt',
      excerptHash: hashA,
      sentOrder: 1,
      createdAt: now,
    };

    await addAIGroundingRecord(record);
    expect(await getAIGroundingRecordsByConversation('conversation-a')).toEqual([record]);
    await expect(addAIGroundingRecord({
      ...record,
      id: 'grounding-cross-user',
      requestId: 'request-b',
      userId: 'user-b',
    })).rejects.toThrow(/conversation user mismatch/i);
  });
});
