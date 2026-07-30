import { useEffect, useMemo, useState } from 'react';
import type { AIGroundingRecord } from '../../types';
import {
  getAIGroundingRecordsForMessage,
  resolveGroundingNavigation,
} from '../../api/groundingRecordApi';
import { CitationTooltip } from './CitationTooltip';

interface CitationProps {
  record: AIGroundingRecord;
  userId: string;
  onNavigate?: (record: AIGroundingRecord) => void;
}

export function Citation({ record, userId, onNavigate }: CitationProps) {
  const [navigation, setNavigation] = useState({
    available: false,
    label: record.evidenceType === 'note' ? 'Note deleted' : 'Source deleted',
  });

  useEffect(() => {
    let cancelled = false;
    resolveGroundingNavigation(record.id, userId)
      .then((result) => {
        if (!cancelled) setNavigation(result);
      })
      .catch(() => {
        if (!cancelled) {
          setNavigation({
            available: false,
            label: record.evidenceType === 'note' ? 'Note deleted' : 'Source deleted',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [record.evidenceType, record.id, userId]);

  return (
    <span className="group relative inline-flex items-baseline gap-1">
      <button
        type="button"
        disabled={!navigation.available || !onNavigate}
        aria-label={`${record.evidenceLabel}: ${record.displayTitle}, ${record.locatorSnapshot}`}
        onClick={() => onNavigate?.(record)}
        className="rounded bg-[var(--accent-purple)]/15 px-1 font-semibold text-[var(--accent-purple)] enabled:cursor-pointer enabled:hover:bg-[var(--accent-purple)]/25 disabled:cursor-default"
      >
        [{record.evidenceLabel}]
      </button>
      {!navigation.available && (
        <span className="text-[10px] font-medium text-[var(--accent-amber)]">
          {navigation.label}
        </span>
      )}
      <CitationTooltip
        record={record}
        availabilityLabel={navigation.label}
        available={navigation.available}
      />
    </span>
  );
}

interface GroundedResponseProps {
  text: string;
  userId: string;
  conversationId: string;
  assistantMessageId: string;
  onNavigate?: (record: AIGroundingRecord) => void;
}

export function GroundedResponse({
  text,
  userId,
  conversationId,
  assistantMessageId,
  onNavigate,
}: GroundedResponseProps) {
  const [records, setRecords] = useState<AIGroundingRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAIGroundingRecordsForMessage(userId, conversationId, assistantMessageId)
      .then((loaded) => {
        if (!cancelled) setRecords(loaded);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [assistantMessageId, conversationId, userId]);

  const content = useMemo(() => {
    const byLabel = new Map(records.map((record) => [record.evidenceLabel, record]));
    const pieces: Array<string | { record: AIGroundingRecord; offset: number }> = [];
    const pattern = /\[([RS]\d+)\]/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const record = byLabel.get(match[1]);
      if (!record) continue;
      if (match.index > cursor) pieces.push(text.slice(cursor, match.index));
      pieces.push({ record, offset: match.index });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) pieces.push(text.slice(cursor));
    return pieces;
  }, [records, text]);

  return (
    <>
      {content.map((piece, index) =>
        typeof piece === 'string'
          ? piece
          : (
            <Citation
              key={`${piece.record.id}-${piece.offset}-${index}`}
              record={piece.record}
              userId={userId}
              onNavigate={onNavigate}
            />
          ))}
    </>
  );
}
