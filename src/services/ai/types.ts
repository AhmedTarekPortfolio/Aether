import { Subject, Task, UserProfile, AIProviderProfile, AIConversation } from '../../types';

export type AIErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_API_KEY'
  | 'INVALID_PROVIDER_URL'
  | 'PROVIDER_UNREACHABLE'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'REQUEST_REJECTED'
  | 'UNSUPPORTED_PARAMETER'
  | 'CONTEXT_TOO_LARGE'
  | 'INVALID_RESPONSE'
  | 'EMPTY_RESPONSE'
  | 'CANCELLED'
  | 'PRIVACY_BLOCKED'
  | 'LOCAL_RETRIEVAL_FAILED'
  | 'UNKNOWN';

export type PrivacyMode =
  | 'standard'
  | 'ask_before_sending'
  | 'local_model_only'
  | 'local_tools_only'
  | 'sensitive_study_mode';

export interface NormalizedChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
}

export interface NormalizedAIRequest {
  model: string;
  messages: NormalizedChatMessage[];
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  maximumOutputTokens?: number;
  stream?: boolean;
  responseSchema?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
}

export interface NormalizedAIResponse {
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
  modelId?: string;
  metadata?: Record<string, unknown>;
}

export interface PreparedResourceExcerpt {
  id: string;
  noteId: string;
  subjectId: string;
  sourceId: string; // e.g. "R1"
  title: string;
  excerpt: string;
  score: number;
  order: number;
}

export type RetrievalOutcome =
  | { status: 'success'; excerpts: PreparedResourceExcerpt[] }
  | { status: 'no-evidence'; excerpts: [] }
  | { status: 'cancelled'; excerpts: [] }
  | { status: 'error'; excerpts: []; error: unknown };

export interface RequestPreviewMetadata {
  providerId: string;
  providerName: string;
  modelId: string;
  mode: AIConversation['mode'];
  historyMessageCount: number;
  attachedResources: PreparedResourceExcerpt[];
  estimatedInputChars: number;
  privacyMode: PrivacyMode;
}

export interface PrepareAIInput {
  prompt: string;
  mode: AIConversation['mode'];
  userId: string;
  profileId?: string;
  subjectId?: string | null;
  taskId?: string | null;
  selectedResourceIds?: string[];
  privacyMode?: PrivacyMode;
  conversationHistory?: AIConversation[];
  signal?: AbortSignal;
}

export interface PreparedAIRequest {
  type: 'prepared_request';
  requestId: string;
  userId: string;
  subjectId?: string | null;
  taskId?: string | null;
  normalizedRequest: NormalizedAIRequest;
  profileConfig: AIProviderProfile;
  preview: RequestPreviewMetadata;
  requiresConfirmation: boolean;
}

export interface LocalOnlyResult {
  type: 'local_only_result';
  requestId: string;
  userId: string;
  subjectId?: string | null;
  taskId?: string | null;
  prompt: string;
  mode: AIConversation['mode'];
  excerpts: PreparedResourceExcerpt[];
  message: string;
  isNoEvidenceWarning?: boolean;
  outcome: 'success' | 'no-evidence';
}

export interface AIRequest {
  messages: NormalizedChatMessage[];
  mode: AIConversation['mode'];
  profile?: UserProfile | null;
  subject?: Subject | null;
  task?: Task | null;
  profileConfig: AIProviderProfile;
  normalizedRequest?: NormalizedAIRequest;
}

export interface AIStreamHandlers {
  onToken: (token: string) => void;
  onReasoningToken?: (token: string) => void;
  onComplete: (fullText: string, reasoningText?: string) => void;
  onError: (error: Error) => void;
}

export interface AIProviderResponse extends NormalizedAIResponse {
  explanation?: {
    confidence: number;
    factors: string[];
  };
}

export interface AIModelOption {
  id: string;
  name: string;
  description?: string;
}

export type AIConnectionStatus =
  | 'Connected'
  | 'Authentication failed'
  | 'Model not found'
  | 'Endpoint not found'
  | 'Request timed out'
  | 'Network unavailable'
  | 'Unsupported response format'
  | 'Configuration error'
  | 'missing-api-key'
  | 'connected'
  | 'authentication-failed'
  | 'provider-unreachable'
  | 'invalid-provider-url'
  | 'model-not-found'
  | 'timeout'
  | 'invalid-response'
  | 'unknown-error';

export interface AIConnectionTestResult {
  success: boolean;
  status: AIConnectionStatus;
  message: string;
  latencyMs?: number;
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  supportsStreaming: boolean;
  supportsModelDiscovery: boolean;

  generate(request: AIRequest, signal?: AbortSignal): Promise<AIProviderResponse>;

  stream?(
    request: AIRequest,
    handlers: AIStreamHandlers,
    signal?: AbortSignal
  ): Promise<void>;

  listModels?(
    profileConfig: AIProviderProfile,
    signal?: AbortSignal
  ): Promise<AIModelOption[]>;

  testConnection(
    profileConfig: AIProviderProfile,
    signal?: AbortSignal
  ): Promise<AIConnectionTestResult>;
}
