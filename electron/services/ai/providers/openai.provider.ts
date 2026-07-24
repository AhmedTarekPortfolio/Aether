import { DesktopAIRequest, DesktopAIResponse, DesktopTestResult, DesktopModelOption } from '../../../types/desktop-api.js';

export class OpenAIDesktopProvider {
  public id = 'openai';
  public name = 'OpenAI Compatible Provider';

  public async generate(request: DesktopAIRequest, apiKey: string, signal?: AbortSignal): Promise<DesktopAIResponse> {
    const baseUrl = (request.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const targetUrl = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const messages = request.systemInstruction
      ? [{ role: 'system', content: request.systemInstruction }, ...request.messages]
      : request.messages;

    const body: Record<string, unknown> = {
      ...request.extraBody,
      model: request.model || 'gpt-4o-mini',
      messages,
      temperature: request.temperature ?? 0.7,
      stream: false,
    };

    if (request.maxTokens) body.max_tokens = request.maxTokens;

    const res = await fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error('OpenAI Authentication failed: Invalid API key.');
      }
      throw new Error(`OpenAI API Error (${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    return {
      content: choice?.content || '',
      reasoning: choice?.reasoning || choice?.reasoning_content || undefined,
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
    const baseUrl = (request.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const targetUrl = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const messages = request.systemInstruction
      ? [{ role: 'system', content: request.systemInstruction }, ...request.messages]
      : request.messages;

    const body: Record<string, unknown> = {
      ...request.extraBody,
      model: request.model || 'gpt-4o-mini',
      messages,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.maxTokens) body.max_tokens = request.maxTokens;

    const res = await fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI Stream Error (${res.status}): ${errText.slice(0, 120)}`);
    }

    if (!res.body) {
      const full = await this.generate(request, apiKey, signal);
      onChunk(full.content, full.reasoning);
      return full;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedReasoning = '';

    while (true) {
      if (signal?.aborted) {
        void reader.cancel().catch(() => undefined);
        throw new Error('Streaming cancelled by user.');
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
          // Ignore
        }
      }
    }

    return { content: accumulatedContent, reasoning: accumulatedReasoning || undefined };
  }

  public async testConnection(baseUrl: string, apiKey: string, model?: string): Promise<DesktopTestResult> {
    const startTime = Date.now();
    try {
      await this.generate(
        {
          requestId: 'test',
          profileId: 'test',
          providerType: 'openai',
          baseUrl,
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Ping' }],
          maxTokens: 1,
        },
        apiKey
      );
      const latencyMs = Date.now() - startTime;
      return { success: true, status: 'Connected', message: `OpenAI connected successfully (${latencyMs}ms latency).`, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return { success: false, status: 'Provider unreachable', message: err.message || 'Could not connect.', latencyMs };
    }
  }

  public async listModels(baseUrl: string, apiKey: string): Promise<DesktopModelOption[]> {
    const targetUrl = `${(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/models`;
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(targetUrl, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      const rawList = Array.isArray(data.data) ? data.data : [];
      return rawList.map((m: any) => ({ id: m.id, name: m.id, description: m.owned_by ? `By ${m.owned_by}` : undefined }));
    } catch {
      return [];
    }
  }
}
