import { Router, Request, Response } from 'express';
import { getApiKey, getOrganizationId, saveCredential, deleteCredential, getCredentialStatus, maskKey } from '../services/credentialStore.js';
import { validateProviderUrl } from '../services/urlValidator.js';
import { redactForLog, redactSecrets } from '../services/secretRedaction.js';
import { proxyStream } from '../services/streamProxy.js';

export const aiRouter = Router();

aiRouter.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const { profileId, providerType, baseUrl, endpoint, model, messages, systemInstruction, temperature, maxTokens, stream, extraBody } = req.body;

  if (!profileId || !providerType || !baseUrl || !model || !messages) {
    res.status(400).json({ error: 'invalid-request', message: 'Missing required fields.' });
    return;
  }

  const apiKey = getApiKey(profileId);
  const isLocal = ['local', 'ollama', 'lmstudio'].includes(providerType);
  if (!apiKey && !isLocal) {
    res.status(401).json({ error: 'missing-api-key', message: 'No API key configured for this profile.' });
    return;
  }

  let targetUrl = '';
  if (['openai', 'openai_compatible', 'openrouter', 'ollama', 'lmstudio'].includes(providerType)) {
    targetUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  } else if (providerType === 'nvidia_nim') {
    targetUrl = `${baseUrl.replace(/\/$/, '')}${endpoint || '/chat/completions'}`;
  } else if (providerType === 'anthropic') {
    targetUrl = `${baseUrl.replace(/\/$/, '')}/messages`;
  } else if (providerType === 'gemini') {
    targetUrl = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`;
  }

  const urlVal = validateProviderUrl(targetUrl, providerType);
  if (!urlVal.valid) {
    res.status(400).json({ error: 'invalid-provider-url', message: urlVal.error });
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (['openai', 'openai_compatible', 'openrouter', 'ollama', 'lmstudio', 'nvidia_nim'].includes(providerType) && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    if (providerType === 'openai') {
      const orgId = getOrganizationId(profileId);
      if (orgId) headers['OpenAI-Organization'] = orgId;
    }
  } else if (providerType === 'anthropic' && apiKey) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  let requestBody: any = {};
  if (['openai', 'openai_compatible', 'openrouter', 'ollama', 'lmstudio', 'nvidia_nim'].includes(providerType)) {
    const finalMessages = systemInstruction 
      ? [{ role: 'system', content: systemInstruction }, ...messages] 
      : messages;
    
    requestBody = {
      ...extraBody,
      model,
      messages: finalMessages,
      temperature,
      max_tokens: maxTokens,
      stream: !!stream
    };
  } else if (providerType === 'anthropic') {
    requestBody = {
      model,
      messages,
      system: systemInstruction,
      max_tokens: maxTokens || 1024,
      temperature
    };
    if (stream) requestBody.stream = true;
  } else if (providerType === 'gemini') {
    const contents = [];
    if (systemInstruction) {
      contents.push({ role: 'user', parts: [{ text: systemInstruction }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }
    for (const msg of messages) {
      contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
    }
    requestBody = { contents };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const startTime = Date.now();

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      console.error(redactSecrets(`[AI Proxy] Upstream error: ${upstreamRes.status} ${errText}`));
      
      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        res.status(401).json({ error: 'authentication-failed', message: 'The provider rejected the API key or it lacks permissions.' });
      } else if (upstreamRes.status === 404) {
        res.status(404).json({ error: 'model-not-found', message: 'The selected model is unavailable or not found.' });
      } else if (upstreamRes.status === 429) {
        res.status(429).json({ error: 'rate-limited', message: 'Rate limited by provider.' });
      } else {
        res.status(502).json({ error: 'provider-error', message: 'The provider returned an error response.' });
      }
      return;
    }

    if (stream && providerType !== 'gemini') {
      await proxyStream(upstreamRes, res, providerType);
      return;
    }

    const data = await upstreamRes.json();
    let normalizedRes: any = {};

    if (['openai', 'openai_compatible', 'openrouter', 'ollama', 'lmstudio', 'nvidia_nim'].includes(providerType)) {
      normalizedRes = {
        content: data.choices?.[0]?.message?.content || '',
        reasoning: data.choices?.[0]?.message?.reasoning || data.choices?.[0]?.message?.reasoning_content,
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens
        }
      };
    } else if (providerType === 'anthropic') {
      normalizedRes = {
        content: data.content?.[0]?.text || '',
        model: data.model,
        finishReason: data.stop_reason,
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens
        }
      };
    } else if (providerType === 'gemini') {
      const candidate = data.candidates?.[0];
      normalizedRes = {
        content: candidate?.content?.parts?.[0]?.text || '',
        model: model,
        finishReason: candidate?.finishReason
      };
    }

    res.status(200).json(normalizedRes);
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[AI Proxy] Request failed:`, redactForLog({ error: err.message, providerType, hostname: urlVal.hostname }));
    
    if (err.name === 'AbortError') {
      res.status(504).json({ error: 'timeout', message: 'The provider did not respond within the timeout.' });
    } else if (err.message?.includes('fetch') || err.message?.includes('network')) {
      res.status(502).json({ error: 'provider-unreachable', message: 'Aether could not reach the provider network.' });
    } else {
      res.status(502).json({ error: 'invalid-response', message: 'The provider returned an invalid response.' });
    }
  }
});

aiRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  const { profileId, providerType, baseUrl, model } = req.body;
  
  const apiKey = getApiKey(profileId);
  const isLocal = ['local', 'ollama', 'lmstudio'].includes(providerType);
  if (!apiKey && !isLocal) {
    res.json({ success: false, status: 'missing-api-key', message: 'No API key configured.' });
    return;
  }

  let targetUrl = baseUrl.replace(/\/$/, '');
  if (['openai', 'openai_compatible', 'openrouter', 'ollama', 'lmstudio'].includes(providerType)) {
    targetUrl += '/chat/completions';
  } else if (providerType === 'nvidia_nim') {
    targetUrl += '/chat/completions';
  } else if (providerType === 'anthropic') {
    targetUrl += '/messages';
  } else if (providerType === 'gemini') {
    targetUrl += `/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`;
  }

  const urlVal = validateProviderUrl(targetUrl, providerType);
  if (!urlVal.valid) {
    res.json({ success: false, status: 'invalid-provider-url', message: urlVal.error });
    return;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isLocal && apiKey) {
    if (providerType === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (providerType !== 'gemini') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  let body: any = {};
  if (['openai', 'openai_compatible', 'openrouter', 'ollama', 'lmstudio', 'nvidia_nim'].includes(providerType)) {
    body = { model: model || 'unknown', messages: [{ role: 'user', content: 'Ping' }], max_tokens: 1 };
  } else if (providerType === 'anthropic') {
    body = { model: model || 'claude-3-haiku-20240307', messages: [{ role: 'user', content: 'Ping' }], max_tokens: 1 };
  } else if (providerType === 'gemini') {
    body = { contents: [{ role: 'user', parts: [{ text: 'Ping' }] }] };
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const latencyMs = Date.now() - start;

    if (response.ok) {
      res.json({ success: true, status: 'connected', message: 'Successfully connected', latencyMs });
    } else if (response.status === 401 || response.status === 403) {
      res.json({ success: false, status: 'authentication-failed', message: 'Authentication failed', latencyMs });
    } else if (response.status === 404) {
      res.json({ success: false, status: 'model-not-found', message: 'Model not found', latencyMs });
    } else {
      res.json({ success: false, status: 'invalid-response', message: `Status ${response.status}`, latencyMs });
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;
    if (err.name === 'AbortError') {
      res.json({ success: false, status: 'timeout', message: 'Request timed out', latencyMs });
    } else {
      res.json({ success: false, status: 'provider-unreachable', message: 'Unreachable', latencyMs });
    }
  }
});

aiRouter.post('/models', async (req: Request, res: Response): Promise<void> => {
  const { profileId, providerType, baseUrl } = req.body;
  const apiKey = getApiKey(profileId);
  const isLocal = ['local', 'ollama', 'lmstudio'].includes(providerType);
  
  if (!['openai', 'openai_compatible', 'openrouter', 'nvidia_nim', 'ollama', 'lmstudio'].includes(providerType)) {
    res.json({ models: [] });
    return;
  }

  let targetUrl = baseUrl.replace(/\/$/, '');
  if (providerType === 'nvidia_nim') {
    targetUrl += '/v1/models';
  } else {
    targetUrl += '/models';
  }

  const urlVal = validateProviderUrl(targetUrl, providerType);
  if (!urlVal.valid) {
    res.status(400).json({ error: 'invalid-url', message: urlVal.error });
    return;
  }

  const headers: Record<string, string> = {};
  if (!isLocal && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(targetUrl, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      res.json({ models: [] });
      return;
    }
    
    const data = await response.json();
    const models = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      description: m.description
    }));
    res.json({ models });
  } catch (err) {
    res.json({ models: [] });
  }
});

aiRouter.post('/credentials', (req: Request, res: Response) => {
  const { profileId, apiKey, organizationId } = req.body;
  if (!profileId || !apiKey) {
    res.status(400).json({ success: false, error: 'Missing profileId or apiKey' });
    return;
  }
  
  saveCredential(profileId, apiKey, organizationId);
  res.json({ success: true, mask: maskKey(apiKey) });
});

aiRouter.delete('/credentials/:profileId', (req: Request, res: Response) => {
  deleteCredential(req.params.profileId);
  res.json({ success: true });
});

aiRouter.get('/credentials/:profileId/status', (req: Request, res: Response) => {
  res.json(getCredentialStatus(req.params.profileId));
});
