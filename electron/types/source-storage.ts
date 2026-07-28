export const SOURCE_FILE_KINDS = ['text', 'markdown', 'pdf', 'image'] as const;
export type SourceFileKind = (typeof SOURCE_FILE_KINDS)[number];
export type SourceAllowedKinds = SourceFileKind[] | ['any-supported'];

export const SOURCE_FILE_SIZE_LIMITS = {
  text: 50 * 1024 * 1024,
  markdown: 50 * 1024 * 1024,
  pdf: 200 * 1024 * 1024,
  image: 50 * 1024 * 1024,
} as const satisfies Record<SourceFileKind, number>;

export const SOURCE_MAXIMUM_FILE_COUNT = 20;
export const SOURCE_STAGING_TOKEN_MAX_LENGTH = 128;

export interface SourceFileSelectionRequest {
  selectionMode: 'single' | 'multiple';
  allowedKinds: SourceAllowedKinds;
  maximumFileCount: number;
}

export interface SourceStagingReceipt {
  stagingToken: string;
  contentHash: string;
  mimeType: string;
  extension: string;
  byteSize: number;
  originalFilename: string;
  proposedRelativePath: string;
  createdAt: number;
}

export interface AssetFinalisationRequest {
  stagingToken: string;
}

export interface AssetFinalisationReceipt {
  stagingToken: string;
  contentHash: string;
  mimeType: string;
  extension: string;
  byteSize: number;
  relativePath: string;
  finalisedAt: number;
  reusedExistingAssetFile: boolean;
}

export interface ReadManagedTextAssetRequest {
  relativePath: string;
  expectedContentHash: string;
}

export interface ReadManagedTextAssetReceipt {
  text: string;
  contentHash: string;
  mimeType: 'text/plain' | 'text/markdown';
  extension: 'txt' | 'md' | 'markdown';
  byteSize: number;
}

export type SourceStorageErrorCode =
  | 'INVALID_REQUEST'
  | 'DESKTOP_CAPABILITY_UNAVAILABLE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'FILE_NOT_REGULAR'
  | 'FILE_SIGNATURE_MISMATCH'
  | 'FILE_READ_FAILED'
  | 'STAGING_WRITE_FAILED'
  | 'STAGING_TOKEN_EXPIRED'
  | 'STAGING_TOKEN_UNKNOWN'
  | 'STAGING_FILE_MISSING'
  | 'STAGING_HASH_MISMATCH'
  | 'ASSET_PROMOTION_FAILED'
  | 'ASSET_PATH_CONFLICT'
  | 'MANAGED_ASSET_NOT_FOUND'
  | 'MANAGED_ASSET_IDENTITY_MISMATCH'
  | 'INVALID_TEXT_ENCODING'
  | 'INVALID_TEXT_CONTENT'
  | 'OPERATION_CANCELLED'
  | 'SOURCE_STORAGE_UNAVAILABLE';

export interface SourceStorageErrorResult {
  code: SourceStorageErrorCode;
  message: string;
}

export type SourceOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SourceStorageErrorResult };

export interface SourceStageOperationValue {
  cancelled: boolean;
  receipts: SourceStagingReceipt[];
}

export type SourceStageOperationResult = SourceOperationResult<SourceStageOperationValue>;
export type AssetFinalisationResult = SourceOperationResult<AssetFinalisationReceipt>;
export type ReadManagedTextAssetResult = SourceOperationResult<ReadManagedTextAssetReceipt>;

export interface SourceCancellationResult {
  cancelled: boolean;
}

export interface SourceFilesystemUnresolvedAsset {
  relativePath: string;
  contentHash: string | null;
  byteSize: number;
  reason: string;
}

export interface SourceFilesystemReconciliationReport {
  expiredStagingFiles: number;
  removedTemporaryFiles: number;
  quarantinedFiles: number;
  malformedEntries: number;
  missingStagingTokenFiles: number;
  unresolvedAssetFiles: SourceFilesystemUnresolvedAsset[];
  resultTruncated: boolean;
  completedAt: number;
}

export interface SourceStorageCapabilities {
  available: boolean;
  supportedExtensions: readonly string[];
  maximumFileCount: number;
  sizeLimits: Record<SourceFileKind, number>;
  stagingReceiptLifetimeMs: number;
  physicalAssetScope: 'shared-content-addressed';
}
