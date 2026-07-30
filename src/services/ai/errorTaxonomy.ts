import { AIErrorCode } from './types';

export interface NormalizedAIError {
  code: AIErrorCode;
  title: string;
  message: string;
  actionRequired?: string;
  isRetryable: boolean;
}

/**
 * Normalizes provider, transport, and validation errors into user-friendly diagnostic messages.
 */
export function normalizeAIError(error: any): NormalizedAIError {
  const errString = String(error?.message || error || '').toLowerCase();

  if (errString.includes('prepared evidence changed')) {
    return {
      code: 'LOCAL_RETRIEVAL_FAILED',
      title: 'Evidence Changed',
      message: 'A selected note or imported source changed after the preview. Nothing was sent.',
      actionRequired: 'Prepare the request again and review the new evidence preview.',
      isRetryable: true,
    };
  }

  if (errString.includes('local evidence retrieval failed')) {
    return {
      code: 'LOCAL_RETRIEVAL_FAILED',
      title: 'Local Evidence Retrieval Failed',
      message: 'The selected local evidence could not be prepared. Nothing was sent.',
      actionRequired: 'Retry or adjust the selected notes, sources, pages, or segments.',
      isRetryable: true,
    };
  }

  if (errString.includes('cancelled') || errString.includes('aborted')) {
    return {
      code: 'CANCELLED',
      title: 'Request Cancelled',
      message: 'The AI generation request was cancelled by the user.',
      isRetryable: true,
    };
  }

  if (errString.includes('privacy') || errString.includes('local tools only')) {
    return {
      code: 'PRIVACY_BLOCKED',
      title: 'Privacy Restricted',
      message: 'External provider calls are blocked under current privacy settings.',
      actionRequired: 'Switch to Standard Mode or Local Model in Privacy Settings.',
      isRetryable: false,
    };
  }

  if (errString.includes('invalid_configuration') || errString.includes('not configured') || errString.includes('no api credential')) {
    return {
      code: 'INVALID_CONFIGURATION',
      title: 'Provider Configuration Incomplete',
      message: 'The provider configuration or saved credential is incomplete.',
      actionRequired: 'Open Model & AI API Configuration, save the API key, and verify the endpoint and model.',
      isRetryable: false,
    };
  }

  if (errString.includes('authentication') || errString.includes('invalid api key') || errString.includes('401') || errString.includes('403')) {
    return {
      code: 'INVALID_API_KEY',
      title: 'Authentication Failed',
      message: 'The API Key was rejected by the provider (401/403).',
      actionRequired: 'Verify API Key in Model & API Settings.',
      isRetryable: false,
    };
  }

  if (errString.includes('not found') || errString.includes('404')) {
    return {
      code: 'MODEL_NOT_FOUND',
      title: 'Model or Endpoint Not Found',
      message: 'The requested model ID or endpoint path was not found (404).',
      actionRequired: 'Check model ID in settings.',
      isRetryable: false,
    };
  }

  if (errString.includes('rate limit') || errString.includes('429') || errString.includes('quota')) {
    return {
      code: 'RATE_LIMITED',
      title: 'Rate Limit Exceeded',
      message: 'Provider rate limit or quota exceeded (429).',
      actionRequired: 'Wait a few moments before retrying.',
      isRetryable: true,
    };
  }

  if (errString.includes('timeout') || errString.includes('timed out')) {
    return {
      code: 'TIMEOUT',
      title: 'Request Timed Out',
      message: 'The provider endpoint failed to respond within the configured timeout.',
      actionRequired: 'Check network connectivity or increase request timeout in settings.',
      isRetryable: true,
    };
  }

  if (errString.includes('network_error') || errString.includes('failed to fetch') || errString.includes('network')) {
    return {
      code: 'NETWORK_ERROR',
      title: 'Provider Network Error',
      message: 'The Electron main process could not reach the provider API.',
      actionRequired: 'Verify the endpoint and network connection, then retry.',
      isRetryable: true,
    };
  }

  if (errString.includes('provider_error')) {
    return {
      code: 'PROVIDER_ERROR',
      title: 'Provider Error',
      message: error?.message?.replace(/^\[PROVIDER_ERROR\]\s*/i, '') || 'The provider rejected the request.',
      isRetryable: true,
    };
  }

  return {
    code: 'UNKNOWN',
    title: 'AI Provider Error',
    message: error?.message || 'An unexpected provider or transport error occurred.',
    isRetryable: true,
  };
}
