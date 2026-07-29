import { useEffect, useMemo, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import {
  addSourceAssociation,
  deleteSourceAssociationForUser,
  updateSourceAssociationType,
} from '../../api';
import type {
  Note,
  SourceAssociationTargetType,
  SourceAssociationType,
  Subject,
  Task,
  Topic,
} from '../../types';
import type { SourceLibraryEntry } from '../../services/sources';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface SourceAssociationEditorProps {
  entry: SourceLibraryEntry | null;
  userId: string;
  subjects: Subject[];
  topics: Topic[];
  tasks: Task[];
  notes: Note[];
  onClose: () => void;
  onChanged: () => void;
}

interface TargetOption {
  id: string;
  label: string;
}

export function SourceAssociationEditor({
  entry,
  userId,
  subjects,
  topics,
  tasks,
  notes,
  onClose,
  onChanged,
}: SourceAssociationEditorProps) {
  const [targetType, setTargetType] = useState<SourceAssociationTargetType>('subject');
  const [targetId, setTargetId] = useState('');
  const [associationType, setAssociationType] = useState<SourceAssociationType>('reference');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ownedSubjects = useMemo(
    () => subjects.filter((subject) => (subject.userId ?? 'default_user') === userId),
    [subjects, userId],
  );
  const ownedSubjectIds = useMemo(
    () => new Set(ownedSubjects.map((subject) => subject.id)),
    [ownedSubjects],
  );
  const targetOptions = useMemo<TargetOption[]>(() => {
    if (targetType === 'subject') {
      return ownedSubjects.map((subject) => ({ id: subject.id, label: subject.name }));
    }
    if (targetType === 'topic') {
      return topics
        .filter((topic) => ownedSubjectIds.has(topic.subjectId))
        .map((topic) => ({ id: topic.id, label: topic.title }));
    }
    if (targetType === 'task') {
      return tasks
        .filter((task) => (task.userId ?? 'default_user') === userId)
        .map((task) => ({ id: task.id, label: task.title }));
    }
    return notes
      .filter((note) => (note.userId ?? 'default_user') === userId)
      .map((note) => ({ id: note.id, label: note.title }));
  }, [notes, ownedSubjectIds, ownedSubjects, targetType, tasks, topics, userId]);

  useEffect(() => {
    setTargetId(targetOptions[0]?.id ?? '');
  }, [targetOptions]);

  async function addAssociation() {
    if (!entry || !targetId) return;
    setBusy(true);
    setError('');
    try {
      await addSourceAssociation({
        id: globalThis.crypto.randomUUID(),
        userId,
        sourceId: entry.source.id,
        targetType,
        targetId,
        associationType: targetType === 'subject' ? 'primary' : associationType,
        createdAt: Date.now(),
      });
      onChanged();
    } catch {
      setError('That link could not be added safely. It may already exist or be unavailable.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAssociation(
    associationTargetType: SourceAssociationTargetType,
    associationTargetId: string,
  ) {
    if (!entry) return;
    setBusy(true);
    setError('');
    try {
      await deleteSourceAssociationForUser(
        entry.source.id,
        userId,
        associationTargetType,
        associationTargetId,
      );
      onChanged();
    } catch {
      setError('That link could not be removed safely.');
    } finally {
      setBusy(false);
    }
  }

  async function changeAssociationType(
    associationTargetType: SourceAssociationTargetType,
    associationTargetId: string,
    nextType: SourceAssociationType,
  ) {
    if (!entry) return;
    setBusy(true);
    setError('');
    try {
      await updateSourceAssociationType(
        entry.source.id,
        userId,
        associationTargetType,
        associationTargetId,
        nextType,
      );
      onChanged();
    } catch {
      setError('That link type could not be updated safely.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={() => { if (!busy) onClose(); }}
      title={<><Link2 className="h-5 w-5 text-[var(--accent-blue)]" /> Manage source links</>}
      maxWidth="xl"
    >
      {entry && (
        <div className="space-y-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Link “{entry.source.displayName}” to study items. These links remain with the source through archive and trash.
          </p>

          <div className="space-y-2">
            {entry.associations.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--border-glass-hover)] p-4 text-sm text-[var(--text-secondary)]">
                No links yet.
              </p>
            )}
            {entry.associations.map((association) => (
              <div
                key={association.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg-tertiary)] p-3 text-sm"
              >
                <span>{association.targetType}: {association.label}</span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Link type for ${association.label}`}
                    value={association.associationType}
                    disabled={busy || association.targetType === 'subject'}
                    onChange={(event) => void changeAssociationType(
                      association.targetType,
                      association.targetId,
                      event.target.value as SourceAssociationType,
                    )}
                    className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-primary)] p-1.5"
                  >
                    <option value="primary">Primary</option>
                    <option value="reference">Reference</option>
                    <option value="supplementary">Supplementary</option>
                  </select>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => void removeAssociation(association.targetType, association.targetId)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-xl border border-[var(--border-glass)] p-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Study item type</span>
              <select
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as SourceAssociationTargetType)}
                className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
              >
                <option value="subject">Subject</option>
                <option value="topic">Topic</option>
                <option value="task">Task</option>
                <option value="note">Note</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Study item</span>
              <select
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
              >
                {targetOptions.length === 0 && <option value="">None available</option>}
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Link type</span>
              <select
                value={targetType === 'subject' ? 'primary' : associationType}
                disabled={targetType === 'subject'}
                onChange={(event) => setAssociationType(event.target.value as SourceAssociationType)}
                className="w-full rounded-xl border border-[var(--border-glass)] bg-[var(--bg-primary)] p-2.5"
              >
                <option value="primary">Primary</option>
                <option value="reference">Reference</option>
                <option value="supplementary">Supplementary</option>
              </select>
            </label>
            <Button
              type="button"
              disabled={busy || !targetId}
              onClick={() => void addAssociation()}
            >
              Add link
            </Button>
          </div>

          {error && <p role="alert" className="text-sm text-[var(--accent-rose)]">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
