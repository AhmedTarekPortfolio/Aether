import { DesktopAIRequest, DesktopCredentialInput } from '../types/desktop-api.js';
import {
  SOURCE_FILE_KINDS,
  SOURCE_MAXIMUM_FILE_COUNT,
  SOURCE_STAGING_TOKEN_MAX_LENGTH,
} from '../types/source-storage.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAIRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'AI request must be an object' };
  }

  const req = input as Record<string, unknown>;

  if (typeof req.profileId !== 'string' || !req.profileId.trim()) {
    return { valid: false, error: 'profileId is required and must be a non-empty string' };
  }

  if (typeof req.providerType !== 'string' || !req.providerType.trim()) {
    return { valid: false, error: 'providerType is required' };
  }

  if (typeof req.baseUrl !== 'string' || !req.baseUrl.trim()) {
    return { valid: false, error: 'baseUrl is required' };
  }

  if (typeof req.model !== 'string' || !req.model.trim()) {
    return { valid: false, error: 'model is required' };
  }

  if (!Array.isArray(req.messages)) {
    return { valid: false, error: 'messages must be an array' };
  }

  for (const msg of req.messages) {
    if (!msg || typeof msg !== 'object' || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
      return { valid: false, error: 'Each message must have a string role and content' };
    }
  }

  return { valid: true };
}

export function validateCredentialInput(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Credential input must be an object' };
  }

  const cred = input as Record<string, unknown>;

  if (typeof cred.profileId !== 'string' || !cred.profileId.trim()) {
    return { valid: false, error: 'profileId is required' };
  }

  if (typeof cred.apiKey !== 'string' || !cred.apiKey.trim()) {
    return { valid: false, error: 'apiKey is required' };
  }

  return { valid: true };
}

export function validateString(input: unknown, name: string): ValidationResult {
  if (typeof input !== 'string' || !input.trim()) {
    return { valid: false, error: `${name} must be a non-empty string` };
  }
  return { valid: true };
}

function isStrictObject(
  input: unknown,
  allowedKeys: readonly string[],
): input is Record<string, unknown> {
  return !!input
    && typeof input === 'object'
    && !Array.isArray(input)
    && Object.keys(input).every((key) => allowedKeys.includes(key));
}

export function validateSourceFileSelectionRequest(input: unknown): ValidationResult {
  if (!isStrictObject(input, ['selectionMode', 'allowedKinds', 'maximumFileCount'])) {
    return { valid: false, error: 'Source selection request must contain only supported fields' };
  }
  if (input.selectionMode !== 'single' && input.selectionMode !== 'multiple') {
    return { valid: false, error: 'selectionMode is invalid' };
  }
  if (
    !Number.isSafeInteger(input.maximumFileCount)
    || (input.maximumFileCount as number) < 1
    || (input.maximumFileCount as number) > SOURCE_MAXIMUM_FILE_COUNT
    || (input.selectionMode === 'single' && input.maximumFileCount !== 1)
  ) {
    return { valid: false, error: 'maximumFileCount is invalid' };
  }
  if (!Array.isArray(input.allowedKinds) || input.allowedKinds.length === 0) {
    return { valid: false, error: 'allowedKinds must be a non-empty array' };
  }
  const kinds = input.allowedKinds;
  const allowed = new Set<string>([...SOURCE_FILE_KINDS, 'any-supported']);
  if (
    kinds.some((kind) => typeof kind !== 'string' || !allowed.has(kind))
    || new Set(kinds).size !== kinds.length
    || (kinds.includes('any-supported') && kinds.length !== 1)
  ) {
    return { valid: false, error: 'allowedKinds contains unsupported values' };
  }
  return { valid: true };
}

export function validateStagingToken(input: unknown): ValidationResult {
  if (
    typeof input !== 'string'
    || input.length === 0
    || input.length > SOURCE_STAGING_TOKEN_MAX_LENGTH
    || !/^[a-f0-9]{64}$/.test(input)
  ) {
    return { valid: false, error: 'stagingToken is invalid' };
  }
  return { valid: true };
}

export function validateAssetFinalisationRequest(input: unknown): ValidationResult {
  if (!isStrictObject(input, ['stagingToken'])) {
    return { valid: false, error: 'Finalisation request must contain only stagingToken' };
  }
  return validateStagingToken(input.stagingToken);
}
