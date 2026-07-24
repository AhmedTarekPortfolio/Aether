import {
  AIProviderAdapter,
  AIRequest,
  AIStreamHandlers,
  AIProviderResponse,
  AIModelOption,
  AIConnectionTestResult,
} from '../types';
import { AIProviderProfile } from '../../../types';
import { getCredentials } from '../credentialStore';
import { buildSystemInstruction } from '../systemPrompts';
import { SSEStreamParser } from '../streaming/sseParser';
import { NvidiaNimEndpointProfile, NvidiaApiErrorCode } from '../nvidia/types';
import { validateNvidiaUrl, sanitizeNvidiaHeaders } from '../nvidia/ssrfProtection';
import { validateAndSanitizeParameters } from '../nvidia/parameterValidator';
import { NVIDIA_NIM_PRESETS } from '../nvidia/presets';

export class NvidiaNimAdapter implements AIProviderAdapter {
  id = 'nvidia_nim';
  name = 'NVIDIA NIM Platform API';
  supportsStreaming = true;
  supportsModelDiscovery = true;

  private resolveEndpointProfile(profileConfig: AIProviderProfile): NvidiaNimEndpointProfile {
    // Merge standard AIProviderProfile with stored or preset NIM endpoint profile
    const preset = NVIDIA_NIM_PRESETS.find((p) => p.modelId === profileConfig.modelId || p.id === profileConfig.id) || NVIDIA_NIM_PRESETS[0];

    const baseUrl = profileConfig.baseUrl || preset.baseUrl;
    const isSelfHosted = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

    return {
      ...preset,
      id: profileConfig.id,
      displayName: profileConfig.name || preset.displayName,
      modelId: profileConfig.modelId || preset.modelId,
      baseUrl,
      isSelfHosted,
      allowLocalhost: isSelfHosted,
      parameterValues: {
        temperature: profileConfig.temperature,
        max_tokens: profileConfig.maxOutputTokens,
      },
    };
  }

