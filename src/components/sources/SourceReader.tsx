import { useEffect, useState } from 'react';
import type { SourceLibraryEntry } from '../../services/sources';
import { Modal } from '../ui/Modal';
import { PDFViewer } from './PDFViewer';
import {
  PageRangeSelector,
  type PageRange,
} from './PageRangeSelector';

interface SourceReaderProps {
  entry: SourceLibraryEntry | null;
  initialPage?: number;
  onClose: () => void;
}

export function SourceReader({ entry, initialPage = 1, onClose }: SourceReaderProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [selection, setSelection] = useState<PageRange[]>([]);

  useEffect(() => {
    setCurrentPage(initialPage);
    setSelection([]);
  }, [entry?.source.id, initialPage]);

  const isPdf = entry?.source.sourceType === 'pdf';
  const currentSegment = entry?.segments?.find(
    (segment) => segment.physicalPage === currentPage,
  );
  const scannedPageCount = typeof entry?.latestJob?.result?.scannedPageCount === 'number'
    ? entry.latestJob.result.scannedPageCount
    : 0;

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      title={entry?.source.displayName ?? 'Source'}
      maxWidth={isPdf ? '5xl' : '2xl'}
    >
      {entry && (
        <article className="space-y-4" aria-label="Imported source reader">
          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span>{entry.source.sourceType === 'pasted-text'
              ? 'Pasted text'
              : entry.source.sourceType === 'markdown'
                ? 'Markdown'
                : entry.source.sourceType === 'pdf' ? 'PDF' : 'TXT'}</span>
            <span aria-hidden="true">•</span>
            <span>{entry.version?.charCount.toLocaleString()} characters</span>
            <span aria-hidden="true">•</span>
            <span>{entry.chunkCount} local-search chunks</span>
          </div>
          {isPdf && entry.asset && entry.version ? (
            <>
              {scannedPageCount > 0 && (
                <div className="rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 p-3 text-xs">
                  {scannedPageCount} page{scannedPageCount === 1 ? '' : 's'} appear scanned.
                  OCR is not included, so those pages may have little or no searchable text.
                </div>
              )}
              <PDFViewer
                asset={entry.asset}
                version={entry.version}
                segments={entry.segments ?? []}
                initialPage={initialPage}
                onPageChange={setCurrentPage}
              />
              <PageRangeSelector
                pageCount={entry.version.pageCount ?? entry.segments?.length ?? 0}
                currentPage={currentPage}
                value={selection}
                onChange={setSelection}
              />
              <section aria-label={`Extracted text for physical page ${currentPage}`}>
                <h4 className="mb-2 text-sm font-semibold">
                  Durable text — physical page {currentPage}
                  {currentSegment?.printedPageLabel
                    ? ` (printed label ${currentSegment.printedPageLabel})`
                    : ''}
                </h4>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-4 font-sans text-sm leading-7 text-[var(--text-primary)]">
                  {currentSegment?.text || 'No extractable text was found on this page.'}
                </pre>
              </section>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--text-secondary)]">
                Imported text is displayed as inert plain text. Markdown HTML, links, scripts, and remote
                embeds are never executed.
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-4 font-sans text-sm leading-7 text-[var(--text-primary)]">
                {entry.segment?.text ?? 'This source has no readable durable text.'}
              </pre>
            </>
          )}
        </article>
      )}
    </Modal>
  );
}
