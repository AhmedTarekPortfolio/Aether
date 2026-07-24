import { AIProviderProfile, AIProviderType, AIProviderCredentials } from '../../types';
import { getCredentials, saveCredentials } from './credentialStore';

export const LOCAL_PROVIDER_ID = 'provider_local_default';

export const DEFAULT_LOCAL_PROFILE: AIProviderProfile = {
  id: LOCAL_PROVIDER_ID,
  name: 'Local Offline Synthesizer',
  type: 'local',
  modelId: 'aether-local-v1',
  temperature: 0.7,
  stream: false,
  rememberApiKey: false,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const STORAGE_PROFILES_KEY = 'aether_ai_provider_profiles_v1';
const STORAGE_ACTIVE_ID_KEY = 'aether_ai_active_profile_id_v1';

let memoryProfiles: AIProviderProfile[] = [DEFAULT_LOCAL_PROFILE];
let activeProfileId: string = LOCAL_PROVIDER_ID;

/**
 * Validates provider profile configuration rules.
 */
export function validateProfileConfig(profile: Partial<AIProviderProfile>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile.name || !profile.name.trim()) {
    errors.push('Profile display name is required.');
  }

  if (profile.type !== 'local') {
    if (!profile.modelId || !profile.modelId.trim()) {
      errors.push('Model ID is required for remote AI providers.');
    }

    if (profile.baseUrl) {
      const url = profile.baseUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        errors.push('Base URL must start with http:// or https://.');
      }
      if (url.includes('@')) {
        errors.push('Credentials must not be embedded directly inside the Base URL.');
      }
    }
  }

  if (profile.temperature !== undefined) {
    if (isNaN(profile.temperature) || profile.temperature < 0 || profile.temperature > 2) {
      errors.push('Temperature must be a number between 0.0 and 2.0.');
    }
  }

  if (profile.maxOutputTokens !== undefined && profile.maxOutputTokens !== null) {
    if (isNaN(profile.maxOutputTokens) || profile.maxOutputTokens <= 0) {
      errors.push('Max output tokens must be a positive integer.');
    }
  }

  if (profile.timeoutMs !== undefined && profile.timeoutMs !== null) {
    if (isNaN(profile.timeoutMs) || profile.timeoutMs < 1000 || profile.timeoutMs > 300000) {
      errors.push('Timeout must be between 1,000 ms and 300,000 ms.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes Base URL (trims whitespace, removes trailing slashes).
 */
export function normalizeBaseUrl(url?: string): string | undefined {
  if (!url || !url.trim()) return undefined;
  return url.trim().replace(/\/+$/, '');
}

/**
 * Retrieves all provider profiles.
 */
export function getProviderProfiles(): AIProviderProfile[] {
  try {
    const stored = localStorage.getItem(STORAGE_PROFILES_KEY);
    if (stored) {
      const parsed: AIProviderProfile[] = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (!parsed.some((p) => p.id === LOCAL_PROVIDER_ID)) {
          parsed.unshift(DEFAULT_LOCAL_PROFILE);
        }
        memoryProfiles = parsed;
      }
    }
  } catch {
    // Fall back to memory
  }

  return memoryProfiles;
}

/**
 * Saves provider profiles list to localStorage without secret credentials.
 */
export function saveProviderProfiles(profiles: AIProviderProfile[]): void {
  const updated = profiles.some((p) => p.id === LOCAL_PROVIDER_ID)
    ? profiles
    : [DEFAULT_LOCAL_PROFILE, ...profiles];

  memoryProfiles = updated;

  try {
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(updated));
  } catch {
    // Storage quota exceeded
  }
}

/**
 * Gets currently active provider profile.
 */
export function getActiveProviderProfile(): AIProviderProfile {
  const profiles = getProviderProfiles();

  try {
    const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
    if (savedActiveId) {
      activeProfileId = savedActiveId;
    }
  } catch {
    // Memory fallback
  }

  const found = profiles.find((p) => p.id === activeProfileId);
  return found || DEFAULT_LOCAL_PROFILE;
}

/**
 * Sets active provider profile ID.
 */
export function setActiveProviderProfile(id: string): AIProviderProfile {
  const profiles = getProviderProfiles();
  const exists = profiles.some((p) => p.id === id);
  activeProfileId = exists ? id : LOCAL_PROVIDER_ID;

  try {
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, activeProfileId);
  } catch {
    // Memory fallback
  }

  return getActiveProviderProfile();
}

