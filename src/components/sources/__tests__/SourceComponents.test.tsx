import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceLibraryEntry } from '../../../services/sources';
import { SourceImportDialog } from '../SourceImportDialog';
import { SourceList } from '../SourceList';
import { SourceReader } from '../SourceReader';

const mocks = vi.hoisted(() => ({
  importTextFile: vi.fn(),
  importPastedText: vi.fn(),
}));

vi.mock('../../../services/sources', async (importActual) => ({
  ...await importActual<typeof import('../../../services/sources')>(),
  importTextFile: mocks.importTextFile,
  importPastedText: mocks.importPastedText,
}));

const subjects = [{
  id: 'subject-a',
  userId: 'user-a',
  name: 'Physics',
  color: '#0000ff',
  confidenceRating: 50,
  createdAt: 1,
}];
const topics = [{ id: 'topic-a', subjectId: 'subject-a', title: 'Motion', masteryLevel: 0 }];
const tasks = [{
  id: 'task-a',
  userId: 'user-a',
  title: 'Study motion',
  subjectId: 'subject-a',
  priority: 'medium' as const,
  estimatedMinutes: 30,
  completedMinutes: 0,
  status: 'todo' as const,
  createdAt: 1,
}];
const notes = [{
  id: 'note-a',
  userId: 'user-a',
  subjectId: 'subject-a',
  title: 'Motion note',
  content: '',
  tags: [],
  updatedAt: 1,
}];

function renderImportDialog() {
  return render(
    <SourceImportDialog
      isOpen
      userId="user-a"
      subjects={subjects}
      topics={topics}
      tasks={tasks}
      notes={notes}
      initialSubjectId="subject-a"
      onClose={vi.fn()}
      onCompleted={vi.fn()}
    />,
  );
}

function libraryEntry(
  text = '<script>alert(1)</script>\n[bad](javascript:alert(1))\n<iframe src="https://example.test"></iframe>',
): SourceLibraryEntry {
  return {
    source: {
      id: 'source-a',
      userId: 'user-a',
      displayName: 'Untrusted Markdown',
      sourceType: 'markdown',
      status: 'active',
      currentVersionId: 'version-a',
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      trashedAt: null,
      purgedAt: null,
    },
    version: {
      id: 'version-a',
      userId: 'user-a',
      sourceId: 'source-a',
      versionNumber: 1,
      assetId: 'asset-a',
      originalFilename: 'untrusted.md',
      versionReason: 'import',
      processorFingerprint: 'aether-plain-text-import:v1',
      status: 'ready',
      pageCount: null,
      lineCount: 3,
      segmentCount: 1,
      charCount: text.length,
      errorCode: null,
      errorMessage: null,
      createdAt: 1,
      readyAt: 1,
    },
    segment: {
      id: 'segment-a',
      userId: 'user-a',
      sourceId: 'source-a',
      sourceVersionId: 'version-a',
      ordinal: 1,
      segmentType: 'text_block',
      text,
      textHash: 'a'.repeat(64),
      heading: null,
      physicalPage: null,
      printedPageLabel: null,
      lineStart: 1,
      lineEnd: 3,
      timeStartMs: null,
      timeEndMs: null,
      boundingBox: null,
      confidence: null,
      extractionMethod: 'plain_text',
      createdAt: 1,
    },
    asset: {
      id: 'asset-a',
      userId: 'user-a',
      contentHash: 'b'.repeat(64),
      mimeType: 'text/markdown',
      extension: 'md',
      byteSize: 100,
      relativePath: `assets/bb/${'b'.repeat(64)}.md`,
      createdAt: 1,
    },
    associations: [{
      id: 'association-a',
      userId: 'user-a',
      sourceId: 'source-a',
      targetType: 'subject',
      targetId: 'subject-a',
      associationType: 'primary',
      createdAt: 1,
      label: 'Physics',
    }],
    pendingContextLabels: [],
    chunkCount: 1,
  };
}

describe('source import and display UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advertises only TXT, Markdown, and pasted text with required subject context', () => {
    renderImportDialog();
    expect(screen.getByText(/TXT, Markdown, and pasted text/)).toBeInTheDocument();
    expect(screen.queryByText(/^PDF$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Image$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Subject/)).toBeRequired();
    expect(screen.getByRole('button', { name: /Choose TXT or Markdown/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('submits pasted text with selected associations and visible stage progress', async () => {
    mocks.importPastedText.mockImplementation(async (_context, _text, options) => {
      options.onProgress({ stage: 'processing', message: 'Normalising pasted text…' });
      options.onProgress({ stage: 'saving', message: 'Saving atomically…' });
      options.onProgress({ stage: 'completed', message: 'Pasted text was imported.' });
      return {
        sourceId: 'source-a',
        versionId: 'version-a',
        displayTitle: 'Motion paste',
        sourceType: 'pasted-text',
        byteSize: null,
        characterCount: 12,
        chunkCount: 1,
        reusedManagedAsset: false,
      };
    });
    renderImportDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Display title'), {
      target: { value: 'Motion paste' },
    });
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'topic-a' } });
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'task-a' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'note-a' } });
    fireEvent.change(screen.getByLabelText(/^Text/), { target: { value: 'Arabic عربي' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import pasted text' }));

    await waitFor(() => expect(mocks.importPastedText).toHaveBeenCalled());
    expect(mocks.importPastedText.mock.calls[0][0]).toMatchObject({
      userId: 'user-a',
      subjectId: 'subject-a',
      topicId: 'topic-a',
      taskId: 'task-a',
      noteId: 'note-a',
      displayTitle: 'Motion paste',
    });
    expect(mocks.importPastedText.mock.calls[0][1]).toBe('Arabic عربي');
    expect(await screen.findByText(/is ready with 1 local-search chunks/)).toBeInTheDocument();
  });

  it('renders imported Markdown as inert plain text with no executable elements', () => {
    const entry = libraryEntry();
    const { container } = render(<SourceReader entry={entry} onClose={vi.fn()} />);
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });

  it('shows safe source metadata and never renders internal identities or paths', () => {
    const entry = libraryEntry('safe text');
    const onOpen = vi.fn();
    render(
      <SourceList
        entries={[entry]}
        onOpen={onOpen}
        onRetry={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('Untrusted Markdown')).toBeInTheDocument();
    expect(screen.getByText('untrusted.md')).toBeInTheDocument();
    expect(screen.getByText(/subject: Physics/)).toBeInTheDocument();
    expect(screen.queryByText(entry.asset!.relativePath)).not.toBeInTheDocument();
    expect(screen.queryByText(entry.asset!.contentHash)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open source' }));
    expect(onOpen).toHaveBeenCalledWith(entry);
  });

  it('exposes retry and discard actions for failed imports', () => {
    const failed = libraryEntry('failed');
    failed.source.currentVersionId = null;
    failed.version!.status = 'failed';
    failed.segment = null;
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(
      <SourceList
        entries={[failed]}
        onOpen={vi.fn()}
        onRetry={onRetry}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: /Discard failed import/ }));
    expect(onRetry).toHaveBeenCalledWith(failed);
    expect(onDiscard).toHaveBeenCalledWith(failed);
  });
});
