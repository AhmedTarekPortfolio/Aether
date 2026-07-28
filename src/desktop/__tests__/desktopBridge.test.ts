import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDesktop } from '../isDesktop';
import { desktopBridge } from '../desktopBridge';

describe('Desktop Bridge & Runtime Detection', () => {
  beforeEach(() => {
    delete (window as any).aetherDesktop;
    vi.restoreAllMocks();
  });

  it('detects browser mode when window.aetherDesktop is undefined', () => {
    expect(isDesktop()).toBe(false);
  });

  it('detects desktop mode when window.aetherDesktop is present', () => {
    (window as any).aetherDesktop = {
      ai: { generate: vi.fn() },
    };
    expect(isDesktop()).toBe(true);
  });

  it('routes send calls to window.aetherDesktop in desktop mode', async () => {
    const mockGenerate = vi.fn().mockResolvedValueOnce({
      content: 'Desktop AI Response',
      providerId: 'p1',
    });

    (window as any).aetherDesktop = {
      ai: { generate: mockGenerate },
    };

    const res = await desktopBridge.send({
      profileId: 'p1',
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Hi desktop' }],
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.content).toBe('Desktop AI Response');
  });

  it('routes credential set calls to window.aetherDesktop in desktop mode', async () => {
    const mockSet = vi.fn().mockResolvedValueOnce({ success: true, mask: '••••••••4F2A' });

    (window as any).aetherDesktop = {
      credentials: { set: mockSet },
    };

    const res = await desktopBridge.saveCredential('p1', 'nvapi-secret-key', 'org-1');
    expect(mockSet).toHaveBeenCalledWith({
      profileId: 'p1',
      apiKey: 'nvapi-secret-key',
      organizationId: 'org-1',
    });
    expect(res.mask).toBe('••••••••4F2A');
  });

  it('keeps a desktop stream pending until the real completion event and cleans up the listener', async () => {
    let emitChunk: ((chunk: any) => void) | undefined;
    const unlisten = vi.fn();
    const stream = vi.fn((_request, onChunk) => {
      emitChunk = onChunk;
      return unlisten;
    });
    (window as any).aetherDesktop = { ai: { stream, cancel: vi.fn() } };

    const handlers = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };
    let settled = false;
    const pending = desktopBridge.stream({
      requestId: 'req_stable',
      profileId: 'p1',
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com',
      endpoint: '/v1/chat/completions',
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Stream' }],
    }, handlers).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(stream.mock.calls[0][0].requestId).toBe('req_stable');

    emitChunk?.({ requestId: 'req_stable', type: 'token', text: 'Aether ' });
    emitChunk?.({ requestId: 'req_stable', type: 'done', content: 'Aether works' });
    await pending;

    expect(handlers.onToken).toHaveBeenCalledWith('Aether ');
    expect(handlers.onComplete).toHaveBeenCalledWith('Aether works', undefined);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('cancels the same upstream request ID and removes the stream listener', async () => {
    const unlisten = vi.fn();
    const cancel = vi.fn().mockResolvedValue(undefined);
    (window as any).aetherDesktop = {
      ai: { stream: vi.fn(() => unlisten), cancel },
    };
    const controller = new AbortController();

    const pending = desktopBridge.stream({
      requestId: 'req_cancel',
      profileId: 'p1',
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com',
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Cancel' }],
    }, {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }, controller.signal);

    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(cancel).toHaveBeenCalledWith('req_cancel');
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('routes source storage only through the narrow desktop namespace', async () => {
    const selectAndStage = vi.fn().mockResolvedValue({
      ok: true,
      value: { cancelled: true, receipts: [] },
    });
    (window as any).aetherDesktop = { sources: { selectAndStage } };
    const request = {
      selectionMode: 'single' as const,
      allowedKinds: ['text'] as ['text'],
      maximumFileCount: 1,
    };

    await expect(desktopBridge.selectAndStageSources(request)).resolves.toEqual({
      ok: true,
      value: { cancelled: true, receipts: [] },
    });
    expect(selectAndStage).toHaveBeenCalledWith(request);
  });

  it('fails safely in browser mode without invoking the browser File API', async () => {
    const result = await desktopBridge.selectAndStageSources({
      selectionMode: 'single',
      allowedKinds: ['any-supported'],
      maximumFileCount: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'DESKTOP_CAPABILITY_UNAVAILABLE',
        message: 'Managed source storage is available only in the desktop application.',
      },
    });
    expect(await desktopBridge.getSourceStorageCapabilities()).toMatchObject({
      available: false,
      maximumFileCount: 0,
    });
  });
});
