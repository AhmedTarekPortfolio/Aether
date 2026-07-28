import type {
  SourceOperationResult,
  SourceStorageErrorCode,
} from '../../types/source-storage.js';

const SAFE_MESSAGES: Record<SourceStorageErrorCode, string> = {
  INVALID_REQUEST: 'The source-storage request is invalid.',
  DESKTOP_CAPABILITY_UNAVAILABLE: 'Managed source storage is available only in the desktop application.',
  UNSUPPORTED_FILE_TYPE: 'The selected file type is not supported.',
  FILE_TOO_LARGE: 'The selected file exceeds the allowed staging size.',
  FILE_NOT_REGULAR: 'The selected item is not a regular file.',
  FILE_SIGNATURE_MISMATCH: 'The file content does not match its supported file type.',
  FILE_READ_FAILED: 'The selected file could not be read.',
  STAGING_WRITE_FAILED: 'The selected file could not be staged securely.',
  STAGING_TOKEN_EXPIRED: 'The staging receipt has expired.',
  STAGING_TOKEN_UNKNOWN: 'The staging receipt is unknown or has already been used.',
  STAGING_FILE_MISSING: 'The staged file is no longer available.',
  STAGING_HASH_MISMATCH: 'The staged file failed integrity verification.',
  ASSET_PROMOTION_FAILED: 'The staged file could not be finalised.',
  ASSET_PATH_CONFLICT: 'A conflicting managed asset already exists.',
  MANAGED_ASSET_NOT_FOUND: 'The managed text asset is no longer available.',
  MANAGED_ASSET_IDENTITY_MISMATCH: 'The managed text asset failed identity verification.',
  INVALID_TEXT_ENCODING: 'The managed text asset is not valid UTF-8.',
  INVALID_TEXT_CONTENT: 'The managed text asset contains unsupported binary content.',
  OPERATION_CANCELLED: 'The source-storage operation was cancelled.',
  SOURCE_STORAGE_UNAVAILABLE: 'Managed source storage could not be initialised.',
};

export class SourceStorageError extends Error {
  constructor(
    public readonly code: SourceStorageErrorCode,
    options?: { cause?: unknown },
  ) {
    super(SAFE_MESSAGES[code], options);
    this.name = 'SourceStorageError';
  }
}

export function toSourceStorageError(error: unknown): SourceStorageError {
  if (error instanceof SourceStorageError) return error;
  return new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE', { cause: error });
}

export function sourceOperationFailure<T>(error: unknown): SourceOperationResult<T> {
  const safeError = toSourceStorageError(error);
  return {
    ok: false,
    error: { code: safeError.code, message: safeError.message },
  };
}
