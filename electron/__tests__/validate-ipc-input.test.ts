import { describe, it, expect } from 'vitest';
import { validateAIRequest, validateCredentialInput, validateString } from '../security/validate-ipc-input.js';

describe('Electron IPC Input Validation', () => {
  it('validates a correct AI request input object', () => {
    const validReq = {
      requestId: 'req_123',
      profileId: 'prof_1',
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const res = validateAIRequest(validReq);
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('rejects AI request missing profileId', () => {
    const invalidReq = {
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
      messages: [],
    };

    const res = validateAIRequest(invalidReq);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('profileId');
  });

  it('rejects AI request with invalid messages array', () => {
    const invalidReq = {
      profileId: 'p1',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      messages: 'not-an-array',
    };

    const res = validateAIRequest(invalidReq);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('messages must be an array');
  });

  it('validates a correct credential input', () => {
    const res = validateCredentialInput({ profileId: 'p1', apiKey: 'nvapi-secret-key-123' });
    expect(res.valid).toBe(true);
  });

  it('rejects credential input with empty apiKey', () => {
    const res = validateCredentialInput({ profileId: 'p1', apiKey: '   ' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('apiKey is required');
  });

  it('validates non-empty string helper', () => {
    expect(validateString('hello', 'testStr').valid).toBe(true);
    expect(validateString('', 'testStr').valid).toBe(false);
  });
});
