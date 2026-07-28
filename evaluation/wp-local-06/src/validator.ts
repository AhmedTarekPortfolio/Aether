import crypto from 'node:crypto';
import path from 'node:path';
import {
  PDF_ERROR_CODES,
  type PdfExtractionJobRequest,
  type PdfExtractionJobResult,
} from './contracts.js';

const JOB_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_PATTERN = /^assets\/[a-f0-9]{2}\/[a-f0-9]{64}\.pdf$/;
const MAX_RENDERER_PDF_BYTES = 200 * 1024 * 1024;

export class PdfValidationError extends Error {
  public readonly code = 'PDF_OUTPUT_INVALID';
}

function fail(message: string): never {
  throw new PdfValidationError(message);
}

export function validateRendererRequest(value: unknown): PdfExtractionJobRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid request object');
  const request = value as Partial<PdfExtractionJobRequest>;
  if (typeof request.jobId !== 'string' || !JOB_ID_PATTERN.test(request.jobId)) fail('Invalid job ID');
  if (
    typeof request.assetRelativePath !== 'string'
    || !ASSET_PATTERN.test(request.assetRelativePath)
    || path.isAbsolute(request.assetRelativePath)
    || request.assetRelativePath.includes('\\')
  ) fail('Invalid managed asset path');
  if (typeof request.contentHash !== 'string' || !HASH_PATTERN.test(request.contentHash)) fail('Invalid content hash');
  if (!request.assetRelativePath.includes(request.contentHash)) fail('Path and content hash differ');
  if (!Number.isSafeInteger(request.byteSize) || request.byteSize! <= 0 || request.byteSize! > MAX_RENDERER_PDF_BYTES) {
    fail('Invalid byte size');
  }
  if (typeof request.cancellationToken !== 'string' || !JOB_ID_PATTERN.test(request.cancellationToken)) {
    fail('Invalid cancellation token');
  }
  const options = request.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Invalid options');
  if (!Number.isSafeInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 5_000) fail('Invalid page limit');
  if (!Number.isSafeInteger(options.maxCharacters) || options.maxCharacters < 1 || options.maxCharacters > 10_000_000) {
    fail('Invalid character limit');
  }
  if (!Number.isSafeInteger(options.maxBoundingBoxes) || options.maxBoundingBoxes < 0 || options.maxBoundingBoxes > 250_000) {
    fail('Invalid bounding-box limit');
  }
  if (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1 || options.maxOutputBytes > 32 * 1024 * 1024) {
    fail('Invalid output limit');
  }
  if (typeof options.includeCoordinates !== 'boolean') fail('Invalid coordinate option');
  return request as PdfExtractionJobRequest;
}

export function validateUtilityResult(
  value: unknown,
  request: PdfExtractionJobRequest,
): PdfExtractionJobResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid result object');
  const result = value as PdfExtractionJobResult;
  if (result.jobId !== request.jobId) fail('Job ID mismatch');
  if (!['completed', 'partially_completed', 'failed', 'cancelled'].includes(result.status)) fail('Invalid status');
  if (!Number.isSafeInteger(result.pageCount) || result.pageCount < 0 || result.pageCount > 5_000) fail('Invalid page count');
  if (!Array.isArray(result.pages) || result.pages.length > request.options.maxPages) fail('Invalid page array');
  if (!Number.isSafeInteger(result.scannedPageCount) || result.scannedPageCount < 0 || result.scannedPageCount > result.pageCount) {
    fail('Invalid scanned-page count');
  }
  if (typeof result.truncated !== 'boolean') fail('Invalid truncation flag');
  if (result.errorCode !== null && !PDF_ERROR_CODES.includes(result.errorCode)) fail('Invalid error code');
  if (result.errorMessage !== null && (typeof result.errorMessage !== 'string' || result.errorMessage.length > 500)) {
    fail('Invalid error message');
  }

  let characterCount = 0;
  let boxCount = 0;
  let scannedCount = 0;
  const ordinals = new Set<number>();
  for (let index = 0; index < result.pages.length; index += 1) {
    const page = result.pages[index];
    if (!page || typeof page !== 'object' || Array.isArray(page)) fail('Invalid page');
    if (!Number.isSafeInteger(page.ordinal) || page.ordinal !== index + 1 || ordinals.has(page.ordinal)) fail('Invalid page ordering');
    ordinals.add(page.ordinal);
    if (!Number.isSafeInteger(page.physicalPage) || page.physicalPage < 1 || page.physicalPage > result.pageCount) {
      fail('Invalid physical page');
    }
    if (page.printedPageLabel !== null && (typeof page.printedPageLabel !== 'string' || page.printedPageLabel.length > 64)) {
      fail('Invalid printed page label');
    }
    if (typeof page.text !== 'string' || page.text.includes('\0')) fail('Invalid page text');
    characterCount += page.text.length;
    if (characterCount > request.options.maxCharacters) fail('Character limit exceeded');
    const expectedHash = crypto.createHash('sha256').update(page.text, 'utf8').digest('hex');
    if (page.textHash !== expectedHash) fail('Text hash mismatch');
    if (!Array.isArray(page.boundingBoxes)) fail('Invalid bounding boxes');
    boxCount += page.boundingBoxes.length;
    if (boxCount > request.options.maxBoundingBoxes) fail('Bounding-box limit exceeded');
    for (const box of page.boundingBoxes) {
      if (
        !box
        || typeof box !== 'object'
        || !Number.isFinite(box.x)
        || !Number.isFinite(box.y)
        || !Number.isFinite(box.width)
        || !Number.isFinite(box.height)
        || box.width < 0
        || box.height < 0
      ) fail('Invalid bounding box');
    }
    if (!Number.isSafeInteger(page.rasterImageCount) || page.rasterImageCount < 0 || page.rasterImageCount > 100_000) {
      fail('Invalid raster-image count');
    }
    if (typeof page.likelyScanned !== 'boolean') fail('Invalid scanned flag');
    if (page.likelyScanned) scannedCount += 1;
  }
  if (scannedCount !== result.scannedPageCount) fail('Scanned-page count mismatch');
  const encodedSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (encodedSize > request.options.maxOutputBytes) fail('Output message exceeds limit');
  const serialized = JSON.stringify(result);
  if (/([a-zA-Z]:\\|\\\\|\/Users\/|\/home\/)/.test(serialized)) fail('Absolute path leaked');
  return result;
}
