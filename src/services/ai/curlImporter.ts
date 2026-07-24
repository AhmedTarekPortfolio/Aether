import { AIProviderProfile, AIProviderCredentials } from '../../types';
import { saveCredentials } from './credentialStore';
import { saveProfile } from './providerProfiles';

export interface ParsedCurlResult {
  profile: AIProviderProfile;
  credentials: AIProviderCredentials;
  rawUrl: string;
}

/**
 * Safely parses cURL command text into an AIProviderProfile configuration.
 * Automatically separates API secrets into secure credential storage.
 * Does NOT execute any pasted shell or JavaScript scripts.
 */
export function parseCurlCommand(curlText: string): ParsedCurlResult {
  if (!curlText || !curlText.trim()) {
    throw new Error('cURL command text cannot be empty.');
  }

  const cleaned = curlText.replace(/\\\n/g, ' ').replace(/\n/g, ' ').trim();

  // 1. Extract URL
  const urlMatch = cleaned.match(/https?:\/\/[^\s'"]+/);
  if (!urlMatch) {
    throw new Error('Could not find a valid HTTP/HTTPS URL in the pasted cURL command.');
  }

  const rawUrl = urlMatch[0];
  let baseUrl = rawUrl;
  let endpointPath = '';

  try {
    const u = new URL(rawUrl);
    baseUrl = u.origin;
    endpointPath = u.pathname;
  } catch {
    // Keep raw URL if URL parsing fails
  }

  // 2. Extract Authorization Secret Key
  let apiKey: string | undefined;
  const authHeaderMatch = cleaned.match(/-H\s+['"]Authorization:\s*Bearer\s+([^'"]+)['"]/i) || cleaned.match(/-H\s+['"]x-api-key:\s*([^'"]+)['"]/i);
  if (authHeaderMatch) {
    apiKey = authHeaderMatch[1].trim();
  }

  // 3. Extract JSON Payload & Model ID
  let modelId = 'custom-imported-model';
  const dataMatch = cleaned.match(/(?:-d|--data|--data-raw)\s+['"]?({[\s\S]+?})['"]?/);
  if (dataMatch) {
    try {
      const parsedJson = JSON.parse(dataMatch[1]);
      if (parsedJson.model) {
        modelId = String(parsedJson.model);
      }
    } catch {
      // Ignore JSON parse errors for malformed bodies
    }
  }

  const isNvidia = baseUrl.includes('nvidia.com');
  const type = isNvidia ? 'nvidia_nim' : 'openai_compatible';
  const name = isNvidia ? `NVIDIA — ${modelId}` : `Imported API — ${modelId}`;

  const profile: AIProviderProfile = {
    id: `prof_curl_${Date.now()}`,
    name,
    type,
    baseUrl,
    modelId,
    temperature: 0.7,
    rememberApiKey: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const credentials: AIProviderCredentials = {
    apiKey,
  };

  // Save profile and credentials securely
  saveProfile(profile, credentials);

  return {
    profile,
    credentials,
    rawUrl,
  };
}
