import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProviderProfiles,
  getActiveProviderProfile,
  setActiveProviderProfile,
  saveProfile,
  deleteProfile,
  sanitizeProfileForExport,
  LOCAL_PROVIDER_ID,
  DEFAULT_LOCAL_PROFILE,
} from '../providerProfiles';
import { maskApiKey, getCredentials } from '../credentialStore';
import { aetherTransport } from '../aetherTransport';

describe('AI Provider Profiles Management (src/services/ai/providerProfiles.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setActiveProviderProfile(LOCAL_PROVIDER_ID);
    vi.spyOn(aetherTransport, 'saveCredential').mockResolvedValue({ success: true, mask: '••••test' });
  });

  it('1. Returns default local profile initially', () => {
    const active = getActiveProviderProfile();
    expect(active.id).toBe(LOCAL_PROVIDER_ID);
    expect(active.type).toBe('local');
  });

  it('2. Masks API keys correctly for privacy', () => {
    expect(maskApiKey('')).toBe('');
    expect(maskApiKey('1234')).toBe('••••');
    expect(maskApiKey('sk-proj-1234567890abcdef')).toBe('••••••••cdef');
  });

  it('3. Creates and saves a new custom provider profile with separate credentials', () => {
    const newProf = saveProfile(
      {
        name: 'My Custom vLLM',
        type: 'openai_compatible',
        baseUrl: 'http://localhost:8000/v1',
        modelId: 'mistral-7b',
        temperature: 0.7,
        rememberApiKey: true,
      },
      { apiKey: 'sk-secret-123' }
    );

    expect(newProf.id).toBeDefined();
    const profiles = getProviderProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(2);
    expect(profiles.some((p) => p.name === 'My Custom vLLM')).toBe(true);

    const creds = getCredentials(newProf.id);
    expect(creds.apiKey).toBe('sk-secret-123');
  });

  it('4. Switches active provider profile safely', () => {
    const saved = saveProfile({
      name: 'Anthropic Claude Profile',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      modelId: 'claude-3-5-haiku',
      temperature: 0.5,
    });

    const active = setActiveProviderProfile(saved.id);
    expect(active.id).toBe(saved.id);
    expect(active.name).toBe('Anthropic Claude Profile');
  });

  it('5. Deleting an active profile falls back locally without silently deleting credentials', () => {
    const saved = saveProfile(
      {
        name: 'Temporary Profile',
        type: 'openai',
        modelId: 'gpt-4o',
        temperature: 0.7,
      },
      { apiKey: 'sk-temp-key' }
    );

    setActiveProviderProfile(saved.id);
    expect(getActiveProviderProfile().id).toBe(saved.id);

    deleteProfile(saved.id);

    const fallbackActive = getActiveProviderProfile();
    expect(fallbackActive.id).toBe(LOCAL_PROVIDER_ID);
    expect(getCredentials(saved.id).apiKey).toBe('sk-temp-key');
  });

  it('6. Disallows deleting the default local offline profile', () => {
    deleteProfile(LOCAL_PROVIDER_ID);
    const profiles = getProviderProfiles();
    expect(profiles.some((p) => p.id === LOCAL_PROVIDER_ID)).toBe(true);
  });

  it('7. Sanitizes configuration for export (removes rememberApiKey preference)', () => {
    const prof = DEFAULT_LOCAL_PROFILE;
    const sanitized = sanitizeProfileForExport(prof);
    expect(sanitized.rememberApiKey).toBeUndefined();
    expect(sanitized.name).toBe('Local Offline Synthesizer');
  });

  it('8. Guarantees backup export profiles exclude API keys and authorization secrets', () => {
    const saved = saveProfile(
      {
        name: 'Export Test Profile',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o',
        temperature: 0.7,
        rememberApiKey: true,
      },
      { apiKey: 'sk-export-secret-key-123', organizationId: 'org-abc' }
    );

    const exported = sanitizeProfileForExport(saved);
    const serialized = JSON.stringify(exported);

    expect(serialized).not.toContain('sk-export-secret-key-123');
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('authorization');
  });
});
