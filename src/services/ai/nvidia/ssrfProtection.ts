import { NvidiaNimEndpointProfile } from './types';

const ALLOWED_HOSTED_DOMAINS = [
  'integrate.api.nvidia.com',
  'api.nvcf.nvidia.com',
];

const BLOCKED_IP_PATTERNS = [
  /^169\.254\./, // Cloud Metadata Link-Local
  /^0\./,        // Current network
];

const FORBIDDEN_HEADERS = new Set([
  'host',
  'origin',
  'cookie',
  'authorization',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
]);

/**
 * Validates target URL against SSRF rules, protocol limits, and domain allowlists.
 */
export function validateNvidiaUrl(baseUrl: string, endpointPath: string, profile: Partial<NvidiaNimEndpointProfile>): { valid: boolean; fullUrl: string; error?: string } {
  if (!baseUrl || !baseUrl.trim()) {
    return { valid: false, fullUrl: '', error: 'Base URL is required.' };
  }

  const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
  const trimmedPath = (endpointPath || '').trim().replace(/^\/+/, '');
  const fullUrl = trimmedPath ? `${trimmedBase}/${trimmedPath}` : trimmedBase;

  let parsed: URL;
  try {
    parsed = new URL(fullUrl);
  } catch {
    return { valid: false, fullUrl: '', error: 'Invalid URL format.' };
  }

  // 1. Protocol Check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, fullUrl: '', error: `Unsupported protocol '${parsed.protocol}'. Only http: and https: are allowed.` };
  }

  // 2. Reject embedded credentials (user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, fullUrl: '', error: 'URL contains embedded credentials which are strictly forbidden.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Reject Link-Local Cloud Metadata IPs
  if (BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname)) || hostname === 'metadata.google.internal') {
    return { valid: false, fullUrl: '', error: 'Access to cloud metadata endpoints is strictly blocked.' };
  }

  // 4. Host Validation (Hosted NVIDIA vs NVCF vs Self-Hosted / Localhost)
  const isHostedNvidia = hostname === 'integrate.api.nvidia.com' || hostname.endsWith('.invocation.api.nvcf.nvidia.com') || hostname === 'api.nvcf.nvidia.com';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (isLocalhost) {
    if (!profile.isSelfHosted && !profile.allowLocalhost) {
      return { valid: false, fullUrl: '', error: 'Localhost endpoints are blocked unless marked as Self-Hosted NIM in profile settings.' };
    }
  } else if (!isHostedNvidia && profile.source === 'nvidia_build') {
    return { valid: false, fullUrl: '', error: `Source 'nvidia_build' requires integrate.api.nvidia.com, got '${hostname}'.` };
  }

  return { valid: true, fullUrl };
}

/**
 * Sanitizes static headers to prevent header injection and CRLF attacks.
 */
export function sanitizeNvidiaHeaders(staticHeaders?: Record<string, string>): Record<string, string> {
  if (!staticHeaders) return {};

  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(staticHeaders)) {
    if (!key || !key.trim()) continue;

    const lowerKey = key.trim().toLowerCase();

    // Check CRLF injection
    if (/[\r\n]/.test(key) || /[\r\n]/.test(value || '')) {
      continue; // Drop dangerous header
    }

    // Check forbidden headers
    if (FORBIDDEN_HEADERS.has(lowerKey)) {
      continue; // Drop restricted header
    }

    clean[key.trim()] = (value || '').trim();
  }

  return clean;
}
