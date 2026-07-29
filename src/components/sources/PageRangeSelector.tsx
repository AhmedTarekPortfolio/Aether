import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';

export interface PageRange {
  start: number;
  end: number;
}

export const MAX_PAGE_SELECTION_RANGES = 20;
export const MAX_SELECTED_PDF_PAGES = 1_000;

export function pageRangeCount(ranges: PageRange[]): number {
  return ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
}

export function parsePageRanges(value: string, pageCount: number): PageRange[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error('The PDF page count is unavailable.');
  }
  const tokens = value.split(',').map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error('Enter a page or page range.');
  if (tokens.length > MAX_PAGE_SELECTION_RANGES) {
    throw new Error(`Select at most ${MAX_PAGE_SELECTION_RANGES} ranges.`);
  }
  const ranges = tokens.map((token): PageRange => {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) throw new Error(`“${token}” is not a valid physical page range.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end)
      || start < 1
      || end < start
      || end > pageCount
    ) throw new Error(`Pages must be between 1 and ${pageCount}.`);
    return { start, end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: PageRange[] = [];
  for (const range of ranges) {
    const prior = merged.at(-1);
    if (prior && range.start <= prior.end + 1) {
      prior.end = Math.max(prior.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  if (pageRangeCount(merged) > Math.min(pageCount, MAX_SELECTED_PDF_PAGES)) {
    throw new Error(`Select at most ${MAX_SELECTED_PDF_PAGES} physical pages.`);
  }
  return merged;
}

interface PageRangeSelectorProps {
  pageCount: number;
  currentPage: number;
  value: PageRange[];
  onChange: (ranges: PageRange[]) => void;
}

export function PageRangeSelector({
  pageCount,
  currentPage,
  value,
  onChange,
}: PageRangeSelectorProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const count = useMemo(() => pageRangeCount(value), [value]);

  function apply() {
    try {
      const ranges = parsePageRanges(input, pageCount);
      onChange(ranges);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The page selection is invalid.');
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-4" aria-label="PDF page selection">
      <div>
        <h4 className="text-sm font-semibold">Select physical pages</h4>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Enter a page such as 4 or inclusive ranges such as 2-5, 9. Selection stays
          local in this viewer and is not sent to AI.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-xs">
          <span className="mb-1 block font-medium">Pages or ranges</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`1-${Math.min(pageCount, 3)}, ${currentPage}`}
            aria-invalid={Boolean(error)}
            className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-secondary)] p-2"
          />
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={apply}>
          Apply selection
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={value.length === 0}
          onClick={() => {
            setInput('');
            setError('');
            onChange([]);
          }}
        >
          Clear
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-[var(--accent-rose)]">{error}</p>}
      <p role="status" aria-live="polite" className="text-xs text-[var(--text-secondary)]">
        {value.length === 0
          ? 'No explicit page selection.'
          : `${count} page${count === 1 ? '' : 's'} selected: ${value
              .map((range) => range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`)
              .join(', ')}.`}
      </p>
    </section>
  );
}
