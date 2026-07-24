export function redactSecrets(text: string): string {
  return text
    .replace(/nvapi-[a-zA-Z0-9_-]+/g, 'nvapi-••••REDACTED')
    .replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-••••REDACTED')
    .replace(/Bearer [^\s"']+/g, 'Bearer ••••REDACTED')
    .replace(/Authorization:\s*[^\s"']+/g, 'Authorization: ••••REDACTED')
    .replace(/x-api-key:\s*[^\s"']+/g, 'x-api-key: ••••REDACTED')
    .replace(/key=[^&\s"']+/g, 'key=••••REDACTED');
}

export function redactForLog(obj: Record<string, any>): Record<string, any> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => (typeof item === 'object' ? redactForLog(item) : item));
  }

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      redacted[key] = redactSecrets(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactForLog(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
