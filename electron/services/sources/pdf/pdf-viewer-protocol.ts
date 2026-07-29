import { protocol } from 'electron';
import { getPdfViewerService } from './pdf-viewer-service.js';

let registered = false;

export function registerPdfViewerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'aether-asset',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
        allowServiceWorkers: false,
      },
    },
  ]);
}

export async function initializePdfViewerProtocol(): Promise<void> {
  if (registered) return;
  await protocol.handle('aether-asset', (request) => getPdfViewerService().handle(request));
  registered = true;
}

export async function shutdownPdfViewerProtocol(): Promise<void> {
  if (!registered) return;
  await protocol.unhandle('aether-asset');
  registered = false;
}
