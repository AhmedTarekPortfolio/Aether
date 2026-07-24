import { describe, it, expect } from 'vitest';
import { normalizeAIError } from '../errorTaxonomy';

describe('AI Error Taxonomy (FocusForge Architecture - src/services/ai/errorTaxonomy.ts)', () => {
  it('normalizes 401/403 authentication failures', () => {
    const err = normalizeAIError(new Error('NVIDIA Authentication failed (401)'));
    expect(err.code).toBe('INVALID_API_KEY');
    expect(err.title).toBe('Authentication Failed');
    expect(err.isRetryable).toBe(false);
  });

  it('normalizes rate limit 429 errors', () => {
    const err = normalizeAIError(new Error('Provider rate limit exceeded 429'));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.title).toBe('Rate Limit Exceeded');
    expect(err.isRetryable).toBe(true);
  });

  it('normalizes cancellation errors', () => {
    const err = normalizeAIError(new Error('Generation request cancelled by user'));
    expect(err.code).toBe('CANCELLED');
    expect(err.title).toBe('Request Cancelled');
  });
});
