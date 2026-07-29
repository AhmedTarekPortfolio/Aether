export const PDF_ERROR_CODES = [
  'PDF_PASSWORD_PROTECTED',
  'PDF_INVALID_FORMAT',
  'PDF_CORRUPT',
  'PDF_TOO_LARGE',
  'PDF_PAGE_LIMIT_EXCEEDED',
  'PDF_CHARACTER_LIMIT_EXCEEDED',
  'PDF_EXTRACTION_TIMEOUT',
  'PDF_EXTRACTION_CANCELLED',
  'PDF_PARSER_CRASHED',
  'PDF_OUTPUT_INVALID',
  'PDF_SCANNED_CONTENT_DETECTED',
  'PDF_PARTIAL_EXTRACTION',
  'PDF_ASSET_MISSING',
  'PDF_HASH_MISMATCH',
] as const;

export type PdfErrorCode = (typeof PDF_ERROR_CODES)[number];

export const PDF_EXTRACTION_LIMITS = Object.freeze({
  maximumBytes: 50 * 1024 * 1024,
  maximumPages: 1_000,
  maximumCharacters: 5_000_000,
  maximumBoundingBoxes: 100_000,
  maximumOutputBytes: 16 * 1024 * 1024,
  timeoutMs: 120_000,
  maximumWorkingSetBytes: 450 * 1024 * 1024,
  cancellationGraceMs: 500,
  cancellationDeadlineMs: 1_000,
  progressIntervalMs: 250,
});

export const PDF_VIEWER_LIMITS = Object.freeze({
  grantLifetimeMs: 10 * 60 * 1_000,
  maximumRangeBytes: 8 * 1024 * 1024,
});

export interface PdfExtractionOptions {
  maxPages: number;
  maxCharacters: number;
  maxBoundingBoxes: number;
  maxOutputBytes: number;
  includeCoordinates: boolean;
}

export interface PdfExtractionJobRequest {
  jobId: string;
  sourceVersionId: string;
  assetRelativePath: string;
  contentHash: string;
  byteSize: number;
  options: PdfExtractionOptions;
  cancellationToken: string;
}

export interface PdfCancellationRequest {
  jobId: string;
  cancellationToken: string;
}

export interface PdfBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageExtraction {
  ordinal: number;
  physicalPage: number;
  printedPageLabel: string | null;
  text: string;
  textHash: string;
  boundingBoxes: PdfBoundingBox[];
  rasterImageCount: number;
  likelyScanned: boolean;
}

export interface PdfExtractionJobResult {
  jobId: string;
  status: 'completed' | 'partially_completed' | 'failed' | 'cancelled';
  pageCount: number;
  pages: PdfPageExtraction[];
  scannedPageCount: number;
  truncated: boolean;
  errorCode: PdfErrorCode | null;
  errorMessage: string | null;
}

export interface PdfJobProgress {
  jobId: string;
  stage: 'loading' | 'parsing' | 'finalizing';
  pagesProcessed: number;
  totalPages: number | null;
  percent: number;
}

export interface PdfViewerGrantRequest {
  sourceVersionId: string;
  assetRelativePath: string;
  contentHash: string;
  byteSize: number;
}

export interface PdfViewerGrant {
  sourceVersionId: string;
  url: string;
  expiresAt: number;
}

export interface PdfViewerRevokeRequest {
  url: string;
}

export type PdfOperationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: PdfErrorCode;
        message: string;
      };
    };

export type PdfExtractionOperationResult = PdfOperationResult<PdfExtractionJobResult>;
export type PdfViewerGrantResult = PdfOperationResult<PdfViewerGrant>;

export interface PdfCancellationResult {
  cancelled: boolean;
}

export interface PdfUtilityJobRequest {
  type: 'extract';
  request: PdfExtractionJobRequest;
  absolutePath: string;
}

export interface PdfUtilityCancelRequest {
  type: 'cancel';
  jobId: string;
  cancellationToken: string;
}

export type PdfUtilityMessage =
  | { type: 'ready' }
  | { type: 'progress'; progress: PdfJobProgress }
  | { type: 'result'; result: PdfExtractionJobResult };

export function createDefaultPdfExtractionRequest(
  input: Omit<PdfExtractionJobRequest, 'options'>,
): PdfExtractionJobRequest {
  return {
    ...input,
    options: {
      maxPages: PDF_EXTRACTION_LIMITS.maximumPages,
      maxCharacters: PDF_EXTRACTION_LIMITS.maximumCharacters,
      maxBoundingBoxes: PDF_EXTRACTION_LIMITS.maximumBoundingBoxes,
      maxOutputBytes: PDF_EXTRACTION_LIMITS.maximumOutputBytes,
      includeCoordinates: true,
    },
  };
}
