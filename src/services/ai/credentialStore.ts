import { AIProviderCredentials } from '../../types';
import { aetherTransport, CredentialStatus } from './aetherTransport';

// In-Memory Session Credential Map (retained for in-memory session access and test mocks)
const memoryCredentials: Map<string, AIProviderCredentials> = new Map();

/**
 * Masks API Key for safe UI display (shows last 4 chars if length > 4).
 */
export function maskApiKey(apiKey?: string): string {
  if (!apiKey || apiKey.trim() === '') return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••••••${trimmed.slice(-4)}`;
}

/**
 * Retrieves runtime credentials for a provider profile ID.
 * Checks in-memory session map first (populated on save), or returns empty credentials.
 */
export function getCredentials(profileId: string): AIProviderCredentials {
  if (!profileId) return {};
  return memoryCredentials.get(profileId) || {};
}

/**
 * Saves credentials for a profile via the secure server-side store and updates in-memory map.
 */
export async function saveCredentials(
  profileId: string,
  credentials: AIProviderCredentials,
  _remember?: boolean
): Promise<void> {
  if (!profileId || !credentials.apiKey) return;

  const trimmedCreds: AIProviderCredentials = {
    apiKey: credentials.apiKey.trim(),
    organizationId: credentials.organizationId?.trim(),
  };

  memoryCredentials.set(profileId, trimmedCreds);

  try {
    const result = await aetherTransport.saveCredential(
      profileId,
      trimmedCreds.apiKey!,
      trimmedCreds.organizationId
    );
    if (!result.success) {
      throw new Error('Credential could not be saved securely.');
    }
  } catch (error) {
    memoryCredentials.delete(profileId);
    throw error;
  }
}

/**
 * Removes credentials for a profile from in-memory map and server-side store.
 */
export async function clearCredentials(profileId: string): Promise<void> {
  if (!profileId) return;
  memoryCredentials.delete(profileId);
  await aetherTransport.deleteCredential(profileId);
}

/**
 * Check if a credential is configured for a profile (returns mask, never raw key).
 */
export async function getCredentialStatus(profileId: string): Promise<CredentialStatus> {
  if (!profileId) return { configured: false, mask: '' };
  const mem = memoryCredentials.get(profileId);
  if (mem && mem.apiKey) {
    return { configured: true, mask: maskApiKey(mem.apiKey) };
  }
  return aetherTransport.getCredentialStatus(profileId);
}
