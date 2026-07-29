import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { SourceAsset, SourceSegment, SourceVersion } from '../../types';
import { desktopBridge } from '../../desktop/desktopBridge';
import { Button } from '../ui/Button';

interface PDFViewerProps {
  asset: SourceAsset;
  version: SourceVersion;
  segments: SourceSegment[];
  initialPage?: number;
  onPageChange?: (page: number) => void;
}

export function PDFViewer({
  asset,
  version,
  segments,
  initialPage = 1,
  onPageChange,
}: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [grantUrl, setGrantUrl] = useState('');
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [scale, setScale] = useState(1.2);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let loaded: PDFDocumentProxy | null = null;
    let url = '';
    setBusy(true);
    setError('');
    desktopBridge.createPdfViewerGrant({
      sourceVersionId: version.id,
      assetRelativePath: asset.relativePath,
      contentHash: asset.contentHash,
      byteSize: asset.byteSize,
    }).then(async (grant) => {
      if (!grant.ok) throw new Error(grant.error.message);
      url = grant.value.url;
      setGrantUrl(url);
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      loaded = await pdfjs.getDocument({
        url,
        isEvalSupported: false,
        useSystemFonts: false,
      }).promise;
      if (disposed) {
        await loaded.destroy();
        return;
      }
      setDocument(loaded);
      setPage((current) => Math.min(Math.max(1, current), loaded!.numPages));
      setBusy(false);
    }).catch((caught) => {
      if (!disposed) {
        setBusy(false);
        setError(caught instanceof Error ? caught.message : 'The PDF could not be opened.');
      }
    });
    return () => {
      disposed = true;
      renderTask.current?.cancel();
      void loaded?.destroy();
      if (url) void desktopBridge.revokePdfViewerGrant({ url });
    };
  }, [asset.byteSize, asset.contentHash, asset.relativePath, version.id]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let disposed = false;
    renderTask.current?.cancel();
    document.getPage(page).then((pdfPage) => {
      if (disposed || !canvasRef.current) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const task = pdfPage.render({
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      renderTask.current = task;
      return task.promise;
    }).catch((caught) => {
      if (!disposed && (caught as Error)?.name !== 'RenderingCancelledException') {
        setError('This PDF page could not be rendered.');
      }
    });
    return () => {
      disposed = true;
      renderTask.current?.cancel();
    };
  }, [document, page, scale]);

  useEffect(() => {
    onPageChange?.(page);
  }, [onPageChange, page]);

  function goTo(next: number) {
    const count = document?.numPages ?? version.pageCount ?? 1;
    setPage(Math.min(count, Math.max(1, next)));
  }

  const segment = segments.find((candidate) => candidate.physicalPage === page);
  const pageCount = document?.numPages ?? version.pageCount ?? 0;

  return (
    <section
      className="space-y-3"
      aria-label="PDF viewer"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'PageUp' || event.key === 'ArrowLeft') goTo(page - 1);
        if (event.key === 'PageDown' || event.key === 'ArrowRight') goTo(page + 1);
        if (event.key === 'Home') goTo(1);
        if (event.key === 'End') goTo(pageCount);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Previous PDF page"
            disabled={page <= 1}
            icon={<ChevronLeft className="h-4 w-4" />}
            onClick={() => goTo(page - 1)}
          >
            Previous
          </Button>
          <label className="flex items-center gap-1 text-xs">
            <span>Physical page</span>
            <input
              type="number"
              min={1}
              max={pageCount || 1}
              value={page}
              onChange={(event) => goTo(Number(event.target.value))}
              className="w-16 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-secondary)] p-1.5 text-center"
            />
            <span>of {pageCount || '…'}</span>
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Next PDF page"
            disabled={!pageCount || page >= pageCount}
            icon={<ChevronRight className="h-4 w-4" />}
            onClick={() => goTo(page + 1)}
          >
            Next
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Zoom PDF out"
            icon={<ZoomOut className="h-4 w-4" />}
            disabled={scale <= 0.6}
            onClick={() => setScale((value) => Math.max(0.6, value - 0.2))}
          />
          <span className="min-w-12 text-center text-xs">{Math.round(scale * 100)}%</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Zoom PDF in"
            icon={<ZoomIn className="h-4 w-4" />}
            disabled={scale >= 2.4}
            onClick={() => setScale((value) => Math.min(2.4, value + 0.2))}
          />
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        Physical page {page} of {pageCount}.
        {segment?.printedPageLabel ? ` Printed label ${segment.printedPageLabel}.` : ''}
      </p>
      {segment?.printedPageLabel && (
        <p className="text-xs text-[var(--text-secondary)]">
          Printed page label: <strong>{segment.printedPageLabel}</strong>
        </p>
      )}
      {error && <p role="alert" className="text-sm text-[var(--accent-rose)]">{error}</p>}
      <div className="max-h-[56vh] overflow-auto rounded-xl border border-[var(--border-glass)] bg-[#525659] p-4 text-center">
        {busy && <p className="py-12 text-sm text-white">Opening the managed PDF…</p>}
        <canvas
          ref={canvasRef}
          className="mx-auto max-w-none bg-white shadow-xl"
          aria-label={`Rendered PDF physical page ${page}`}
        />
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        The viewer uses a short-lived PDF-only capability. Managed paths and tokens are not shown.
        {grantUrl ? ' Viewer access is active.' : ''}
      </p>
    </section>
  );
}
