import { useEffect, useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import {
  getSourceLibraryEntries,
  type SourceLibraryEntry,
} from '../../services/sources';
import {
  MAX_SELECTED_IMPORTED_SOURCES,
  type SourceEvidenceSelection,
} from '../../services/ai';
import { parsePageRanges } from '../sources/PageRangeSelector';
import { Button } from '../ui/Button';

interface SourceEvidenceSelectorProps {
  userId: string;
  subjectId: string;
  value: SourceEvidenceSelection[];
  onChange: (value: SourceEvidenceSelection[]) => void;
  disabled?: boolean;
}

export function SourceEvidenceSelector({
  userId,
  subjectId,
  value,
  onChange,
  disabled = false,
}: SourceEvidenceSelectorProps) {
  const [entries, setEntries] = useState<SourceLibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pageDrafts, setPageDrafts] = useState<Record<string, string>>({});
  const [pageErrors, setPageErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!subjectId) {
      setEntries([]);
      onChange([]);
      return;
    }
    setLoading(true);
    setLoadError('');
    getSourceLibraryEntries(userId, subjectId, 'active')
      .then((loaded) => {
        if (cancelled) return;
        const usable = loaded.filter((entry) =>
          entry.version
          && (entry.version.status === 'ready' || entry.version.status === 'partially_ready'));
        setEntries(usable);
        const available = new Set(usable.map((entry) => entry.source.id));
        const retained = value.filter((selection) => available.has(selection.sourceId));
        if (retained.length !== value.length) onChange(retained);
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setLoadError('Imported sources could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Selection pruning is intentionally tied to a newly loaded subject/library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, userId]);

  function toggle(entry: SourceLibraryEntry, checked: boolean) {
    if (checked) {
      if (value.length >= MAX_SELECTED_IMPORTED_SOURCES) return;
      onChange([...value, { sourceId: entry.source.id }]);
      return;
    }
    onChange(value.filter((selection) => selection.sourceId !== entry.source.id));
    setPageDrafts((current) => ({ ...current, [entry.source.id]: '' }));
    setPageErrors((current) => ({ ...current, [entry.source.id]: '' }));
  }

  function applyPages(entry: SourceLibraryEntry) {
    const draft = pageDrafts[entry.source.id]?.trim() ?? '';
    if (!draft) {
      onChange(value.map((selection) =>
        selection.sourceId === entry.source.id
          ? { ...selection, pageRanges: undefined }
          : selection));
      setPageErrors((current) => ({ ...current, [entry.source.id]: '' }));
      return;
    }
    try {
      const pageRanges = parsePageRanges(
        draft,
        entry.version?.pageCount ?? entry.segments?.length ?? 0,
      );
      onChange(value.map((selection) =>
        selection.sourceId === entry.source.id
          ? { ...selection, pageRanges }
          : selection));
      setPageErrors((current) => ({ ...current, [entry.source.id]: '' }));
    } catch (caught) {
      setPageErrors((current) => ({
        ...current,
        [entry.source.id]: caught instanceof Error
          ? caught.message
          : 'The page range is invalid.',
      }));
    }
  }

  return (
    <section aria-label="Imported source evidence selection" className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Imported sources ({value.length}/{MAX_SELECTED_IMPORTED_SOURCES})
        </span>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => {
            setPageDrafts({});
            setPageErrors({});
            onChange([]);
          }}
          className="text-[var(--accent-purple)] disabled:opacity-50"
        >
          Clear selection
        </button>
      </div>
      <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-[var(--border-glass)] p-2">
        {loading && (
          <p role="status" className="flex items-center gap-2 p-2 text-xs">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Loading imported sources…
          </p>
        )}
        {!loading && loadError && <p role="alert" className="p-2 text-xs text-[var(--accent-rose)]">{loadError}</p>}
        {!loading && !loadError && entries.length === 0 && (
          <p className="p-2 text-xs text-[var(--text-secondary)]">
            No active, ready imported sources are associated with this subject.
          </p>
        )}
        {entries.map((entry) => {
          const selection = value.find((candidate) => candidate.sourceId === entry.source.id);
          const selected = Boolean(selection);
          const pageSummary = selection?.pageRanges?.map((range) =>
            range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`).join(', ');
          return (
            <div key={entry.source.id} className="rounded-lg bg-[var(--bg-tertiary)] p-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Use imported source ${entry.source.displayName}`}
                  checked={selected}
                  disabled={disabled || (!selected && value.length >= MAX_SELECTED_IMPORTED_SOURCES)}
                  onChange={(event) => toggle(entry, event.target.checked)}
                />
                <span className="font-medium">{entry.source.displayName}</span>
                <span className="ml-auto text-[10px] uppercase text-[var(--text-muted)]">
                  {entry.source.sourceType}
                </span>
              </label>
              {selected && entry.source.sourceType === 'pdf' && (
                <div className="mt-2 space-y-1 pl-6">
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-[11px]">
                      <span className="mb-1 block">Optional physical pages</span>
                      <input
                        aria-label={`Physical pages for ${entry.source.displayName}`}
                        value={pageDrafts[entry.source.id] ?? pageSummary ?? ''}
                        onChange={(event) => setPageDrafts((current) => ({
                          ...current,
                          [entry.source.id]: event.target.value,
                        }))}
                        placeholder="e.g. 2-4, 7"
                        className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-primary)] p-1.5"
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => applyPages(entry)}
                    >
                      Apply
                    </Button>
                  </div>
                  {pageErrors[entry.source.id] && (
                    <p role="alert" className="text-[10px] text-[var(--accent-rose)]">
                      {pageErrors[entry.source.id]}
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {pageSummary
                      ? `Restricted to physical pages ${pageSummary}.`
                      : 'All pages are eligible locally; only ranked excerpts will be sent.'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
