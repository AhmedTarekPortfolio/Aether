import { DesktopAIRequest, DesktopAIResponse, DesktopTestResult, DesktopModelOption } from '../../../types/desktop-api.js';

export class AnthropicDesktopProvider {
  public id = 'anthropic';
  public name = 'Anthropic Claude Provider';

  public async generate(request: DesktopAIRequest, apiKey: string, signal?: AbortSignal): Promise<DesktopAIResponse> {
    const baseUrl = (request.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const targetUrl = `${baseUrl}/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };

    const body = {
      model: request.model || 'claude-3-5-haiku-20241022',
      messages: request.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      system: request.systemInstruction,
      max_tokens: request.maxTokens || 1024,
      temperature: request.temperature ?? 0.7,
    };

    const res = await fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error('Anthropic Authentication failed: Invalid API key.');
      }
      throw new Error(`Anthropic API Error (${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '';

    return {
      content,
      model: data.model || request.model,
      finishReason: data.stop_reason,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      providerId: request.profileId,
      providerName: this.name,
    };
  }

  public async testConnection(baseUrl: string, apiKey: string, model?: string): Promise<DesktopTestResult> {
    const startTime = Date.now();
    try {
      await this.generate(
        {
          requestId: 'test',
          profileId: 'test',
          providerType: 'anthropic',
          baseUrl,
          model: model || 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'Ping' }],
          maxTokens: 5,
        },
        apiKey
      );
      const latencyMs = Date.now() - startTime;
      return { success: true, status: 'Connected', message: `Anthropic connected successfully (${latencyMs}ms latency).`, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return { success: false, status: 'Provider unreachable', message: err.message || 'Could not connect.', latencyMs };
    }
  }

  public async listModels(): Promise<DesktopModelOption[]> {
    return [];
  }
}
