import type {
  SourceAssociationType,
  SourceType,
} from '../../types';
import type { SourceStorageErrorCode } from '../../../electron/types/source-storage';
import type { PdfErrorCode } from '../../../electron/types/pdf';

export const SOURCE_IMPORT_PROCESSOR_FINGERPRINT = 'aether-plain-text-import:v1';
export const MAX_PASTED_TEXT_CHARACTERS = 1_000_000;

export type SourceImportStage =
  | 'idle'
  | 'selecting'
  | 'staging'
  | 'finalising'
  | 'reading'
  | 'extracting'
  | 'recovering'
  | 'processing'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SourceImportContext {
  userId: string;
  subjectId: string;
  topicId?: string;
  taskId?: string;
  noteId?: string;
  associationType?: SourceAssociationType;
  displayTitle?: string;
}

export interface SourceImportProgress {
  stage: SourceImportStage;
  message: string;
  filename?: string;
  sourceType?: Extract<SourceType, 'txt' | 'markdown' | 'pdf' | 'pasted-text'>;
  byteSize?: number;
}

export interface SourceImportResult {
  sourceId: string;
  versionId: string;
  displayTitle: string;
  sourceType: Extract<SourceType, 'txt' | 'markdown' | 'pdf' | 'pasted-text'>;
  byteSize: number | null;
  characterCount: number;
  chunkCount: number;
  reusedManagedAsset: boolean;
  pageCount?: number;
  scannedPageCount?: number;
  partiallyReady?: boolean;
}

export type SourceImportErrorCode =
  | SourceStorageErrorCode
  | PdfErrorCode
  | 'SUBJECT_REQUIRED'
  | 'SUBJECT_NOT_FOUND'
  | 'TOPIC_SUBJECT_MISMATCH'
  | 'ASSOCIATION_NOT_FOUND'
  | 'ASSOCIATION_USER_MISMATCH'
  | 'EMPTY_TEXT'
  | 'PASTED_TEXT_TOO_LARGE'
  | 'UNSUPPORTED_TEXT_SOURCE'
  | 'IMPORT_CANCELLED'
  | 'IMPORT_RECOVERY_UNAVAILABLE'
  | 'IMPORT_TRANSACTION_FAILED';

const SAFE_IMPORT_MESSAGES: Record<SourceImportErrorCode, string> = {
  INVALID_REQUEST: 'The source import request is invalid.',
  DESKTOP_CAPABILITY_UNAVAILABLE: 'File import is available only in the desktop application.',
  UNSUPPORTED_FILE_TYPE: 'Choose a supported TXT, Markdown, or PDF file.',
  FILE_TOO_LARGE: 'The selected text file is too large.',
  FILE_NOT_REGULAR: 'The selected item is not a regular file.',
  FILE_SIGNATURE_MISMATCH: 'The selected file appears to contain binary or mismatched content.',
  FILE_READ_FAILED: 'The selected file could not be read.',
  STAGING_WRITE_FAILED: 'The selected file could not be staged.',
  STAGING_TOKEN_EXPIRED: 'The staged file expired. Select the file again.',
  STAGING_TOKEN_UNKNOWN: 'The staged file is no longer available. Select it again.',
  STAGING_FILE_MISSING: 'The staged file is missing. Select it again.',
  STAGING_HASH_MISMATCH: 'The staged file failed its integrity check.',
  ASSET_PROMOTION_FAILED: 'The managed asset could not be finalised.',
  ASSET_PATH_CONFLICT: 'A conflicting managed asset was detected.',
  MANAGED_ASSET_NOT_FOUND: 'The managed text asset is missing.',
  MANAGED_ASSET_IDENTITY_MISMATCH: 'The managed text asset failed its integrity check.',
  INVALID_TEXT_ENCODING: 'The file is not valid UTF-8 text.',
  INVALID_TEXT_CONTENT: 'The file contains unsupported binary content.',
  OPERATION_CANCELLED: 'The source import was cancelled.',
  SOURCE_STORAGE_UNAVAILABLE: 'Managed source storage is unavailable.',
  PDF_PASSWORD_PROTECTED: 'The PDF is password protected. Password entry is not supported.',
  PDF_INVALID_FORMAT: 'The selected file is not a valid PDF.',
  PDF_CORRUPT: 'The PDF is corrupt or malformed.',
  PDF_TOO_LARGE: 'The PDF is stored locally but exceeds the 50 MiB extraction limit.',
  PDF_PAGE_LIMIT_EXCEEDED: 'The PDF exceeds the 1,000-page extraction limit.',
  PDF_CHARACTER_LIMIT_EXCEEDED: 'PDF text exceeded the extraction character limit.',
  PDF_EXTRACTION_TIMEOUT: 'PDF extraction timed out safely.',
  PDF_EXTRACTION_CANCELLED: 'PDF extraction was cancelled.',
  PDF_PARSER_CRASHED: 'The isolated PDF parser stopped unexpectedly.',
  PDF_OUTPUT_INVALID: 'The isolated PDF parser returned invalid output.',
  PDF_SCANNED_CONTENT_DETECTED: 'The PDF appears scanned. OCR is not available.',
  PDF_PARTIAL_EXTRACTION: 'Only part of the PDF could be extracted.',
  PDF_ASSET_MISSING: 'The managed PDF asset is missing.',
  PDF_HASH_MISMATCH: 'The managed PDF failed its integrity check.',
  SUBJECT_REQUIRED: 'Select a subject before importing.',
  SUBJECT_NOT_FOUND: 'The selected subject is unavailable.',
  TOPIC_SUBJECT_MISMATCH: 'The selected topic does not belong to the selected subject.',
  ASSOCIATION_NOT_FOUND: 'One of the selected associations is unavailable.',
  ASSOCIATION_USER_MISMATCH: 'One of the selected associations belongs to another user.',
  EMPTY_TEXT: 'Enter or select text containing at least one non-whitespace character.',
  PASTED_TEXT_TOO_LARGE: 'Pasted text exceeds the one-million-character limit.',
  UNSUPPORTED_TEXT_SOURCE: 'Only TXT, Markdown, PDF, and pasted text are supported here.',
  IMPORT_CANCELLED: 'The source import was cancelled.',
  IMPORT_RECOVERY_UNAVAILABLE: 'This import can no longer be resumed. Select the file again.',
  IMPORT_TRANSACTION_FAILED: 'The source could not be saved safely.',
};

export class SourceImportError extends Error {
  public readonly cause?: unknown;

  constructor(
    public readonly code: SourceImportErrorCode,
    public readonly recoverable = false,
    options?: { cause?: unknown },
  ) {
    super(SAFE_IMPORT_MESSAGES[code]);
    this.name = 'SourceImportError';
    this.cause = options?.cause;
  }
}

export function toSourceImportError(error: unknown): SourceImportError {
  if (error instanceof SourceImportError) return error;
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
    && error.code in SAFE_IMPORT_MESSAGES
  ) {
    return new SourceImportError(
      error.code as SourceImportErrorCode,
      ['STAGING_TOKEN_EXPIRED', 'STAGING_TOKEN_UNKNOWN', 'STAGING_FILE_MISSING']
        .includes(error.code),
      { cause: error },
    );
  }
  return new SourceImportError('IMPORT_TRANSACTION_FAILED', true, { cause: error });
}
