import type { AIGroundingRecord } from '../../types';

interface CitationTooltipProps {
  record: AIGroundingRecord;
  availabilityLabel: string;
  available: boolean;
}

export function CitationTooltip({
  record,
  availabilityLabel,
  available,
}: CitationTooltipProps) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-72 rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-3 text-left text-[11px] font-normal leading-relaxed text-[var(--text-primary)] shadow-xl group-hover:block group-focus-within:block"
    >
      <strong className="block">{record.displayTitle}</strong>
      <span className="block text-[var(--text-secondary)]">{record.locatorSnapshot}</span>
      <span className="mt-1 block whitespace-pre-wrap text-[var(--text-muted)]">
        {record.excerptSnapshot.slice(0, 200)}
        {record.excerptSnapshot.length > 200 ? '…' : ''}
      </span>
      <span className={`mt-2 block font-semibold ${available ? 'text-[var(--accent-blue)]' : 'text-[var(--accent-amber)]'}`}>
        {available ? availabilityLabel : availabilityLabel}
      </span>
    </span>
  );
}
