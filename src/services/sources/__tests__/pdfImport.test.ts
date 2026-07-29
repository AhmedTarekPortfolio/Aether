import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AetherDatabase } from '../../../db/database';
import type {
  PdfExtractionJobRequest,
  PdfExtractionJobResult,
  PdfPageExtraction,
} from '../../../../electron/types/pdf';
import type {
  AssetFinalisationReceipt,
  SourceStagingReceipt,
} from '../../../../electron/types/source-storage';
import {
  checkpointPdfFinalisation,
  completePdfImport,
  createPendingPdfImport,
} from '../pdfImportPersistence';
import {
  importPdfFile,
  recoverInterruptedPdfImports,
  retryPdfImport,
  type PdfImportRuntime,
} from '../pdfImportService';
import { searchImportedSources } from '../sourceSearch';
import type { SourceImportContext } from '../sourceImportTypes';
import {
  createSourceTestDatabase,
  deleteSourceTestDatabase,
} from './sourceTestUtils';

const databases: AetherDatabase[] = [];
const now = 1_700_000_000_000;
const hash = 'a'.repeat(64);
const context: SourceImportContext = {
  userId: 'user-a',
  subjectId: 'subject-a',
};
const staging: SourceStagingReceipt = {
  stagingToken: 'b'.repeat(64),
  contentHash: hash,
  mimeType: 'application/pdf',
  extension: 'pdf',
  byteSize: 10_000,
  originalFilename: 'Arabic Physics.pdf',
  proposedRelativePath: `assets/aa/${hash}.pdf`,
  createdAt: now,
};
const asset: AssetFinalisationReceipt = {
  stagingToken: staging.stagingToken,
  contentHash: hash,
  mimeType: 'application/pdf',
  extension: 'pdf',
  byteSize: staging.byteSize,
  relativePath: staging.proposedRelativePath,
  finalisedAt: now,
  reusedExistingAssetFile: false,
};

function page(
  ordinal: number,
  text: string,
  scanned = false,
): PdfPageExtraction {
  return {
    ordinal,
    physicalPage: ordinal,
    printedPageLabel: ordinal === 2 ? 'ii' : null,
    text,
    textHash: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    boundingBoxes: text
      ? [{ x: 10, y: 10, width: 100, height: 20 }]
      : [],
    rasterImageCount: scanned ? 1 : 0,
    likelyScanned: scanned,
  };
}

function completedResult(jobId: string): PdfExtractionJobResult {
  return {
    jobId,
    status: 'completed',
    pageCount: 3,
    pages: [
      page(1, 'Classical mechanics and velocity.'),
      page(2, 'الفيزياء Physics والسرعة velocity.'),
      page(3, '', true),
    ],
    scannedPageCount: 1,
    truncated: false,
    errorCode: null,
    errorMessage: null,
  };
}

function failedResult(
  jobId: string,
  code: 'PDF_PARSER_CRASHED' | 'PDF_EXTRACTION_CANCELLED' | 'PDF_OUTPUT_INVALID',
): PdfExtractionJobResult {
  return {
    jobId,
    status: code === 'PDF_EXTRACTION_CANCELLED' ? 'cancelled' : 'failed',
    pageCount: 0,
    pages: [],
    scannedPageCount: 0,
    truncated: false,
    errorCode: code,
    errorMessage: null,
  };
}

function runtimeWith(
  outcome: (request: PdfExtractionJobRequest) => PdfExtractionJobResult,
): PdfImportRuntime {
  return {
    selectAndStageSources: vi.fn().mockResolvedValue({
      ok: true,
      value: { cancelled: false, receipts: [staging] },
    }),
    finaliseSourceAsset: vi.fn().mockResolvedValue({ ok: true, value: asset }),
    cancelSourceStaging: vi.fn().mockResolvedValue({ cancelled: true }),
    extractPdf: vi.fn().mockImplementation(async (
      request: PdfExtractionJobRequest,
      onProgress: (progress: {
        jobId: string;
        stage: 'parsing';
        pagesProcessed: number;
        totalPages: number;
        percent: number;
      }) => void,
    ) => {
      onProgress({
        jobId: request.jobId,
        stage: 'parsing',
        pagesProcessed: 2,
        totalPages: 3,
        percent: 63,
      });
      return { ok: true, value: outcome(request) };
    }),
    cancelPdfExtraction: vi.fn().mockResolvedValue({ cancelled: true }),
  };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteSourceTestDatabase));
});

