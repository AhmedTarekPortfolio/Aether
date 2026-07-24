import { DesktopAIRequest, DesktopAIResponse, DesktopTestResult, DesktopModelOption } from '../../../types/desktop-api.js';

export class GeminiDesktopProvider {
  public id = 'gemini';
  public name = 'Google Gemini Provider';

  public async generate(request: DesktopAIRequest, apiKey: string, signal?: AbortSignal): Promise<DesktopAIResponse> {
    const baseUrl = (request.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const model = request.model || 'gemini-1.5-flash';
    const targetUrl = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const contents: any[] = [];
    if (request.systemInstruction) {
      contents.push({ role: 'user', parts: [{ text: `[System Instructions]\n${request.systemInstruction}` }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }
    for (const msg of request.messages) {
      contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 400 || res.status === 403) {
        throw new Error('Google Gemini Authentication failed: Invalid API Key.');
      }
      throw new Error(`Gemini Error (${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    return {
      content,
      model,
      finishReason: candidate?.finishReason,
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
          providerType: 'gemini',
          baseUrl,
          model: model || 'gemini-1.5-flash',
          messages: [{ role: 'user', content: 'Ping' }],
        },
        apiKey
      );
      const latencyMs = Date.now() - startTime;
      return { success: true, status: 'Connected', message: `Google Gemini connected successfully (${latencyMs}ms latency).`, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return { success: false, status: 'Provider unreachable', message: err.message || 'Could not connect.', latencyMs };
    }
  }

  public async listModels(): Promise<DesktopModelOption[]> {
    return [];
  }
}
