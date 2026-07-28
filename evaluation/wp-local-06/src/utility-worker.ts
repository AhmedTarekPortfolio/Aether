import { extractPdf } from './extractor.js';
import type {
  UtilityCancelRequest,
  UtilityEnvironmentEvidence,
  UtilityJobRequest,
  UtilityMessage,
} from './contracts.js';

const port = process.parentPort;
if (!port) throw new Error('Utility worker requires Electron parentPort');

const cancelledTokens = new Set<string>();
const evidence: UtilityEnvironmentEvidence = {
  processType: process.type,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  hasDocument: typeof globalThis.document !== 'undefined',
  hasWindow: typeof globalThis.window !== 'undefined',
  hasIndexedDb: typeof globalThis.indexedDB !== 'undefined',
  hasLocalStorage: typeof globalThis.localStorage !== 'undefined',
  inheritedEnvironmentKeys: Object.keys(process.env).sort(),
};

port.postMessage({ type: 'ready', evidence } satisfies UtilityMessage);

port.on('message', async (event) => {
  const message = event.data as UtilityJobRequest | UtilityCancelRequest;
  if (message.type === 'cancel') {
    cancelledTokens.add(message.cancellationToken);
    return;
  }
  if (message.type !== 'extract') return;
  if (message.debugAction === 'crash') {
    process.exit(86);
    return;
  }
  if (message.debugAction === 'timeout') {
    await new Promise(() => {});
    return;
  }
  if (message.debugAction === 'invalid-output') {
    port.postMessage({
      type: 'invalid-result',
      value: {
        jobId: `${message.request.jobId}-mismatch`,
        status: 'completed',
        pageCount: 1,
        pages: [{ ordinal: 999, text: 'invalid', boundingBoxes: [{ x: NaN }] }],
      },
    } satisfies UtilityMessage);
    return;
  }
  const result = await extractPdf(message.request, message.absolutePath, {
    isCancelled: () => cancelledTokens.has(message.request.cancellationToken),
    delayPerPageMs: message.debugDelayPerPageMs,
    onProgress: (progress) => {
      port.postMessage({ type: 'progress', progress } satisfies UtilityMessage);
    },
  });
  port.postMessage({ type: 'result', result } satisfies UtilityMessage);
});
