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

export interface PdfExtractionOptions {
  maxPages: number;
  maxCharacters: number;
  maxBoundingBoxes: number;
  maxOutputBytes: number;
  includeCoordinates: boolean;
}

export interface PdfExtractionJobRequest {
  jobId: string;
  assetRelativePath: string;
  contentHash: string;
  byteSize: number;
  options: PdfExtractionOptions;
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

export interface EvaluationScenario {
  id: string;
  assetRelativePath: string;
  expectedContentHash: string;
  expectedByteSize: number;
  options: PdfExtractionOptions;
  action?: 'extract' | 'cancel' | 'timeout' | 'crash' | 'invalid-output';
  timeoutMs?: number;
  cancelAfterMs?: number;
}

export interface UtilityJobRequest {
  type: 'extract';
  request: PdfExtractionJobRequest;
  absolutePath: string;
  debugAction?: EvaluationScenario['action'];
  debugDelayPerPageMs?: number;
}

export interface UtilityCancelRequest {
  type: 'cancel';
  jobId: string;
  cancellationToken: string;
}

export interface UtilityEnvironmentEvidence {
  processType: string | undefined;
  nodeVersion: string;
  electronVersion: string | undefined;
  hasDocument: boolean;
  hasWindow: boolean;
  hasIndexedDb: boolean;
  hasLocalStorage: boolean;
  inheritedEnvironmentKeys: string[];
}

export type UtilityMessage =
  | { type: 'ready'; evidence: UtilityEnvironmentEvidence }
  | { type: 'progress'; progress: PdfJobProgress }
  | { type: 'result'; result: PdfExtractionJobResult }
  | { type: 'invalid-result'; value: unknown };

export interface EvaluationScenarioResult {
  scenarioId: string;
  rendererRequest: PdfExtractionJobRequest;
  result: PdfExtractionJobResult;
  progress: PdfJobProgress[];
  utilityEvidence: UtilityEnvironmentEvidence | null;
  utilityPidObserved: boolean;
  mainPid: number;
  rendererPid: number;
  utilityStartupMs: number | null;
  peakWorkingSetBytes: number;
  elapsedMs: number;
  mainSurvived: boolean;
  outputValidated: boolean;
  cleanupConfirmed: boolean;
  utilityDiagnostics: string[];
}