/**
 * Saves a provider profile and its separate runtime credentials.
 */
export function saveProfile(
  profileConfig: Partial<Omit<AIProviderProfile, 'createdAt' | 'updatedAt'>> & {
    name: string;
    type: AIProviderType;
    modelId: string;
  },
  credentials?: AIProviderCredentials
): AIProviderProfile {
  const validation = validateProfileConfig(profileConfig);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  const profiles = getProviderProfiles();
  const now = Date.now();

  let savedProfile: AIProviderProfile;
  const profileId = profileConfig.id || `profile_${now}_${Math.random().toString(36).slice(2, 7)}`;

  const cleanBaseUrl = normalizeBaseUrl(profileConfig.baseUrl);

  if (profileConfig.id && profiles.some((p) => p.id === profileConfig.id)) {
    const existing = profiles.find((p) => p.id === profileConfig.id)!;
    savedProfile = {
      ...existing,
      ...profileConfig,
      id: profileId,
      baseUrl: cleanBaseUrl,
      rememberApiKey: profileConfig.rememberApiKey ?? existing.rememberApiKey ?? false,
      updatedAt: now,
    };
    saveProviderProfiles(profiles.map((p) => (p.id === profileId ? savedProfile : p)));
  } else {
    savedProfile = {
      temperature: 0.7,
      rememberApiKey: false,
      ...profileConfig,
      id: profileId,
      baseUrl: cleanBaseUrl,
      createdAt: now,
      updatedAt: now,
    };
    saveProviderProfiles([...profiles, savedProfile]);
  }

  if (credentials) {
    // Credentials are now saved to server-side storage asynchronously.
    // Fire-and-forget: profile metadata save is synchronous, credential save is async.
    void saveCredentials(savedProfile.id, credentials, savedProfile.rememberApiKey).catch(() => {
      console.error('[AI Profiles] Secure credential save failed.');
    });
  }

  return savedProfile;
}

/**
 * Deletes provider metadata. Credentials remain independent and require an
 * explicit credential-removal action.
 */
export function deleteProfile(id: string): void {
  if (id === LOCAL_PROVIDER_ID) return;

  const profiles = getProviderProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  saveProviderProfiles(filtered);

  if (activeProfileId === id) {
    setActiveProviderProfile(LOCAL_PROVIDER_ID);
  }
}

/**
 * Sanitizes provider profile for export (guarantees secrets excluded).
 */
export function sanitizeProfileForExport(profile: AIProviderProfile): Partial<AIProviderProfile> {
  const { rememberApiKey, ...safe } = profile;
  return safe;
}

/**
 * Default preset configurations.
 */
export function getDefaultConfigForType(type: AIProviderType): Partial<AIProviderProfile> {
  switch (type) {
    case 'openai':
      return {
        name: 'OpenAI (Official)',
        baseUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o-mini',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'anthropic':
      return {
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1',
        modelId: 'claude-3-5-haiku-20241022',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'gemini':
      return {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        modelId: 'gemini-1.5-flash',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'openrouter':
      return {
        name: 'OpenRouter API',
        baseUrl: 'https://openrouter.ai/api/v1',
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'ollama':
      return {
        name: 'Local Ollama',
        baseUrl: 'http://localhost:11434',
        modelId: 'llama3',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'lmstudio':
      return {
        name: 'LM Studio',
        baseUrl: 'http://localhost:1234/v1',
        modelId: 'local-model',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'openai_compatible':
      return {
        name: 'Custom OpenAI Endpoint',
        baseUrl: 'http://localhost:8000/v1',
        modelId: 'custom-model',
        temperature: 0.7,
        rememberApiKey: false,
      };
    case 'nvidia_nim':
      return {
        name: 'NVIDIA Build — DeepSeek V4 Flash',
        baseUrl: 'https://integrate.api.nvidia.com',
        endpointPath: '/v1/chat/completions',
        modelId: 'deepseek-ai/deepseek-v4-flash',
        temperature: 0.7,
        stream: true,
        rememberApiKey: false,
      };
    case 'local':
    default:
      return DEFAULT_LOCAL_PROFILE;
  }
}
