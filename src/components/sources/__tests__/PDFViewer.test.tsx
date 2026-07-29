import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createGrant: vi.fn(),
  revokeGrant: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock('../../../desktop/desktopBridge', () => ({
  desktopBridge: {
    createPdfViewerGrant: mocked.createGrant,
    revokePdfViewerGrant: mocked.revokeGrant,
  },
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mocked.getDocument,
}));

import { PDFViewer } from '../PDFViewer';

const asset = {
  id: 'asset-1',
  userId: 'user-a',
  contentHash: 'a'.repeat(64),
  mimeType: 'application/pdf',
  extension: 'pdf',
  byteSize: 1_000,
  relativePath: `assets/aa/${'a'.repeat(64)}.pdf`,
  createdAt: 1,
};
const version = {
  id: 'version-1',
  userId: 'user-a',
  sourceId: 'source-1',
  versionNumber: 1,
  assetId: asset.id,
  originalFilename: 'lesson.pdf',
  versionReason: 'import' as const,
  processorFingerprint: 'pdf',
  status: 'ready' as const,
  pageCount: 3,
  lineCount: null,
  segmentCount: 3,
  charCount: 30,
  errorCode: null,
  errorMessage: null,
  createdAt: 1,
  readyAt: 2,
};
const segments = [1, 2, 3].map((physicalPage) => ({
  id: `segment-${physicalPage}`,
  userId: 'user-a',
  sourceId: 'source-1',
  sourceVersionId: version.id,
  ordinal: physicalPage,
  segmentType: 'pdf_page' as const,
  text: `page ${physicalPage}`,
  textHash: 'b'.repeat(64),
  heading: null,
  physicalPage,
  printedPageLabel: physicalPage === 2 ? 'ii' : null,
  lineStart: null,
  lineEnd: null,
  timeStartMs: null,
  timeEndMs: null,
  boundingBox: null,
  confidence: null,
  extractionMethod: 'pdf_text' as const,
  createdAt: 1,
}));

beforeEach(() => {
  mocked.createGrant.mockReset();
  mocked.revokeGrant.mockReset();
  mocked.getDocument.mockReset();
  mocked.createGrant.mockResolvedValue({
    ok: true,
    value: {
      sourceVersionId: version.id,
      url: `aether-asset://pdf/${'c'.repeat(64)}`,
      expiresAt: Date.now() + 1_000,
    },
  });
  mocked.revokeGrant.mockResolvedValue({ revoked: true });
  mocked.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    }),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({} as CanvasRenderingContext2D);
});

describe('PDF viewer navigation', () => {
  it('opens only through an opaque grant and navigates physical pages accessibly', async () => {
    const onPageChange = vi.fn();
    const { unmount } = render(
      <PDFViewer
        asset={asset}
        version={version}
        segments={segments}
        initialPage={1}
        onPageChange={onPageChange}
      />,
    );
    await waitFor(() => expect(mocked.getDocument).toHaveBeenCalled());
    expect(mocked.createGrant).toHaveBeenCalledWith({
      sourceVersionId: version.id,
      assetRelativePath: asset.relativePath,
      contentHash: asset.contentHash,
      byteSize: asset.byteSize,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next PDF page' }));
    await waitFor(() => expect(screen.getByDisplayValue('2')).toBeInTheDocument());
    expect(screen.getByText(/Printed page label:/)).toHaveTextContent('ii');
    fireEvent.keyDown(screen.getByRole('region', { name: 'PDF viewer' }), { key: 'End' });
    await waitFor(() => expect(screen.getByDisplayValue('3')).toBeInTheDocument());
    expect(onPageChange).toHaveBeenCalledWith(3);
    unmount();
    await waitFor(() => expect(mocked.revokeGrant).toHaveBeenCalledWith({
      url: `aether-asset://pdf/${'c'.repeat(64)}`,
    }));
  });
});
