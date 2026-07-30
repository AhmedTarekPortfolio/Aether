import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIGroundingRecord } from '../../../types';
import {
  getAIGroundingRecordsForMessage,
  resolveGroundingNavigation,
} from '../../../api/groundingRecordApi';
import { GroundedResponse } from '../Citation';

vi.mock('../../../api/groundingRecordApi', () => ({
  getAIGroundingRecordsForMessage: vi.fn(),
  resolveGroundingNavigation: vi.fn(),
}));

const noteRecord: AIGroundingRecord = {
  id: 'gr-r1', userId: 'u1', requestId: 'c1', conversationId: 'c1',
  assistantMessageId: 'c1', evidenceLabel: 'R1', evidenceType: 'note',
  sourceId: null, sourceVersionId: null, segmentId: null, noteId: 'n1',
  displayTitle: 'Cells', locatorSnapshot: 'Note', excerptSnapshot: 'ATP note evidence',
  excerptHash: 'a'.repeat(64), sentOrder: 1, createdAt: 1,
};
const sourceRecord: AIGroundingRecord = {
  id: 'gr-s1', userId: 'u1', requestId: 'c1', conversationId: 'c1',
  assistantMessageId: 'c1', evidenceLabel: 'S1', evidenceType: 'source_segment',
  sourceId: 'source-1', sourceVersionId: 'version-1', segmentId: 'segment-2', noteId: null,
  displayTitle: 'Biology PDF', locatorSnapshot: 'Physical page 2 (printed label ii)',
  excerptSnapshot: 'ATP source evidence', excerptHash: 'b'.repeat(64),
  sentOrder: 2, createdAt: 1,
};

describe('WP-LOCAL-05 citation rendering', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAIGroundingRecordsForMessage).mockResolvedValue([noteRecord, sourceRecord]);
    vi.mocked(resolveGroundingNavigation).mockResolvedValue({ available: true, label: 'Available' });
  });

  it('renders only persisted R and S labels as citations and preserves unknown bracketed text', async () => {
    render(
      <GroundedResponse
        text="Grounded [R1], imported [S1], unknown [S99], array [value]."
        userId="u1"
        conversationId="c1"
        assistantMessageId="c1"
      />,
    );
    expect(await screen.findByRole('button', { name: /R1: Cells/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S1: Biology PDF.*Physical page 2/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/\[S99\], array \[value\]\./)).toBeInTheDocument();
    expect(getAIGroundingRecordsForMessage).toHaveBeenCalledWith('u1', 'c1', 'c1');
  });

  it('passes the durable PDF locator to existing viewer navigation', async () => {
    const onNavigate = vi.fn();
    render(
      <GroundedResponse
        text="See [S1]."
        userId="u1"
        conversationId="c1"
        assistantMessageId="c1"
        onNavigate={onNavigate}
      />,
    );
    const citation = await screen.findByRole('button', { name: /S1: Biology PDF/i });
    await waitFor(() => expect(citation).toBeEnabled());
    fireEvent.click(citation);
    expect(onNavigate).toHaveBeenCalledWith(sourceRecord);
    expect(onNavigate.mock.calls[0][0].locatorSnapshot).toContain('Physical page 2');
  });

  it('shows historical title, locator, excerpt, and Source deleted after purge', async () => {
    vi.mocked(getAIGroundingRecordsForMessage).mockResolvedValue([sourceRecord]);
    vi.mocked(resolveGroundingNavigation).mockResolvedValue({
      available: false,
      label: 'Source deleted',
    });
    render(
      <GroundedResponse
        text="Historical [S1]."
        userId="u1"
        conversationId="c1"
        assistantMessageId="c1"
      />,
    );
    expect((await screen.findAllByText('Source deleted')).length).toBeGreaterThan(0);
    expect(screen.getByText('Biology PDF')).toBeInTheDocument();
    expect(screen.getByText('Physical page 2 (printed label ii)')).toBeInTheDocument();
    expect(screen.getByText('ATP source evidence')).toBeInTheDocument();
  });

  it('cannot resolve citations across users or conversations', async () => {
    vi.mocked(getAIGroundingRecordsForMessage).mockResolvedValue([]);
    render(
      <GroundedResponse
        text="Untrusted [S1]."
        userId="u2"
        conversationId="other"
        assistantMessageId="other"
      />,
    );
    await waitFor(() =>
      expect(getAIGroundingRecordsForMessage).toHaveBeenCalledWith('u2', 'other', 'other'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Untrusted [S1].')).toBeInTheDocument();
  });
});
