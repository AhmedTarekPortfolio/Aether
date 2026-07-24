import { DesktopAIRequest, DesktopAIResponse, DesktopTestResult, DesktopModelOption } from '../../../types/desktop-api.js';

export class NvidiaDesktopProvider {
  public id = 'nvidia_nim';
  public name = 'NVIDIA NIM Platform API';

  private validateUrl(urlStr: string): { valid: boolean; error?: string } {
    try {
      const u = new URL(urlStr);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return { valid: false, error: 'Only HTTP/HTTPS URLs allowed' };
      }
      if (u.hostname === '169.254.169.254' || u.hostname.includes('metadata')) {
        return { valid: false, error: 'Blocked metadata endpoint' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid NVIDIA endpoint URL' };
    }
  }

  private requireHostedCredential(baseUrl: string, apiKey: string): void {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if ((hostname === 'integrate.api.nvidia.com' || hostname.endsWith('.api.nvidia.com')) && !apiKey.trim()) {
      throw new Error('[INVALID_CONFIGURATION] An NVIDIA API key is not configured.');
    }
  }

  private buildEndpointUrl(baseUrl: string, endpoint = '/v1/chat/completions'): string {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (normalizedBase.endsWith('/v1') && normalizedEndpoint.startsWith('/v1/')) {
      return `${normalizedBase}${normalizedEndpoint.slice(3)}`;
    }
    return `${normalizedBase}${normalizedEndpoint}`;
  }

  public async generate(request: DesktopAIRequest, apiKey: string, signal?: AbortSignal): Promise<DesktopAIResponse> {
    const baseUrl = request.baseUrl.replace(/\/+$/, '');
    const endpoint = request.endpoint || '/v1/chat/completions';
    const targetUrl = this.buildEndpointUrl(baseUrl, endpoint);

    const urlCheck = this.validateUrl(targetUrl);
    if (!urlCheck.valid) {
      throw new Error(`[INVALID_CONFIGURATION] NVIDIA Security Error: ${urlCheck.error}`);
    }
    this.requireHostedCredential(baseUrl, apiKey);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const messages = request.systemInstruction
      ? [{ role: 'system', content: request.systemInstruction }, ...request.messages]
      : request.messages;

    const body: Record<string, unknown> = {
      ...request.extraBody,
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.7,
      stream: false,
    };

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens;
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error('[AUTHENTICATION_ERROR] NVIDIA Authentication failed: the API key was rejected.');
      } else if (res.status === 404) {
        throw new Error(`[MODEL_NOT_FOUND] NVIDIA model '${request.model}' or endpoint '${endpoint}' was not found.`);
      } else if (res.status === 429) {
        throw new Error('[RATE_LIMITED] NVIDIA rate limit reached.');
      }
      throw new Error(`[PROVIDER_ERROR] NVIDIA API error (${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    const content = choice?.content || data.output?.[0]?.text || '';
    const reasoning = choice?.reasoning || choice?.reasoning_content || undefined;

    return {
      content,
      reasoning,
      model: data.model || request.model,
      finishReason: data.choices?.[0]?.finish_reason,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      providerId: request.profileId,
      providerName: this.name,
    };
  }

  public async stream(
    request: DesktopAIRequest,
    apiKey: string,
    onChunk: (text?: string, reasoning?: string) => void,
    signal?: AbortSignal
  ): Promise<{ content: string; reasoning?: string }> {
    const baseUrl = request.baseUrl.replace(/\/+$/, '');
    const endpoint = request.endpoint || '/v1/chat/completions';
    const targetUrl = this.buildEndpointUrl(baseUrl, endpoint);

    const urlCheck = this.validateUrl(targetUrl);
    if (!urlCheck.valid) {
      throw new Error(`[INVALID_CONFIGURATION] NVIDIA Security Error: ${urlCheck.error}`);
    }
    this.requireHostedCredential(baseUrl, apiKey);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const messages = request.systemInstruction
      ? [{ role: 'system', content: request.systemInstruction }, ...request.messages]
      : request.messages;

    const body: Record<string, unknown> = {
      ...request.extraBody,
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens;
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error('[AUTHENTICATION_ERROR] NVIDIA Authentication failed: the API key was rejected.');
      }
      if (res.status === 404) {
        throw new Error(`[MODEL_NOT_FOUND] NVIDIA model '${request.model}' or endpoint '${endpoint}' was not found.`);
      }
      if (res.status === 429) {
        throw new Error('[RATE_LIMITED] NVIDIA rate limit reached.');
      }
      throw new Error(`[PROVIDER_ERROR] NVIDIA stream error (${res.status}): ${errText.slice(0, 120)}`);
    }

    if (!res.body) {
      const fullRes = await this.generate(request, apiKey, signal);
      onChunk(fullRes.content, fullRes.reasoning);
      return fullRes;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedReasoning = '';

    while (true) {
      if (signal?.aborted) {
        void reader.cancel().catch(() => undefined);
        throw new Error('NVIDIA Generation cancelled by user.');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        if (trimmed === 'data: [DONE]') break;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          const tokenText = delta?.content || '';
          const tokenReasoning = delta?.reasoning || delta?.reasoning_content || '';

          if (tokenText || tokenReasoning) {
            accumulatedContent += tokenText;
            accumulatedReasoning += tokenReasoning;
            onChunk(tokenText || undefined, tokenReasoning || undefined);
          }
        } catch {
          // Ignore partial SSE JSON
        }
      }
    }

    return { content: accumulatedContent, reasoning: accumulatedReasoning || undefined };
  }

  public async testConnection(baseUrl: string, apiKey: string, model?: string, endpoint?: string, signal?: AbortSignal): Promise<DesktopTestResult> {
    const startTime = Date.now();
    try {
      const res = await this.generate(
        {
          requestId: 'test',
          profileId: 'test',
          providerType: 'nvidia_nim',
          baseUrl,
          endpoint: endpoint || '/v1/chat/completions',
          model: model || 'deepseek-ai/deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Ping' }],
          maxTokens: 1,
        },
        apiKey,
        signal
      );

      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        status: 'Connected',
        message: `NVIDIA NIM connected successfully (${latencyMs}ms latency).`,
        code: 'CONNECTED',
        providerId: 'nvidia_nim',
        modelId: model || 'deepseek-ai/deepseek-v4-flash',
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const codeMatch = String(err.message || '').match(/^\[([A-Z_]+)\]/);
      const code = codeMatch?.[1] || (err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
      return {
        success: false,
        status: code,
        code,
        providerId: 'nvidia_nim',
        modelId: model || 'deepseek-ai/deepseek-v4-flash',
        message: String(err.message || 'Unable to connect to NVIDIA NIM endpoint.').replace(/^\[[A-Z_]+\]\s*/, ''),
        latencyMs,
      };
    }
  }

  public async listModels(baseUrl: string, apiKey: string): Promise<DesktopModelOption[]> {
    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/v1/models`;
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(targetUrl, { headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('[AUTHENTICATION_ERROR] The NVIDIA API key was rejected.');
        }
        throw new Error(`[PROVIDER_ERROR] NVIDIA model listing failed (${res.status}).`);
      }
      const data = await res.json();
      const rawList = Array.isArray(data.data) ? data.data : [];
      const models = rawList.map((m: any) => ({
        id: m.id,
        name: m.id,
        providerId: 'nvidia_nim',
        description: m.owned_by ? `By ${m.owned_by}` : undefined,
      }));
      if (models.length === 0) {
        throw new Error('[PROVIDER_ERROR] NVIDIA returned no models.');
      }
      return models;
    } catch (error) {
      throw error;
    }
  }
}