async function testDatabase(): Promise<AetherDatabase> {
  const database = await createSourceTestDatabase();
  databases.push(database);
  return database;
}

describe('PDF import, page persistence, search, and recovery', () => {
  it('finalises through managed storage and persists one durable segment per page', async () => {
    const database = await testDatabase();
    const runtime = runtimeWith((request) => completedResult(request.jobId));
    const imported = await importPdfFile(context, {
      database,
      runtime,
      now: () => now,
    });

    expect(runtime.selectAndStageSources).toHaveBeenCalledWith({
      selectionMode: 'single',
      allowedKinds: ['pdf'],
      maximumFileCount: 1,
    });
    expect(imported).toMatchObject({
      sourceType: 'pdf',
      pageCount: 3,
      scannedPageCount: 1,
      partiallyReady: false,
    });
    const segments = await database.source_segments
      .where('sourceVersionId')
      .equals(imported.versionId)
      .sortBy('ordinal');
    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.id)).toEqual([
      `pdf-segment:${imported.versionId}:1`,
      `pdf-segment:${imported.versionId}:2`,
      `pdf-segment:${imported.versionId}:3`,
    ]);
    expect(segments[1]).toMatchObject({
      segmentType: 'pdf_page',
      physicalPage: 2,
      printedPageLabel: 'ii',
      extractionMethod: 'pdf_text',
      text: expect.stringContaining('الفيزياء'),
    });
    expect(segments[2].text).toBe('');
    expect(await database.source_chunks.where('sourceVersionId').equals(imported.versionId).count())
      .toBe(2);
    expect(await database.source_versions.get(imported.versionId)).toMatchObject({
      status: 'ready',
      pageCount: 3,
      segmentCount: 3,
      assetId: expect.any(String),
    });
    expect(await database.source_jobs.where('sourceId').equals(imported.sourceId).first())
      .toMatchObject({
        status: 'completed',
        progress: 100,
        result: {
          scannedPageCount: 1,
          scannedPages: [3],
          chunkCount: 2,
        },
      });
  });

  it('finds Arabic and mixed PDF text only within the selected subject/source scope', async () => {
    const database = await testDatabase();
    const imported = await importPdfFile(context, {
      database,
      runtime: runtimeWith((request) => completedResult(request.jobId)),
    });
    const results = await searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      sourceIds: [imported.sourceId],
      query: 'الفيزياء velocity',
    }, database);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: { sourceType: 'pdf' },
      locator: {
        physicalPage: 2,
        printedPageLabel: 'ii',
      },
    });
    await expect(searchImportedSources({
      userId: 'user-b',
      subjectId: 'subject-b',
      query: 'الفيزياء',
    }, database)).resolves.toEqual([]);
  });

  it('keeps cancellation and parser failures safe while preserving the managed asset record', async () => {
    const database = await testDatabase();
    await expect(importPdfFile(context, {
      database,
      runtime: runtimeWith((request) =>
        failedResult(request.jobId, 'PDF_EXTRACTION_CANCELLED')),
    })).rejects.toMatchObject({ code: 'PDF_EXTRACTION_CANCELLED' });
    const source = await database.study_sources.toCollection().first();
    const version = await database.source_versions.where('sourceId').equals(source!.id).first();
    const job = await database.source_jobs.where('sourceId').equals(source!.id).first();
    expect(source?.currentVersionId).toBeNull();
    expect(version).toMatchObject({ status: 'failed', assetId: expect.any(String) });
    expect(job).toMatchObject({ status: 'cancelled' });
    expect(await database.source_assets.count()).toBe(1);
    expect(await database.source_segments.count()).toBe(0);
    expect(await database.source_chunks.count()).toBe(0);
  });

  it('commits validated partial pages as partially ready without inventing missing pages', async () => {
    const database = await testDatabase();
    const imported = await importPdfFile(context, {
      database,
      runtime: runtimeWith((request) => ({
        ...completedResult(request.jobId),
        status: 'partially_completed',
        pages: completedResult(request.jobId).pages.slice(0, 2),
        scannedPageCount: 0,
        truncated: true,
        errorCode: 'PDF_PARTIAL_EXTRACTION',
        errorMessage: 'Only part of the PDF could be extracted.',
      })),
    });
    expect(imported).toMatchObject({
      pageCount: 3,
      partiallyReady: true,
    });
    expect(await database.source_versions.get(imported.versionId)).toMatchObject({
      status: 'partially_ready',
      pageCount: 3,
      segmentCount: 2,
      errorCode: 'PDF_PARTIAL_EXTRACTION',
    });
    expect(await database.source_segments.where('sourceVersionId').equals(imported.versionId).count())
      .toBe(2);
  });

  it('recovers a restart-interrupted extraction and persists every row across reopen', async () => {
    const database = await testDatabase();
    const pending = await createPendingPdfImport(
      database,
      context,
      staging,
      'cancel-recovery',
    );
    await checkpointPdfFinalisation(
      database,
      pending,
      context,
      asset,
      'cancel-recovery',
    );
    const outcomes = await recoverInterruptedPdfImports('user-a', {
      database,
      runtime: runtimeWith((request) => completedResult(request.jobId)),
    });
    expect(outcomes).toEqual([{
      sourceId: pending.sourceId,
      recovered: true,
      message: 'PDF import recovered.',
    }]);

    database.close();
    await database.open();
    const source = await database.study_sources.get(pending.sourceId);
    expect(source?.currentVersionId).toBe(pending.versionId);
    expect(await database.source_segments.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(3);
    expect(await database.source_chunks.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(2);
    expect(await database.source_associations.where('sourceId').equals(pending.sourceId).count())
      .toBe(1);
    expect(await database.source_jobs.where('sourceId').equals(pending.sourceId).count())
      .toBe(1);
  });

  it('retries a failed parser job with a new job ID and deterministic page/chunk identities', async () => {
    const database = await testDatabase();
    await expect(importPdfFile(context, {
      database,
      runtime: runtimeWith((request) =>
        failedResult(request.jobId, 'PDF_PARSER_CRASHED')),
    })).rejects.toMatchObject({ code: 'PDF_PARSER_CRASHED' });
    const source = await database.study_sources.toCollection().first();
    const beforeJobs = await database.source_jobs.where('sourceId').equals(source!.id).toArray();
    const retried = await retryPdfImport(source!.id, 'user-a', {
      database,
      runtime: runtimeWith((request) => completedResult(request.jobId)),
    });
    const afterJobs = await database.source_jobs.where('sourceId').equals(source!.id).toArray();
    expect(afterJobs).toHaveLength(2);
    expect(afterJobs.map((job) => job.id)).not.toEqual([beforeJobs[0].id, beforeJobs[0].id]);
    expect(await database.source_segments.where('sourceVersionId').equals(retried.versionId).count())
      .toBe(3);
    expect((await database.source_chunks.where('sourceVersionId').equals(retried.versionId).toArray())
      .map((chunk) => chunk.id)).toEqual([
        `pdf-chunk:${retried.versionId}:1:0`,
        `pdf-chunk:${retried.versionId}:2:0`,
      ]);
  });

  it('rolls back page/chunk persistence atomically and leaves a retryable failed version', async () => {
    const database = await testDatabase();
    await expect(importPdfFile(context, {
      database,
      runtime: runtimeWith((request) => completedResult(request.jobId)),
      beforeChunkWrite: () => {
        throw new Error('injected transaction failure');
      },
    })).rejects.toMatchObject({ code: 'IMPORT_TRANSACTION_FAILED' });
    const source = await database.study_sources.toCollection().first();
    const version = await database.source_versions.where('sourceId').equals(source!.id).first();
    expect(source?.currentVersionId).toBeNull();
    expect(version).toMatchObject({
      status: 'failed',
      assetId: expect.any(String),
    });
    expect(await database.source_segments.count()).toBe(0);
    expect(await database.source_chunks.count()).toBe(0);
    expect(await database.source_associations.count()).toBe(0);
  });

  it('is idempotent when the same validated extraction result is committed again', async () => {
    const database = await testDatabase();
    const pending = await createPendingPdfImport(
      database,
      context,
      staging,
      'cancel-idempotent',
    );
    await checkpointPdfFinalisation(
      database,
      pending,
      context,
      asset,
      'cancel-idempotent',
    );
    const result = completedResult(pending.jobId);
    await completePdfImport(database, pending, context, asset, result);
    await completePdfImport(database, pending, context, asset, result);
    expect(await database.source_segments.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(3);
    expect(await database.source_chunks.where('sourceVersionId').equals(pending.versionId).count())
      .toBe(2);
    expect(await database.source_associations.where('sourceId').equals(pending.sourceId).count())
      .toBe(1);
  });
});
