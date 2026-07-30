import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceEvidenceSelection } from '../../../services/ai';
import {
  getSourceLibraryEntries,
  type SourceLibraryEntry,
} from '../../../services/sources';
import { SourceEvidenceSelector } from '../SourceEvidenceSelector';

vi.mock('../../../services/sources', () => ({
  getSourceLibraryEntries: vi.fn(),
}));

const pdfEntry = {
  source: {
    id: 'source-pdf', userId: 'u1', displayName: 'Biology PDF', sourceType: 'pdf',
    status: 'active', currentVersionId: 'version-pdf', createdAt: 1, updatedAt: 1,
    archivedAt: null, trashedAt: null, purgedAt: null,
  },
  version: {
    id: 'version-pdf', userId: 'u1', sourceId: 'source-pdf', versionNumber: 1,
    assetId: null, originalFilename: 'biology.pdf', versionReason: 'import',
    processorFingerprint: 'test', status: 'ready', pageCount: 10, lineCount: null,
    segmentCount: 10, charCount: 100, errorCode: null, errorMessage: null,
    createdAt: 1, readyAt: 1,
  },
  segment: null,
  segments: [],
  asset: null,
  associations: [],
  pendingContextLabels: [],
  chunkCount: 10,
  latestJob: null,
} as SourceLibraryEntry;

function Harness() {
  const [value, setValue] = useState<SourceEvidenceSelection[]>([]);
  return (
    <>
      <SourceEvidenceSelector
        userId="u1"
        subjectId="s1"
        value={value}
        onChange={setValue}
      />
      <output data-testid="selection">{JSON.stringify(value)}</output>
    </>
  );
}

describe('WP-LOCAL-05 source evidence selector', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSourceLibraryEntries).mockResolvedValue([pdfEntry]);
  });

  it('requires an affirmative source choice and stores PDF pages separately', async () => {
    render(<Harness />);
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Use imported source Biology PDF',
    });
    expect(screen.getByTestId('selection')).toHaveTextContent('[]');
    fireEvent.click(checkbox);
    expect(screen.getByTestId('selection')).toHaveTextContent('"sourceId":"source-pdf"');
    fireEvent.change(screen.getByLabelText('Physical pages for Biology PDF'), {
      target: { value: '2-4, 7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('selection')).toHaveTextContent(
      '"pageRanges":[{"start":2,"end":4},{"start":7,"end":7}]',
    );
    expect(screen.getByText('Restricted to physical pages 2-4, 7.')).toBeInTheDocument();
  });

  it('rejects invalid page restrictions without changing the selected boundary', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('checkbox', {
      name: 'Use imported source Biology PDF',
    }));
    fireEvent.change(screen.getByLabelText('Physical pages for Biology PDF'), {
      target: { value: '11' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('between 1 and 10');
    await waitFor(() =>
      expect(screen.getByTestId('selection')).not.toHaveTextContent('pageRanges'));
  });
});
