export type SourceType =
  | 'txt'
  | 'markdown'
  | 'pdf'
  | 'image'
  | 'browser-capture'
  | 'pasted-text'
  | 'transcript';

export type SourceStatus = 'active' | 'archived' | 'trashed' | 'purged';

export type SourceVersionReason =
  | 'import'
  | 'replace'
  | 'reprocess'
  | 'browser_capture'
  | 'pasted_text'
  | 'transcript';

export type SourceVersionStatus =
  | 'staged'
  | 'extracting'
  | 'ready'
  | 'partially_ready'
  | 'failed';

export type SourceSegmentType =
  | 'text_block'
  | 'pdf_page'
  | 'ocr_block'
  | 'web_section'
  | 'transcript_segment'
  | 'image_description';

export type SourceExtractionMethod =
  | 'plain_text'
  | 'pdf_text'
  | 'ocr'
  | 'web_capture'
  | 'manual';

export type SourceJobType =
  | 'import'
  | 'extract-text'
  | 'ocr'
  | 'chunk'
  | 'thumbnail';

export type SourceJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SourceAssociationType =
  | 'primary'
  | 'reference'
  | 'supplementary';

export type SourceAssociationTargetType =
  | 'subject'
  | 'topic'
  | 'task'
  | 'note';

export type GroundingEvidenceType =
  | 'source_segment'
  | 'note'
  | 'image';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudySource {
  id: string;
  userId: string;
  displayName: string;
  sourceType: SourceType;
  status: SourceStatus;
  currentVersionId: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  trashedAt: number | null;
  purgedAt: number | null;
}

export interface SourceAsset {
  id: string;
  userId: string;
  contentHash: string;
  mimeType: string;
  extension: string;
  byteSize: number;
  relativePath: string;
  createdAt: number;
}

export interface SourceVersion {
  id: string;
  userId: string;
  sourceId: string;
  versionNumber: number;
  assetId: string | null;
  originalFilename: string | null;
  versionReason: SourceVersionReason;
  processorFingerprint: string;
  status: SourceVersionStatus;
  pageCount: number | null;
  lineCount: number | null;
  segmentCount: number;
  charCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  readyAt: number | null;
}

export interface SourceSegment {
  id: string;
  userId: string;
  sourceId: string;
  sourceVersionId: string;
  ordinal: number;
  segmentType: SourceSegmentType;
  text: string;
  textHash: string;
  heading: string | null;
  physicalPage: number | null;
  printedPageLabel: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  timeStartMs: number | null;
  timeEndMs: number | null;
  boundingBox: BoundingBox | null;
  confidence: number | null;
  extractionMethod: SourceExtractionMethod;
  createdAt: number;
}

export interface SourceAssociation {
  id: string;
  userId: string;
  sourceId: string;
  targetType: SourceAssociationTargetType;
  targetId: string;
  associationType: SourceAssociationType;
  createdAt: number;
}

export interface SourceChunk {
  id: string;
  userId: string;
  sourceVersionId: string;
  segmentId: string;
  chunkerFingerprint: string;
  ordinal: number;
  text: string;
  tokenEstimate: number;
  charStart: number;
  charEnd: number;
  createdAt: number;
}

export interface SourceJob {
  id: string;
  userId: string;
  jobType: SourceJobType;
  status: SourceJobStatus;
  sourceId: string | null;
  assetId: string | null;
  versionId: string | null;
  progress: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface AIGroundingRecord {
  id: string;
  userId: string;
  requestId: string;
  conversationId: string;
  assistantMessageId: string;
  evidenceLabel: string;
  evidenceType: GroundingEvidenceType;
  sourceId: string | null;
  sourceVersionId: string | null;
  segmentId: string | null;
  noteId: string | null;
  displayTitle: string;
  locatorSnapshot: string;
  excerptSnapshot: string;
  excerptHash: string;
  sentOrder: number;
  createdAt: number;
}