import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileSearch, FileUp, Search } from 'lucide-react';
import type { Note, Subject, Task, Topic } from '../types';
import {
  discardIncompleteSource,
  getSourceLibraryEntries,
  recoverInterruptedTextImports,
  recoverInterruptedPdfImports,
  retryTextImport,
  retryPdfImport,
  searchImportedSources,
  SourceImportError,
  type SourceImportResult,
  type SourceLibraryEntry,
  type SourceSearchResult,
} from '../services/sources';
import { SourceImportDialog } from '../components/sources/SourceImportDialog';
import { SourceList } from '../components/sources/SourceList';
import { SourceReader } from '../components/sources/SourceReader';
import { Button } from '../components/ui/Button';

interface SourcesViewProps {
  userId: string;
  subjects: Subject[];
  topics: Topic[];
  tasks: Task[];
  notes: Note[];
}

export function SourcesView({ userId, subjects, topics, tasks, notes }: SourcesViewProps) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [importOpen, setImportOpen] = useState(false);
  const [readerEntry, setReaderEntry] = useState<SourceLibraryEntry | null>(null);
  const [readerInitialPage, setReaderInitialPage] = useState(1);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SourceSearchResult[]>([]);
  const [message, setMessage] = useState('');
  const recoveryStarted = useRef(false);

  useEffect(() => {
    if (!subjectId && subjects[0]) setSubjectId(subjects[0].id);
  }, [subjectId, subjects]);

  useEffect(() => {
    if (recoveryStarted.current) return;
    recoveryStarted.current = true;
    Promise.all([
      recoverInterruptedTextImports(userId),
      recoverInterruptedPdfImports(userId),
    ])
      .then(([textResults, pdfResults]) => {
        const results = [...textResults, ...pdfResults];
        if (results.length) {
          const recovered = results.filter((result) => result.recovered).length;
          setMessage(`Checked ${results.length} interrupted import${results.length === 1 ? '' : 's'}; ${recovered} recovered.`);
          setRefreshGeneration((value) => value + 1);
        }
      })
      .catch(() => setMessage('Interrupted imports could not be checked.'));
  }, [userId]);

  const entries = useLiveQuery(
    () => getSourceLibraryEntries(userId, subjectId || undefined),
    [userId, subjectId, refreshGeneration],
    [],
  );

  function completed(result: SourceImportResult) {
    setMessage(`${result.displayTitle} is ready and searchable locally.`);
    setRefreshGeneration((value) => value + 1);
  }

  async function retry(entry: SourceLibraryEntry) {
    setMessage(`Retrying ${entry.source.displayName}…`);
    try {
      const result = entry.source.sourceType === 'pdf'
        ? await retryPdfImport(entry.source.id, userId)
        : await retryTextImport(entry.source.id, userId);
      completed(result);
    } catch (error) {
      setMessage(
        error instanceof SourceImportError
          ? error.message
          : 'The import could not be retried safely.',
      );
    }
  }

  async function discard(entry: SourceLibraryEntry) {
    if (!window.confirm(`Discard the failed import “${entry.source.displayName}”? The managed asset, if valid, will be preserved.`)) {
      return;
    }
    try {
      await discardIncompleteSource(entry.source.id, userId);
    } catch (error) {
      setMessage(
        error instanceof SourceImportError
          ? error.message
          : 'The failed import could not be discarded safely.',
      );
      return;
    }
    setMessage('Failed import metadata was discarded. Valid managed files were preserved.');
    setRefreshGeneration((value) => value + 1);
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!subjectId || !query.trim()) {
      setSearchResults([]);
      return;
    }
    const results = await searchImportedSources({
      userId,
      subjectId,
      query,
      maximumResults: 10,
    });
    setSearchResults(results);
    setMessage(`${results.length} local search result${results.length === 1 ? '' : 's'}.`);
  }

  async function openSearchResult(result: SourceSearchResult) {
    const entry = entries.find((candidate) => candidate.source.id === result.source.id)
      ?? (await getSourceLibraryEntries(userId, subjectId))
        .find((candidate) => candidate.source.id === result.source.id);
    if (entry) {
      setReaderInitialPage(result.locator.physicalPage ?? 1);
      setReaderEntry(entry);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-secondary)] p-6 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-semibold">
            {['TXT', 'Markdown', 'PDF', 'Pasted text'].map((label) => (
              <span key={label} className="rounded-full bg-[var(--accent-blue)]/10 px-2.5 py-1 text-[var(--accent-blue)]">
                {label}
              </span>
            ))}
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Local sources</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Import, read, view, and search durable local text and PDFs. This source library is not connected to AI.
          </p>
        </div>
        <Button
          icon={<FileUp className="h-4 w-4" />}
          disabled={subjects.length === 0}
          onClick={() => setImportOpen(true)}
        >
          Import source
        </Button>
      </section>

      {subjects.length === 0 && (
        <div role="alert" className="rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 p-4 text-sm">
          Create a real subject in Plan or Knowledge Workspace before importing a source.
        </div>
      )}

      <section className="grid gap-4 rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-secondary)] p-5 lg:grid-cols-[minmax(180px,0.35fr)_1fr]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Subject filter</span>
          <select
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
              setSearchResults([]);
            }}
            className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
          >
            <option value="">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
        <form onSubmit={runSearch} className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium">Search imported text locally</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter keywords"
              className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
            />
          </label>
          <Button
            type="submit"
            variant="secondary"
            icon={<Search className="h-4 w-4" />}
            disabled={!subjectId || !query.trim()}
          >
            Search
          </Button>
        </form>
      </section>

      {message && <p role="status" className="text-sm text-[var(--text-secondary)]">{message}</p>}

      {searchResults.length > 0 && (
        <section className="space-y-3" aria-label="Local source search results">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileSearch className="h-5 w-5 text-[var(--accent-purple)]" />
            Search results
          </h2>
          {searchResults.map((result) => (
            <button
              key={result.chunk.id}
              type="button"
              onClick={() => openSearchResult(result)}
              className="block w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-secondary)] p-4 text-left hover:border-[var(--border-glass-hover)]"
            >
              <strong className="text-sm">{result.source.displayName}</strong>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{result.excerpt}</p>
              <span className="mt-2 block text-[11px] text-[var(--text-muted)]">
                {result.locator.physicalPage
                  ? `Physical page ${result.locator.physicalPage}${result.locator.printedPageLabel ? ` • printed label ${result.locator.printedPageLabel}` : ''}`
                  : `Characters ${result.locator.charStart.toLocaleString()}–${result.locator.charEnd.toLocaleString()}`}
              </span>
            </button>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Imported sources</h2>
        <SourceList
          entries={entries}
          onOpen={(entry) => {
            setReaderInitialPage(1);
            setReaderEntry(entry);
          }}
          onRetry={retry}
          onDiscard={discard}
        />
      </section>

      <SourceImportDialog
        isOpen={importOpen}
        userId={userId}
        subjects={subjects}
        topics={topics}
        tasks={tasks}
        notes={notes}
        initialSubjectId={subjectId || undefined}
        onClose={() => setImportOpen(false)}
        onCompleted={completed}
      />
      <SourceReader
        entry={readerEntry}
        initialPage={readerInitialPage}
        onClose={() => setReaderEntry(null)}
      />
    </div>
  );
}
