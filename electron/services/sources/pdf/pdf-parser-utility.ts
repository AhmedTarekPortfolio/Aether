import { extractPdf } from './pdf-parser.js';
import type {
  PdfUtilityCancelRequest,
  PdfUtilityJobRequest,
  PdfUtilityMessage,
} from '../../../types/pdf.js';

const port = process.parentPort;
if (!port) throw new Error('PDF parser utility requires an Electron parent port');

const cancelled = new Set<string>();
let active = false;

port.postMessage({ type: 'ready' } satisfies PdfUtilityMessage);

port.on('message', async (event) => {
  const message = event.data as PdfUtilityJobRequest | PdfUtilityCancelRequest;
  if (message.type === 'cancel') {
    cancelled.add(message.cancellationToken);
    return;
  }
  if (message.type !== 'extract' || active) return;
  active = true;
  try {
    const result = await extractPdf(message.request, message.absolutePath, {
      isCancelled: () => cancelled.has(message.request.cancellationToken),
      onProgress: (progress) => {
        port.postMessage({ type: 'progress', progress } satisfies PdfUtilityMessage);
      },
    });
    port.postMessage({ type: 'result', result } satisfies PdfUtilityMessage);
  } catch {
    process.exit(86);
  }
});
