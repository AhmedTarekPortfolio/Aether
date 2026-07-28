export interface DesktopAIRequest {
  requestId: string;
  profileId: string;
  providerType: string;
  baseUrl: string;
  endpoint?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  extraBody?: Record<string, unknown>;
}

export interface DesktopAIResponse {
  content: string;
  reasoning?: string;
  model?: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  providerId?: string;
  providerName?: string;
}

export interface DesktopStreamChunk {
  requestId: string;
  type: 'token' | 'reasoning' | 'done' | 'error';
  text?: string;
  content?: string;
  reasoning?: string;
  error?: string;
}

export interface DesktopTestRequest {
  profileId: string;
  providerType: string;
  baseUrl: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}

export interface DesktopTestResult {
  success: boolean;
  status: string;
  message: string;
  code?: string;
  providerId?: string;
  modelId?: string;
  latencyMs?: number;
}

export interface DesktopModelOption {
  id: string;
  name: string;
  providerId?: string;
  description?: string;
}

export interface DesktopCredentialInput {
  profileId: string;
  apiKey: string;
  organizationId?: string;
}

export interface DesktopCredentialStatus {
  configured: boolean;
  mask: string;
}

export interface DesktopFileOpenOptions {
  title?: string;
  buttonLabel?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface DesktopFileOpenResult {
  cancelled: boolean;
  filePath?: string;
  content?: string;
}

export interface DesktopFileSaveOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  content: string;
}

export interface DesktopFileSaveResult {
  cancelled: boolean;
  filePath?: string;
}

export interface DesktopAppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  userDataPath: string;
}

export interface AetherDesktopAPI {
  ai: {
    generate(request: DesktopAIRequest): Promise<DesktopAIResponse>;
    stream(
      request: DesktopAIRequest,
      onChunk: (chunk: DesktopStreamChunk) => void
    ): () => void;
    cancel(requestId: string): Promise<void>;
    testConnection(request: DesktopTestRequest): Promise<DesktopTestResult>;
    listModels(request: { profileId: string; providerType: string; baseUrl: string }): Promise<DesktopModelOption[]>;
  };
  credentials: {
    set(input: DesktopCredentialInput): Promise<{ success: boolean; mask: string }>;
    has(profileId: string): Promise<boolean>;
    remove(profileId: string): Promise<void>;
    getStatus(profileId: string): Promise<DesktopCredentialStatus>;
  };
  files: {
    openFile(options?: DesktopFileOpenOptions): Promise<DesktopFileOpenResult>;
    saveFile(options: DesktopFileSaveOptions): Promise<DesktopFileSaveResult>;
  };
  sources: {
    selectAndStage(request: SourceFileSelectionRequest): Promise<SourceStageOperationResult>;
    finalise(request: AssetFinalisationRequest): Promise<AssetFinalisationResult>;
    readTextAsset(request: ReadManagedTextAssetRequest): Promise<ReadManagedTextAssetResult>;
    cancel(stagingToken: string): Promise<SourceCancellationResult>;
    reconcile(): Promise<SourceFilesystemReconciliationReport>;
    getCapabilities(): Promise<SourceStorageCapabilities>;
  };
  app: {
    getInfo(): Promise<DesktopAppInfo>;
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
  };
}
import type {
  AssetFinalisationRequest,
  AssetFinalisationResult,
  ReadManagedTextAssetRequest,
  ReadManagedTextAssetResult,
  SourceCancellationResult,
  SourceFileSelectionRequest,
  SourceFilesystemReconciliationReport,
  SourceStageOperationResult,
  SourceStorageCapabilities,
} from './source-storage.js';
