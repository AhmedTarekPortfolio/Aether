import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDefaultPdfExtractionRequest,
  type PdfExtractionJobResult,
} from '../types/pdf';
import {
  validatePdfCancellationRequest,
  validatePdfExtractionRequest,
  validatePdfUtilityResult,
  validatePdfViewerGrantRequest,
  validatePdfViewerRevokeRequest,
} from '../services/sources/pdf/pdf-validator';

const hash = 'a'.repeat(64);
const request = createDefaultPdfExtractionRequest({
  jobId: 'pdf-job-1',
  sourceVersionId: 'version-1',
  assetRelativePath: `assets/aa/${hash}.pdf`,
  contentHash: hash,
  byteSize: 1_024,
  cancellationToken: 'cancel-1',
});

function validResult(text = 'Arabic العربية and English'): PdfExtractionJobResult {
  return {
    jobId: request.jobId,
    status: 'completed',
    pageCount: 1,
    pages: [{
      ordinal: 1,
      physicalPage: 1,
      printedPageLabel: 'i',
      text,
      textHash: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
      boundingBoxes: [{ x: 1, y: 2, width: 3, height: 4 }],
      rasterImageCount: 0,
      likelyScanned: false,
    }],
    scannedPageCount: 0,
    truncated: false,
    errorCode: null,
    errorMessage: null,
  };
}

describe('production PDF request and output validation', () => {
  it('accepts only bounded managed PDF identity requests', () => {
    expect(validatePdfExtractionRequest(request)).toEqual(request);
    expect(() => validatePdfExtractionRequest({
      ...request,
      assetRelativePath: 'C:\\private\\lesson.pdf',
    })).toThrow();
    expect(() => validatePdfExtractionRequest({
      ...request,
      assetRelativePath: '../lesson.pdf',
    })).toThrow();
    expect(() => validatePdfExtractionRequest({
      ...request,
      options: { ...request.options, maxPages: 1_001 },
    })).toThrow();
  });

  it('recomputes page hashes and rejects invalid order, boxes, and native-path errors', () => {
    expect(validatePdfUtilityResult(validResult(), request)).toEqual(validResult());
    expect(() => validatePdfUtilityResult({
      ...validResult(),
      pages: [{ ...validResult().pages[0], ordinal: 2 }],
    }, request)).toThrow();
    expect(() => validatePdfUtilityResult({
      ...validResult(),
      pages: [{
        ...validResult().pages[0],
        textHash: 'b'.repeat(64),
      }],
    }, request)).toThrow();
    expect(() => validatePdfUtilityResult({
      ...validResult(),
      pages: [{
        ...validResult().pages[0],
        boundingBoxes: [{ x: 0, y: 0, width: Number.NaN, height: 1 }],
      }],
    }, request)).toThrow();
    expect(() => validatePdfUtilityResult({
      ...validResult(),
      status: 'failed',
      errorCode: 'PDF_CORRUPT',
      errorMessage: 'C:\\Users\\private\\lesson.pdf failed',
    }, request)).toThrow();
  });

  it('preserves Arabic and mixed-language page text as document content', () => {
    const text = 'الفيزياء Physics العربية English';
    expect(validatePdfUtilityResult(validResult(text), request).pages[0].text).toBe(text);
  });

  it('validates narrow cancellation and opaque viewer grant contracts', () => {
    expect(validatePdfCancellationRequest({
      jobId: request.jobId,
      cancellationToken: request.cancellationToken,
    })).toEqual({
      jobId: request.jobId,
      cancellationToken: request.cancellationToken,
    });
    expect(validatePdfViewerGrantRequest({
      sourceVersionId: request.sourceVersionId,
      assetRelativePath: request.assetRelativePath,
      contentHash: request.contentHash,
      byteSize: request.byteSize,
    })).toMatchObject({ sourceVersionId: 'version-1' });
    expect(validatePdfViewerRevokeRequest({
      url: `aether-asset://pdf/${'f'.repeat(64)}`,
    })).toEqual({ url: `aether-asset://pdf/${'f'.repeat(64)}` });
    expect(() => validatePdfViewerRevokeRequest({ url: 'file:///private.pdf' })).toThrow();
  });
});
