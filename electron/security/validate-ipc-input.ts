import { DesktopAIRequest, DesktopCredentialInput } from '../types/desktop-api.js';

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
