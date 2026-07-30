import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIGroundingRecord } from '../../types';
import { ToastProvider } from '../../components/ui/Toast';
import {
  getAIGroundingRecordsForMessage,
  resolveGroundingNavigation,
} from '../../api/groundingRecordApi';
import { getSourceLibraryEntries } from '../../services/sources';
import { AIAssistantView } from '../AIAssistantView';

vi.mock('../../api/groundingRecordApi', () => ({
  getAIGroundingRecordsForMessage: vi.fn(),
  resolveGroundingNavigation: vi.fn(),
}));

vi.mock('../../services/sources', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/sources')>();
  return {
    ...original,
    getSourceLibraryEntries: vi.fn(),
  };
});

vi.mock('../../components/sources/SourceReader', () => ({
  SourceReader: ({ entry, initialPage }: { entry: { source: { displayName: string } } | null; initialPage: number }) =>
    entry ? <div data-testid="citation-source-reader">{entry.source.displayName} page {initialPage}</div> : null,
}));

const grounding: AIGroundingRecord = {
  id: 'grounding-s1', userId: 'u1', requestId: 'chat-1', conversationId: 'chat-1',
  assistantMessageId: 'chat-1', evidenceLabel: 'S1', evidenceType: 'source_segment',
  sourceId: 'source-1', sourceVersionId: 'version-1', segmentId: 'segment-2',
  noteId: null, displayTitle: 'Biology PDF',
  locatorSnapshot: 'Physical page 2 (printed label ii)',
  excerptSnapshot: 'ATP source evidence', excerptHash: 'a'.repeat(64),
  sentOrder: 1, createdAt: 1,
};

const entry = {
  source: {
    id: 'source-1', userId: 'u1', displayName: 'Biology PDF', sourceType: 'pdf',
    status: 'active', currentVersionId: 'version-1', createdAt: 1, updatedAt: 1,
    archivedAt: null, trashedAt: null, purgedAt: null,
  },
  version: {
    id: 'version-1', userId: 'u1', sourceId: 'source-1', versionNumber: 1,
    assetId: null, originalFilename: 'biology.pdf', versionReason: 'import',
    processorFingerprint: 'test', status: 'ready', pageCount: 2, lineCount: null,
    segmentCount: 1, charCount: 20, errorCode: null, errorMessage: null,
    createdAt: 1, readyAt: 1,
  },
  segment: null,
  segments: [],
  asset: null,
  associations: [],
  pendingContextLabels: [],
  chunkCount: 1,
  latestJob: null,
};

describe('WP-LOCAL-05 assistant citation navigation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAIGroundingRecordsForMessage).mockResolvedValue([grounding]);
    vi.mocked(resolveGroundingNavigation).mockResolvedValue({
      available: true,
      label: 'Biology PDF',
    });
    vi.mocked(getSourceLibraryEntries).mockResolvedValue([entry] as never);
  });

  it('opens the existing source reader at the persisted physical PDF page', async () => {
    render(
      <ToastProvider>
        <AIAssistantView
          aiChats={[{
            id: 'chat-1', userId: 'u1', mode: 'ask_resources',
            prompt: 'Where is ATP?', response: 'See [S1].', timestamp: 1,
            generationStatus: 'complete',
          }]}
          subjects={[{
            id: 's1', userId: 'u1', name: 'Biology', color: '#fff',
            confidenceRating: 0, createdAt: 1,
          }]}
          notes={[]}
          userProfile={{
            id: 'u1', name: 'User', academicLevel: 'UG', studyGoalHoursWeekly: 5,
            theme: 'dark', soundEnabled: false,
          }}
          onClearChats={vi.fn()}
        />
      </ToastProvider>,
    );
    const citation = await screen.findByRole('button', { name: /S1: Biology PDF/i });
    await waitFor(() => expect(citation).toBeEnabled());
    fireEvent.click(citation);
    expect(await screen.findByTestId('citation-source-reader'))
      .toHaveTextContent('Biology PDF page 2');
  });
});