  private getAuthHeaders(nimProfile: NvidiaNimEndpointProfile, profileId: string): Record<string, string> {
    const creds = getCredentials(profileId);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const apiKey = creds.apiKey?.trim();

    if (apiKey) {
      if (nimProfile.authStrategy === 'x_api_key') {
        headers['x-api-key'] = apiKey;
      } else if (nimProfile.authStrategy === 'api_key_header' && nimProfile.headerName) {
        headers[nimProfile.headerName] = apiKey;
      } else if (nimProfile.authStrategy !== 'none') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    const cleanStatic = sanitizeNvidiaHeaders(nimProfile.staticHeaders);
    return { ...cleanStatic, ...headers };
  }

  async generate(request: AIRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    const { messages, profileConfig } = request;
    const nimProfile = this.resolveEndpointProfile(profileConfig);

    // SSRF URL Validation
    const urlValidation = validateNvidiaUrl(nimProfile.baseUrl, nimProfile.endpointPath, nimProfile);
    if (!urlValidation.valid) {
      throw new Error(`NVIDIA Security Violation: ${urlValidation.error}`);
    }

    // Parameter Validation & Prototype Pollution Guard
    const paramValidation = validateAndSanitizeParameters(nimProfile.configurableParameters, nimProfile.parameterValues);
    if (!paramValidation.valid) {
      throw new Error(`Invalid Model Parameters: ${paramValidation.errors.join(' ')}`);
    }

    const systemPrompt = buildSystemInstruction(request);
    const headers = this.getAuthHeaders(nimProfile, profileConfig.id);

    let body: any;

    if (nimProfile.requestFormat === 'anthropic_messages') {
      body = {
        model: nimProfile.modelId,
        messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        system: systemPrompt,
        max_tokens: profileConfig.maxOutputTokens || 1024,
        temperature: profileConfig.temperature ?? 0.7,
        ...paramValidation.cleanParams,
      };
    } else if (nimProfile.requestFormat === 'nvidia_ranking') {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      body = {
        model: nimProfile.modelId,
        query: { text: lastUserMsg },
        passages: [{ text: 'Sample passage for ranking evaluation.' }],
        ...paramValidation.cleanParams,
      };
    } else if (nimProfile.requestFormat === 'nvidia_embeddings') {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      body = {
        model: nimProfile.modelId,
        input: [lastUserMsg],
        encoding_format: 'float',
        ...paramValidation.cleanParams,
      };
    } else {
      // Default OpenAI Chat / Responses schema
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      body = {
        model: nimProfile.modelId,
        messages: apiMessages,
        temperature: profileConfig.temperature ?? 0.7,
        ...paramValidation.cleanParams,
      };

      if (profileConfig.maxOutputTokens) {
        body.max_tokens = profileConfig.maxOutputTokens;
      }
    }

    try {
      const response = await fetch(urlValidation.fullUrl, {
        method: nimProfile.httpMethod || 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new Error('NVIDIA Authentication failed: Invalid API key or unassigned NIM capability.');
        } else if (response.status === 404) {
          throw new Error(`NVIDIA Model '${nimProfile.modelId}' or endpoint '${nimProfile.endpointPath}' not found (404).`);
        } else {
          throw new Error(`NVIDIA API Error (${response.status}): ${errText.slice(0, 120) || response.statusText}`);
        }
      }

      const data = await response.json();
      let content = '';

      if (nimProfile.requestFormat === 'nvidia_ranking') {
        const rankings = data.rankings || data.data || [];
        content = `Reranking Results:\n` + rankings.map((r: any, i: number) => `${i + 1}. Index ${r.index} (Score: ${r.logit || r.score})`).join('\n');
      } else if (nimProfile.requestFormat === 'nvidia_embeddings') {
        const embeddings = data.data?.[0]?.embedding || [];
        content = `Generated Embedding Vector (${embeddings.length} dimensions).`;
      } else if (nimProfile.requestFormat === 'anthropic_messages') {
        content = data.content?.[0]?.text || '';
      } else {
        content = data.choices?.[0]?.message?.content || data.output?.[0]?.text || data.response || '';
      }

      return {
        content,
        providerId: profileConfig.id,
        providerName: nimProfile.displayName,
        modelId: nimProfile.modelId,
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw new Error('NVIDIA Generation cancelled by user.');
      }
      throw new Error(err.message || 'Failed to connect to NVIDIA NIM endpoint.');
    }
  }

  async stream(request: AIRequest, handlers: AIStreamHandlers, signal?: AbortSignal): Promise<void> {
    const { messages, profileConfig } = request;
    const nimProfile = this.resolveEndpointProfile(profileConfig);

    const urlValidation = validateNvidiaUrl(nimProfile.baseUrl, nimProfile.endpointPath, nimProfile);
    if (!urlValidation.valid) {
      handlers.onError(new Error(`NVIDIA Security Violation: ${urlValidation.error}`));
      return;
    }

    const paramValidation = validateAndSanitizeParameters(nimProfile.configurableParameters, nimProfile.parameterValues);
    const systemPrompt = buildSystemInstruction(request);
    const headers = this.getAuthHeaders(nimProfile, profileConfig.id);

    const body: Record<string, any> = {
      model: nimProfile.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: profileConfig.temperature ?? 0.7,
      stream: true,
      ...paramValidation.cleanParams,
    };

    if (profileConfig.maxOutputTokens) {
      body.max_tokens = profileConfig.maxOutputTokens;
    }

    try {
      const response = await fetch(urlValidation.fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new Error('NVIDIA Authentication failed: Invalid API Key.');
        }
        throw new Error(`NVIDIA Stream API Error (${response.status}): ${errText.slice(0, 120)}`);
      }

      if (!response.body) {
        const res = await this.generate(request, signal);
        handlers.onToken(res.content);
        handlers.onComplete(res.content);
        return;
      }

      const reader = response.body.getReader();
      const parser = new SSEStreamParser();
      let accumulatedText = '';

      while (true) {
        if (signal?.aborted) {
          reader.cancel().catch(() => {});
          handlers.onError(new Error('NVIDIA Streaming cancelled by user.'));
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const { tokens, isDone } = parser.parseChunk(value);
        for (const token of tokens) {
          accumulatedText += token;
          handlers.onToken(token);
        }

        if (isDone) break;
      }

      const flushedTokens = parser.flush();
      for (const token of flushedTokens) {
        accumulatedText += token;
        handlers.onToken(token);
      }

      handlers.onComplete(accumulatedText);
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        handlers.onError(new Error('NVIDIA Streaming cancelled by user.'));
      } else {
        handlers.onError(err);
      }
    }
  }

