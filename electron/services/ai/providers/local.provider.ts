import { DesktopAIRequest, DesktopAIResponse, DesktopTestResult, DesktopModelOption } from '../../../types/desktop-api.js';

export class LocalDesktopProvider {
  public id = 'local';
  public name = 'Local Offline Synthesizer';

  public async generate(request: DesktopAIRequest): Promise<DesktopAIResponse> {
    const lastMsg = request.messages[request.messages.length - 1]?.content || '';
    const content = `[Aether Local Synthesizer]\nHere is an offline summary response for your prompt:\n"${lastMsg}"\n\nNote: For advanced AI reasoning or external model connectivity, configure an active AI provider in Aether Settings.`;

    return {
      content,
      model: 'aether-local-v1',
      finishReason: 'stop',
      providerId: request.profileId,
      providerName: this.name,
    };
  }

  public async testConnection(): Promise<DesktopTestResult> {
    return {
      success: true,
      status: 'Connected',
      message: 'Local Offline Synthesizer is operational.',
      latencyMs: 0,
    };
  }

  public async listModels(): Promise<DesktopModelOption[]> {
    return [{ id: 'aether-local-v1', name: 'Aether Local Offline Synthesizer v1' }];
  }
}
