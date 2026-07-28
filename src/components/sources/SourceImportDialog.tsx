import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, FileUp, StopCircle } from 'lucide-react';
import type { Note, Subject, Task, Topic } from '../../types';
import {
  importPastedText,
  importTextFile,
  MAX_PASTED_TEXT_CHARACTERS,
  SourceImportError,
  type SourceImportProgress,
  type SourceImportResult,
} from '../../services/sources';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface SourceImportDialogProps {
  isOpen: boolean;
  userId: string;
  subjects: Subject[];
  topics: Topic[];
  tasks: Task[];
  notes: Note[];
  initialSubjectId?: string;
  onClose: () => void;
  onCompleted: (result: SourceImportResult) => void;
}

const initialProgress: SourceImportProgress = {
  stage: 'idle',
  message: 'Choose a source type and context.',
};

export function SourceImportDialog({
  isOpen,
  userId,
  subjects,
  topics,
  tasks,
  notes,
  initialSubjectId,
  onClose,
  onCompleted,
}: SourceImportDialogProps) {
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? subjects[0]?.id ?? '');
  const [topicId, setTopicId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [noteId, setNoteId] = useState('');
  const [associationType, setAssociationType] = useState<'reference' | 'supplementary'>('reference');
  const [displayTitle, setDisplayTitle] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [progress, setProgress] = useState<SourceImportProgress>(initialProgress);
  const [error, setError] = useState<SourceImportError | null>(null);
  const [result, setResult] = useState<SourceImportResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = !['idle', 'completed', 'failed', 'cancelled'].includes(progress.stage);

  const filteredTopics = useMemo(
    () => topics.filter((topic) => topic.subjectId === subjectId),
    [subjectId, topics],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSubjectId(initialSubjectId ?? subjects[0]?.id ?? '');
    setTopicId('');
    setProgress(initialProgress);
    setError(null);
    setResult(null);
  }, [initialSubjectId, isOpen, subjects]);

  function resetAttempt() {
    setProgress(initialProgress);
    setError(null);
    setResult(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const context = {
      userId,
      subjectId,
      topicId: topicId || undefined,
      taskId: taskId || undefined,
      noteId: noteId || undefined,
      associationType,
      displayTitle: displayTitle.trim() || undefined,
    };
    try {
      let imported: SourceImportResult;
      if (mode === 'file') {
        controller.current = new AbortController();
        imported = await importTextFile(context, {
          signal: controller.current.signal,
          onProgress: setProgress,
        });
      } else {
        imported = await importPastedText(context, pastedText, { onProgress: setProgress });
      }
      setResult(imported);
      onCompleted(imported);
    } catch (caught) {
      setError(
        caught instanceof SourceImportError
          ? caught
          : new SourceImportError('IMPORT_TRANSACTION_FAILED'),
      );
    } finally {
      controller.current = null;
    }
  }

  function closeOrCancel() {
    if (busy && controller.current) {
      controller.current.abort();
      return;
    }
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={closeOrCancel} title="Import local source" maxWidth="2xl">
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-3 text-sm">
          <strong>Supported now:</strong> TXT, Markdown, and pasted text.
          <span className="ml-1 text-[var(--text-secondary)]">
            Files remain local and are not sent to AI.
          </span>
        </div>

        <fieldset disabled={busy} className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Import mode</legend>
          <button
            type="button"
            aria-pressed={mode === 'file'}
            onClick={() => { setMode('file'); resetAttempt(); }}
            className={`rounded-xl border p-3 text-sm ${mode === 'file' ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'border-[var(--border-glass)]'}`}
          >
            <FileUp className="mx-auto mb-1 h-5 w-5" />
            Choose TXT or Markdown
          </button>
          <button
            type="button"
            aria-pressed={mode === 'paste'}
            onClick={() => { setMode('paste'); resetAttempt(); }}
            className={`rounded-xl border p-3 text-sm ${mode === 'paste' ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'border-[var(--border-glass)]'}`}
          >
            <ClipboardPaste className="mx-auto mb-1 h-5 w-5" />
            Paste text
          </button>
        </fieldset>

        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Subject *</span>
            <select
              required
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setTopicId('');
              }}
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            >
              <option value="">Select subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Topic</span>
            <select
              value={topicId}
              onChange={(event) => setTopicId(event.target.value)}
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            >
              <option value="">No topic</option>
              {filteredTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>{topic.title}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Task</span>
            <select
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            >
              <option value="">No task</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <select
              value={noteId}
              onChange={(event) => setNoteId(event.target.value)}
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            >
              <option value="">No note</option>
              {notes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Optional-association type</span>
            <select
              value={associationType}
              onChange={(event) => setAssociationType(event.target.value as typeof associationType)}
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            >
              <option value="reference">Reference</option>
              <option value="supplementary">Supplementary</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Display title</span>
            <input
              value={displayTitle}
              maxLength={200}
              onChange={(event) => setDisplayTitle(event.target.value)}
              placeholder={mode === 'file' ? 'Defaults to filename' : 'Defaults to Pasted text'}
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            />
          </label>
        </fieldset>

        {mode === 'paste' && (
          <label className="block text-sm">
            <span className="mb-1 flex justify-between font-medium">
              <span>Text *</span>
              <span className="text-[var(--text-muted)]">
                {pastedText.length.toLocaleString()} / {MAX_PASTED_TEXT_CHARACTERS.toLocaleString()}
              </span>
            </span>
            <textarea
              required
              disabled={busy}
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              rows={9}
              className="w-full resize-y rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-3"
              placeholder="Paste untrusted text or Markdown here. It will be stored and displayed as plain text."
            />
          </label>
        )}

        <div
          role="status"
          className="rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-3 text-sm"
        >
          <span className="font-medium capitalize">{progress.stage}</span>
          <span className="ml-2 text-[var(--text-secondary)]">{progress.message}</span>
          {progress.filename && (
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {progress.filename}
              {progress.byteSize !== undefined ? ` • ${progress.byteSize.toLocaleString()} bytes` : ''}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 p-3 text-sm text-[var(--accent-rose)]">
            {error.message}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-[var(--accent-emerald)]/30 bg-[var(--accent-emerald)]/10 p-3 text-sm">
            <strong>{result.displayTitle}</strong> is ready with {result.chunkCount} local-search chunks.
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {(progress.stage === 'failed' || progress.stage === 'cancelled') && (
            <Button type="button" variant="secondary" onClick={resetAttempt}>Try again</Button>
          )}
          <Button
            type="button"
            variant={busy ? 'danger' : 'ghost'}
            icon={busy ? <StopCircle className="h-4 w-4" /> : undefined}
            onClick={closeOrCancel}
          >
            {busy ? 'Cancel import' : result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button type="submit" disabled={busy || !subjectId}>
              {mode === 'file' ? 'Choose and import file' : 'Import pasted text'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
