import type {
  PdfErrorCode,
  PdfExtractionJobResult,
  PdfOperationResult,
} from '../../../types/pdf.js';

const SAFE_PDF_MESSAGES: Record<PdfErrorCode, string> = {
  PDF_PASSWORD_PROTECTED: 'The PDF is password protected.',
  PDF_INVALID_FORMAT: 'The file is not a valid PDF.',
  PDF_CORRUPT: 'The PDF is corrupt or malformed.',
  PDF_TOO_LARGE: 'The PDF exceeds the extraction byte limit.',
  PDF_PAGE_LIMIT_EXCEEDED: 'The PDF exceeds the page limit.',
  PDF_CHARACTER_LIMIT_EXCEEDED: 'The extracted text exceeds the character limit.',
  PDF_EXTRACTION_TIMEOUT: 'PDF extraction timed out.',
  PDF_EXTRACTION_CANCELLED: 'PDF extraction was cancelled.',
  PDF_PARSER_CRASHED: 'The isolated PDF parser terminated unexpectedly.',
  PDF_OUTPUT_INVALID: 'The isolated PDF parser returned invalid output.',
  PDF_SCANNED_CONTENT_DETECTED: 'The PDF appears to contain scanned pages. OCR is not available.',
  PDF_PARTIAL_EXTRACTION: 'Only part of the PDF could be extracted.',
  PDF_ASSET_MISSING: 'The managed PDF asset is missing.',
  PDF_HASH_MISMATCH: 'The managed PDF asset no longer matches its recorded identity.',
};

export function safePdfMessage(code: PdfErrorCode): string {
  return SAFE_PDF_MESSAGES[code];
}

export function pdfFailureResult(
  jobId: string,
  code: PdfErrorCode,
  pageCount = 0,
): PdfExtractionJobResult {
  return {
    jobId,
    status: code === 'PDF_EXTRACTION_CANCELLED' ? 'cancelled' : 'failed',
    pageCount,
    pages: [],
    scannedPageCount: 0,
    truncated: false,
    errorCode: code,
    errorMessage: safePdfMessage(code),
  };
}

export function pdfOperationFailure<T>(
  code: PdfErrorCode,
): PdfOperationResult<T> {
  return {
    ok: false,
    error: { code, message: safePdfMessage(code) },
  };
}

export class PdfValidationError extends Error {
  public readonly code = 'PDF_OUTPUT_INVALID' as const;

  constructor(message = 'Invalid PDF operation payload') {
    super(message);
    this.name = 'PdfValidationError';
  }
}
