import type { Response as ExpressResponse } from 'express';

export async function proxyStream(
  response: globalThis.Response,
  expressRes: ExpressResponse,
  providerType: string
): Promise<void> {
  expressRes.setHeader('Content-Type', 'text/event-stream');
  expressRes.setHeader('Cache-Control', 'no-cache');
  expressRes.setHeader('Connection', 'keep-alive');

  if (!response.body) {
    expressRes.end();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const cleanup = () => {
    reader.cancel().catch(() => {});
  };
  expressRes.on('close', cleanup);

  let fullContent = '';
  let fullReasoning = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        
        if (dataStr === '[DONE]') {
          expressRes.write(`data: ${JSON.stringify({ type: 'done', content: fullContent, reasoning: fullReasoning })}\n\n`);
          continue;
        }

        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);

          if (['openai', 'openai_compatible', 'openrouter', 'nvidia_nim', 'ollama', 'lmstudio'].includes(providerType)) {
            const delta = parsed.choices?.[0]?.delta;
            if (delta) {
              if (delta.content) {
                fullContent += delta.content;
                expressRes.write(`data: ${JSON.stringify({ type: 'token', text: delta.content })}\n\n`);
              }
              const reasoning = delta.reasoning || delta.reasoning_content;
              if (reasoning) {
                fullReasoning += reasoning;
                expressRes.write(`data: ${JSON.stringify({ type: 'reasoning', text: reasoning })}\n\n`);
              }
            }
          } else if (providerType === 'anthropic') {
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              expressRes.write(`data: ${JSON.stringify({ type: 'token', text: parsed.delta.text })}\n\n`);
            } else if (parsed.type === 'message_stop') {
              expressRes.write(`data: ${JSON.stringify({ type: 'done', content: fullContent, reasoning: fullReasoning })}\n\n`);
            }
          }
        } catch (err) {
          // Ignore parse errors for partial chunks
        }
      }
    }
  } catch (err) {
    console.error('Stream processing error', err);
  } finally {
    expressRes.end();
    expressRes.removeListener('close', cleanup);
  }
}