  async testConnection(profileConfig: AIProviderProfile, signal?: AbortSignal): Promise<AIConnectionTestResult> {
    const nimProfile = this.resolveEndpointProfile(profileConfig);
    const startTime = Date.now();

    const urlValidation = validateNvidiaUrl(nimProfile.baseUrl, nimProfile.endpointPath, nimProfile);
    if (!urlValidation.valid) {
      return {
        success: false,
        status: 'Configuration error',
        message: `Security Violation: ${urlValidation.error}`,
        latencyMs: 0,
      };
    }

    try {
      // For self-hosted NIM, attempt health readiness check if specified
      if (nimProfile.isSelfHosted) {
        const healthUrl = `${nimProfile.baseUrl.replace(/\/+$/, '')}/v1/health/ready`;
        try {
          const healthRes = await fetch(healthUrl, { method: 'GET', signal });
          if (healthRes.ok) {
            const latencyMs = Date.now() - startTime;
            return {
              success: true,
              status: 'Connected',
              message: `Self-Hosted NIM readiness check passed (${latencyMs}ms latency).`,
              latencyMs,
            };
          }
        } catch {
          // Fall back to inference connection test
        }
      }

      const res = await this.generate(
        {
          messages: [{ role: 'user', content: 'Ping' }],
          mode: 'chat',
          profileConfig: { ...profileConfig, maxOutputTokens: 2 },
        },
        signal
      );

      const latencyMs = Date.now() - startTime;

      if (res.content) {
        return {
          success: true,
          status: 'Connected',
          message: `NVIDIA NIM Endpoint connected successfully (${latencyMs}ms latency).`,
          latencyMs,
        };
      }

      return {
        success: false,
        status: 'Unsupported response format',
        message: 'Endpoint returned an empty or unparseable response payload.',
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;

      if (err.message?.includes('Authentication failed')) {
        return {
          success: false,
          status: 'Authentication failed',
          message: 'API Key or authorization credentials were rejected by NVIDIA NIM (401/403).',
          latencyMs,
        };
      }

      if (err.message?.includes('not found')) {
        return {
          success: false,
          status: 'Model not found',
          message: `Endpoint URL or model ID '${nimProfile.modelId}' was not found (404).`,
          latencyMs,
        };
      }

      if (err.message?.includes('Failed to fetch')) {
        return {
          success: false,
          status: 'Network unavailable',
          message: 'Network error contacting NVIDIA NIM endpoint.',
          latencyMs,
        };
      }

      return {
        success: false,
        status: 'Network unavailable',
        message: err.message || 'Unable to connect to NVIDIA NIM endpoint.',
        latencyMs,
      };
    }
  }

  async listModels(profileConfig: AIProviderProfile, signal?: AbortSignal): Promise<AIModelOption[]> {
    const nimProfile = this.resolveEndpointProfile(profileConfig);
    const baseUrl = nimProfile.baseUrl.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/v1/models`;

    const urlValidation = validateNvidiaUrl(baseUrl, '/v1/models', nimProfile);
    if (!urlValidation.valid) return [];

    try {
      const headers = this.getAuthHeaders(nimProfile, profileConfig.id);
      const response = await fetch(endpoint, { method: 'GET', headers, signal });

      if (!response.ok) return [];

      const data = await response.json();
      const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

      const models: AIModelOption[] = rawList
        .map((m: any) => ({
          id: typeof m === 'string' ? m : m.id || m.name,
          name: typeof m === 'string' ? m : m.id || m.name,
          description: m.owned_by ? `Owned by ${m.owned_by}` : undefined,
        }))
        .filter((m: AIModelOption) => m.id && typeof m.id === 'string');

      const seen = new Set<string>();
      return models.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } catch {
      return [];
    }
  }
}
