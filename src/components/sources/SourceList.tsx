import { AlertCircle, FileText, RefreshCw, Trash2 } from 'lucide-react';
import type { SourceLibraryEntry } from '../../services/sources';
import { Button } from '../ui/Button';

interface SourceListProps {
  entries: SourceLibraryEntry[];
  onOpen: (entry: SourceLibraryEntry) => void;
  onRetry: (entry: SourceLibraryEntry) => void;
  onDiscard: (entry: SourceLibraryEntry) => void;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'No managed file';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function SourceList({ entries, onOpen, onRetry, onDiscard }: SourceListProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-glass-hover)] p-10 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
        <p className="font-medium text-[var(--text-primary)]">No imported text sources yet</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Import TXT, Markdown, or pasted text to build your local source library.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-label="Imported sources">
      {entries.map((entry) => {
        const ready = entry.version?.status === 'ready' && Boolean(entry.segment);
        const associations = entry.associations.map(
          (association) => `${association.targetType}: ${association.label}`,
        ).concat(entry.pendingContextLabels);
        return (
          <article
            key={entry.source.id}
            className="rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-secondary)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
                  <h3 className="truncate font-semibold text-[var(--text-primary)]">
                    {entry.source.displayName}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {entry.source.sourceType === 'pasted-text'
                    ? 'Pasted text'
                    : entry.source.sourceType === 'markdown' ? 'Markdown' : 'TXT'}
                  {' • '}
                  {entry.version?.status ?? 'pending'}
                </p>
              </div>
              {!ready && <AlertCircle className="h-5 w-5 text-[var(--accent-amber)]" />}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[var(--text-muted)]">Original file</dt>
                <dd className="mt-0.5 truncate text-[var(--text-primary)]">
                  {entry.version?.originalFilename ?? 'Pasted directly'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">File size</dt>
                <dd className="mt-0.5 text-[var(--text-primary)]">
                  {formatBytes(entry.asset?.byteSize)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Text</dt>
                <dd className="mt-0.5 text-[var(--text-primary)]">
                  {(entry.version?.charCount ?? 0).toLocaleString()} characters
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Search index</dt>
                <dd className="mt-0.5 text-[var(--text-primary)]">{entry.chunkCount} chunks</dd>
              </div>
            </dl>

            <p className="mt-3 line-clamp-2 text-xs text-[var(--text-secondary)]">
              {associations.join(' • ') || 'No associations'}
            </p>
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              Created {new Date(entry.source.createdAt).toLocaleString()}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {ready ? (
                <Button size="sm" onClick={() => onOpen(entry)}>Open source</Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => onRetry(entry)}
                  >
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => onDiscard(entry)}
                  >
                    Discard failed import
                  </Button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
