import crypto from 'node:crypto';
import path from 'node:path';
import {
  PDF_ERROR_CODES,
  PDF_EXTRACTION_LIMITS,
  type PdfCancellationRequest,
  type PdfExtractionJobRequest,
  type PdfExtractionJobResult,
  type PdfViewerGrantRequest,
  type PdfViewerRevokeRequest,
} from '../../../types/pdf.js';
import { PdfValidationError } from './pdf-errors.js';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const ASSET = /^assets\/[a-f0-9]{2}\/[a-f0-9]{64}\.pdf$/;
const VIEW_URL = /^aether-asset:\/\/pdf\/[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new PdfValidationError(message);
}

function strictObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}

function validateIdentityFields(value: Record<string, unknown>): void {
  if (
    typeof value.sourceVersionId !== 'string'
    || !SAFE_ID.test(value.sourceVersionId)
  ) fail('Invalid source version ID');
  if (
    typeof value.assetRelativePath !== 'string'
    || !ASSET.test(value.assetRelativePath)
    || path.isAbsolute(value.assetRelativePath)
    || value.assetRelativePath.includes('\\')
  ) fail('Invalid managed PDF path');
  if (typeof value.contentHash !== 'string' || !HASH.test(value.contentHash)) {
    fail('Invalid content hash');
  }
  if (!value.assetRelativePath.includes(value.contentHash)) fail('PDF identity mismatch');
  if (
    !Number.isSafeInteger(value.byteSize)
    || (value.byteSize as number) <= 0
    || (value.byteSize as number) > 200 * 1024 * 1024
  ) fail('Invalid PDF byte size');
}

export function validatePdfExtractionRequest(value: unknown): PdfExtractionJobRequest {
  if (!strictObject(value, [
    'jobId',
    'sourceVersionId',
    'assetRelativePath',
    'contentHash',
    'byteSize',
    'options',
    'cancellationToken',
  ])) fail('Invalid PDF request');
  validateIdentityFields(value);
  if (typeof value.jobId !== 'string' || !SAFE_ID.test(value.jobId)) fail('Invalid job ID');
  if (
    typeof value.cancellationToken !== 'string'
    || !SAFE_ID.test(value.cancellationToken)
  ) fail('Invalid cancellation token');
  if (!strictObject(value.options, [
    'maxPages',
    'maxCharacters',
    'maxBoundingBoxes',
    'maxOutputBytes',
    'includeCoordinates',
  ])) fail('Invalid extraction options');
  const options = value.options;
  if (
    !Number.isSafeInteger(options.maxPages)
    || (options.maxPages as number) < 1
    || (options.maxPages as number) > PDF_EXTRACTION_LIMITS.maximumPages
  ) fail('Invalid page limit');
  if (
    !Number.isSafeInteger(options.maxCharacters)
    || (options.maxCharacters as number) < 1
    || (options.maxCharacters as number) > PDF_EXTRACTION_LIMITS.maximumCharacters
  ) fail('Invalid character limit');
  if (
    !Number.isSafeInteger(options.maxBoundingBoxes)
    || (options.maxBoundingBoxes as number) < 0
    || (options.maxBoundingBoxes as number) > PDF_EXTRACTION_LIMITS.maximumBoundingBoxes
  ) fail('Invalid bounding-box limit');
  if (
    !Number.isSafeInteger(options.maxOutputBytes)
    || (options.maxOutputBytes as number) < 1
    || (options.maxOutputBytes as number) > PDF_EXTRACTION_LIMITS.maximumOutputBytes
  ) fail('Invalid output limit');
  if (typeof options.includeCoordinates !== 'boolean') fail('Invalid coordinate flag');
  return value as unknown as PdfExtractionJobRequest;
}

export function validatePdfCancellationRequest(value: unknown): PdfCancellationRequest {
  if (!strictObject(value, ['jobId', 'cancellationToken'])) fail('Invalid cancellation');
  if (typeof value.jobId !== 'string' || !SAFE_ID.test(value.jobId)) fail('Invalid job ID');
  if (
    typeof value.cancellationToken !== 'string'
    || !SAFE_ID.test(value.cancellationToken)
  ) fail('Invalid cancellation token');
  return value as unknown as PdfCancellationRequest;
}

export function validatePdfViewerGrantRequest(value: unknown): PdfViewerGrantRequest {
  if (!strictObject(value, [
    'sourceVersionId',
    'assetRelativePath',
    'contentHash',
    'byteSize',
  ])) fail('Invalid viewer grant');
  validateIdentityFields(value);
  return value as unknown as PdfViewerGrantRequest;
}

