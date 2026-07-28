import { describe, it, expect } from 'vitest';
import {
  validateAIRequest,
  validateAssetFinalisationRequest,
  validateReadManagedTextAssetRequest,
  validateCredentialInput,
  validateSourceFileSelectionRequest,
  validateStagingToken,
  validateString,
} from '../security/validate-ipc-input.js';

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

  it('strictly validates bounded source selection requests', () => {
    expect(validateSourceFileSelectionRequest({
      selectionMode: 'multiple',
      allowedKinds: ['text', 'pdf'],
      maximumFileCount: 2,
    }).valid).toBe(true);
    expect(validateSourceFileSelectionRequest({
      selectionMode: 'single',
      allowedKinds: ['any-supported'],
      maximumFileCount: 1,
    }).valid).toBe(true);

    for (const input of [
      null,
      {},
      { selectionMode: 'single', allowedKinds: ['text'], maximumFileCount: 0 },
      { selectionMode: 'single', allowedKinds: ['text'], maximumFileCount: 2 },
      { selectionMode: 'multiple', allowedKinds: ['text'], maximumFileCount: 21 },
      { selectionMode: 'multiple', allowedKinds: ['exe'], maximumFileCount: 1 },
      { selectionMode: 'multiple', allowedKinds: [], maximumFileCount: 1 },
      { selectionMode: 'multiple', allowedKinds: ['any-supported', 'pdf'], maximumFileCount: 1 },
      { selectionMode: 'multiple', allowedKinds: ['pdf', 'pdf'], maximumFileCount: 1 },
      {
        selectionMode: 'multiple',
        allowedKinds: ['pdf'],
        maximumFileCount: 1,
        absolutePath: 'C:\\private.pdf',
      },
    ]) {
      expect(validateSourceFileSelectionRequest(input).valid).toBe(false);
    }
  });

  it('accepts only exact opaque tokens and strict finalisation objects', () => {
    const token = 'a'.repeat(64);
    expect(validateStagingToken(token).valid).toBe(true);
    expect(validateAssetFinalisationRequest({ stagingToken: token }).valid).toBe(true);
    for (const invalid of ['', 'a'.repeat(129), '../token', 'A'.repeat(64), 42]) {
      expect(validateStagingToken(invalid).valid).toBe(false);
    }
    expect(validateAssetFinalisationRequest({
      stagingToken: token,
      contentHash: 'b'.repeat(64),
    }).valid).toBe(false);
  });

  it('strictly validates managed text read identities without accepting absolute paths', () => {
    const hash = 'a'.repeat(64);
    expect(validateReadManagedTextAssetRequest({
      relativePath: `assets/aa/${hash}.txt`,
      expectedContentHash: hash,
    })).toBe(true);
    for (const input of [
      null,
      { relativePath: `assets/aa/${hash}.txt` },
      { relativePath: 'C:\\private.txt', expectedContentHash: hash },
      { relativePath: '../private.txt', expectedContentHash: hash },
      { relativePath: `assets/aa/${hash}.txt`, expectedContentHash: 'A'.repeat(64) },
      { relativePath: `assets/aa/${hash}.txt`, expectedContentHash: hash, encoding: 'utf16' },
    ]) {
      expect(validateReadManagedTextAssetRequest(input)).toBe(false);
    }
  });
});
