export function validateProviderUrl(targetUrl: string, providerType: string): { valid: boolean; error?: string; hostname?: string } {
  try {
    const url = new URL(targetUrl);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Protocol must be http: or https:' };
    }

    if (url.username || url.password) {
      return { valid: false, error: 'URLs containing credentials are not allowed' };
    }

    const hostname = url.hostname.toLowerCase();
    const blockedHostnames = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200'];
    if (blockedHostnames.includes(hostname)) {
      return { valid: false, error: 'Access to cloud metadata IPs is forbidden' };
    }

    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
    const isCloudProvider = ['openai', 'openai_compatible', 'openrouter', 'anthropic', 'gemini', 'nvidia_nim'].includes(providerType);
    const isLocalProvider = ['ollama', 'lmstudio'].includes(providerType);

    if (isCloudProvider && !isLocalhost) {
      if (url.protocol !== 'https:') {
        return { valid: false, error: 'Cloud providers must use HTTPS' };
      }

      const isPrivateIp = /^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\./.test(hostname);
      if (isPrivateIp) {
        return { valid: false, error: 'Private IPs are not allowed for cloud provider types' };
      }

      if (providerType === 'nvidia_nim' && hostname !== 'integrate.api.nvidia.com' && !hostname.includes('nvcf')) {
        return { valid: false, error: 'Invalid hostname for nvidia_nim' };
      }
      
      if (providerType === 'anthropic' && hostname !== 'api.anthropic.com' && !hostname.includes('.')) {
        return { valid: false, error: 'Invalid hostname for anthropic' };
      }

      if (providerType === 'gemini' && hostname !== 'generativelanguage.googleapis.com' && !hostname.includes('.')) {
        return { valid: false, error: 'Invalid hostname for gemini' };
      }
    }

    return { valid: true, hostname };
  } catch (err) {
    return { valid: false, error: 'Invalid URL format' };
  }
}
