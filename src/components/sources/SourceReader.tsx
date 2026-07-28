import type { SourceLibraryEntry } from '../../services/sources';
import { Modal } from '../ui/Modal';

interface SourceReaderProps {
  entry: SourceLibraryEntry | null;
  onClose: () => void;
}

export function SourceReader({ entry, onClose }: SourceReaderProps) {
  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      title={entry?.source.displayName ?? 'Source'}
      maxWidth="2xl"
    >
      {entry && (
        <article className="space-y-4" aria-label="Imported source reader">
          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span>{entry.source.sourceType === 'pasted-text' ? 'Pasted text' : entry.source.sourceType === 'markdown' ? 'Markdown' : 'TXT'}</span>
            <span aria-hidden="true">•</span>
            <span>{entry.version?.charCount.toLocaleString()} characters</span>
            <span aria-hidden="true">•</span>
            <span>{entry.chunkCount} local-search chunks</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Imported text is displayed as inert plain text. Markdown HTML, links, scripts, and remote
            embeds are never executed.
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-4 font-sans text-sm leading-7 text-[var(--text-primary)]">
            {entry.segment?.text ?? 'This source has no readable durable text.'}
          </pre>
        </article>
      )}
    </Modal>
  );
}
