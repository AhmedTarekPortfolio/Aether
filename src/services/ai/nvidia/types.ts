export type NvidiaSourceType =
  | 'nvidia_build'
  | 'nvcf_invocation'
  | 'self_hosted_nim'
  | 'partner_endpoint';

export type NvidiaCapability =
  | 'chat'
  | 'completion'
  | 'responses'
  | 'messages'
  | 'embeddings'
  | 'reranking'
  | 'vision'
  | 'image_generation'
  | 'video_generation'
  | 'speech_to_text'
  | 'text_to_speech'
  | 'translation'
  | 'classification'
  | 'custom_json';

export type NvidiaAuthStrategy =
  | 'nvidia_bearer'
  | 'bearer'
  | 'x_api_key'
  | 'api_key_header'
  | 'none'
  | 'partner_adapter';

export type NvidiaRequestFormat =
  | 'openai_chat'
  | 'openai_completion'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'nvidia_ranking'
  | 'nvidia_embeddings'
  | 'multipart'
  | 'binary'
  | 'custom_json';

export type NvidiaResponseFormat =
  | 'openai_sse'
  | 'openai_json'
  | 'anthropic_sse'
  | 'json'
  | 'audio'
  | 'image'
  | 'video'
  | 'binary';

export interface NvidiaParameterDefinition {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'select' | 'json';
  required: boolean;
  defaultValue?: unknown;
  minimum?: number;
  maximum?: number;
  options?: Array<{
    label: string;
    value: string | number | boolean;
  }>;
}

export interface NvidiaNimEndpointProfile {
  id: string;
  displayName: string;
  source: NvidiaSourceType;
  capability: NvidiaCapability;
  modelId: string;
  baseUrl: string;
  endpointPath: string;
  httpMethod: 'GET' | 'POST';
  authStrategy: NvidiaAuthStrategy;
  headerName?: string;
  credentialReference?: string;
  requestFormat: NvidiaRequestFormat;
  responseFormat: NvidiaResponseFormat;
  supportsStreaming: boolean;
  supportsModelDiscovery: boolean;
  staticHeaders?: Record<string, string>;
  configurableParameters?: NvidiaParameterDefinition[];
  parameterValues?: Record<string, any>;
  isSelfHosted?: boolean;
  allowLocalhost?: boolean;
  availabilityLabel?: 'Free Endpoint' | 'Partner Endpoint' | 'Self-Hosted' | 'Downloadable Only' | 'User Configured';
  createdAt: number;
  updatedAt: number;
}

export type NvidiaApiErrorCode =
  | 'proxy_unavailable'
  | 'credential_missing'
  | 'authentication_failed'
  | 'authorization_failed'
  | 'endpoint_not_found'
  | 'model_not_found'
  | 'unsupported_capability'
  | 'invalid_request'
  | 'invalid_model_parameters'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'service_unavailable'
  | 'timeout'
  | 'cancelled'
  | 'cors_blocked'
  | 'mixed_content_blocked'
  | 'invalid_stream'
  | 'invalid_binary_response'
  | 'partner_configuration_required'
  | 'unknown';

export type NvidiaNormalizedResult =
  | { type: 'text'; content: string; reasoning?: string }
  | { type: 'streaming_text'; token: string }
  | { type: 'embedding'; vector: number[]; dimensions: number }
  | { type: 'ranking'; results: Array<{ index: number; score: number; text?: string }> }
  | { type: 'image'; imageUrl: string }
  | { type: 'audio'; audioUrl: string }
  | { type: 'json'; data: any };