export function validatePdfViewerRevokeRequest(value: unknown): PdfViewerRevokeRequest {
  if (!strictObject(value, ['url']) || typeof value.url !== 'string' || !VIEW_URL.test(value.url)) {
    fail('Invalid viewer revoke');
  }
  return value as unknown as PdfViewerRevokeRequest;
}

export function validatePdfUtilityResult(
  value: unknown,
  request: PdfExtractionJobRequest,
): PdfExtractionJobResult {
  if (!strictObject(value, [
    'jobId',
    'status',
    'pageCount',
    'pages',
    'scannedPageCount',
    'truncated',
    'errorCode',
    'errorMessage',
  ])) fail('Invalid result');
  const result = value as unknown as PdfExtractionJobResult;
  if (result.jobId !== request.jobId) fail('Job ID mismatch');
  if (!['completed', 'partially_completed', 'failed', 'cancelled'].includes(result.status)) {
    fail('Invalid status');
  }
  if (
    !Number.isSafeInteger(result.pageCount)
    || result.pageCount < 0
    || result.pageCount > request.options.maxPages
  ) fail('Invalid page count');
  if (!Array.isArray(result.pages) || result.pages.length > request.options.maxPages) {
    fail('Invalid page array');
  }
  if (
    !Number.isSafeInteger(result.scannedPageCount)
    || result.scannedPageCount < 0
    || result.scannedPageCount > result.pages.length
  ) fail('Invalid scanned-page count');
  if (typeof result.truncated !== 'boolean') fail('Invalid truncation flag');
  if (result.errorCode !== null && !PDF_ERROR_CODES.includes(result.errorCode)) {
    fail('Invalid error code');
  }
  if (
    result.errorMessage !== null
    && (
      typeof result.errorMessage !== 'string'
      || result.errorMessage.length > 500
      || result.errorMessage.includes('\0')
      || /([a-zA-Z]:\\|\\\\|\/Users\/|\/home\/|file:)/.test(result.errorMessage)
      || /(^|\n)\s*(?:at\s+\S+|Error(?::|\s*$))/m.test(result.errorMessage)
    )
  ) fail('Invalid error message');

  let characters = 0;
  let boxes = 0;
  let scanned = 0;
  for (let index = 0; index < result.pages.length; index += 1) {
    const page = result.pages[index];
    if (!strictObject(page, [
      'ordinal',
      'physicalPage',
      'printedPageLabel',
      'text',
      'textHash',
      'boundingBoxes',
      'rasterImageCount',
      'likelyScanned',
    ])) fail('Invalid page');
    if (page.ordinal !== index + 1 || page.physicalPage !== index + 1) fail('Invalid page ordering');
    if (
      page.printedPageLabel !== null
      && (
        typeof page.printedPageLabel !== 'string'
        || page.printedPageLabel.length > 64
        || page.printedPageLabel.includes('\0')
      )
    ) fail('Invalid printed page label');
    if (typeof page.text !== 'string' || page.text.includes('\0')) fail('Invalid page text');
    characters += page.text.length;
    if (characters > request.options.maxCharacters) fail('Character limit exceeded');
    const expectedHash = crypto.createHash('sha256').update(page.text, 'utf8').digest('hex');
    if (page.textHash !== expectedHash) fail('Page text hash mismatch');
    if (!Array.isArray(page.boundingBoxes)) fail('Invalid boxes');
    boxes += page.boundingBoxes.length;
    if (boxes > request.options.maxBoundingBoxes) fail('Bounding-box limit exceeded');
    for (const box of page.boundingBoxes) {
      if (
        !strictObject(box, ['x', 'y', 'width', 'height'])
        || !Number.isFinite(box.x)
        || !Number.isFinite(box.y)
        || !Number.isFinite(box.width)
        || !Number.isFinite(box.height)
        || box.width < 0
        || box.height < 0
      ) fail('Invalid bounding box');
    }
    if (
      !Number.isSafeInteger(page.rasterImageCount)
      || page.rasterImageCount < 0
      || page.rasterImageCount > 100_000
      || typeof page.likelyScanned !== 'boolean'
    ) fail('Invalid scanned-page evidence');
    if (page.likelyScanned) scanned += 1;
  }
  if (scanned !== result.scannedPageCount) fail('Scanned-page count mismatch');
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > request.options.maxOutputBytes) {
    fail('Output limit exceeded');
  }
  return result;
}
