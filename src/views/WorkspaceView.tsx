import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Subject, Note, Flashcard, Topic } from '../types';
import { BookOpen, FileText, Plus, Edit3, Star, Layers, Sparkles } from 'lucide-react';

interface WorkspaceViewProps {
  subjects: Subject[];
  topics: Topic[];
  notes: Note[];
  flashcards: Flashcard[];
  onAddSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => void;
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => void;
  onUpdateNote: (id: string, content: string, title?: string) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  subjects,
  topics,
  notes,
  flashcards,
  onAddSubject,
  onAddNote,
  onUpdateNote,
}) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    subjects[0]?.id || null
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    notes[0]?.id || null
  );

  const [activeTab, setActiveTab] = useState<'notes' | 'flashcards'>('notes');

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

  // New Subject form state
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubColor, setNewSubColor] = useState('#4F7CFF');
  const [newSubGrade, setNewSubGrade] = useState('A');
  const [newSubConfidence, setNewSubConfidence] = useState(70);

  // New Note form state
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteTags, setNewNoteTags] = useState('');

  // Active note editor state
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editContent, setEditContent] = useState(selectedNote?.content || '');

  // Active flashcard review index
  const [flashcardIdx, setFlashcardIdx] = useState(0);
  const [showFlashcardBack, setShowFlashcardBack] = useState(false);

  const filteredNotes = notes.filter((n) =>
    selectedSubjectId ? n.subjectId === selectedSubjectId : true
  );

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    onAddSubject({
      name: newSubName,
      code: newSubCode || undefined,
      color: newSubColor,
      confidenceRating: Number(newSubConfidence) || 70,
      targetGrade: newSubGrade,
    });
    setNewSubName('');
    setNewSubCode('');
    setIsSubjectModalOpen(false);
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    onAddNote({
      subjectId: selectedSubjectId || subjects[0]?.id || 'sub_cs301',
      title: newNoteTitle,
      content: newNoteContent,
      tags: newNoteTags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setNewNoteTitle('');
    setNewNoteContent('');
    setNewNoteTags('');
    setIsNoteModalOpen(false);
  };

  const handleSaveNoteEdit = () => {
    if (selectedNoteId) {
      onUpdateNote(selectedNoteId, editContent);
      setIsEditingNote(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Subject Header Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent-blue)]" />
            Academic Course Modules
          </h3>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsSubjectModalOpen(true)}
          >
            Add Subject
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {subjects.map((sub) => {
            const isSelected = selectedSubjectId === sub.id;
            return (
              <Card
                key={sub.id}
                interactive
                onClick={() => setSelectedSubjectId(sub.id)}
                className={`p-5 transition-all ${
                  isSelected ? 'border-[var(--accent-blue)] bg-[var(--bg-secondary)] ring-1 ring-[var(--accent-blue)]/50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="w-3 h-3 rounded-full shadow-lg"
                    style={{ backgroundColor: sub.color }}
                  />
                  <Badge variant="gray" size="sm">
                    Grade: {sub.targetGrade || 'A'}
                  </Badge>
                </div>
                <h4 className="text-base font-semibold text-[var(--text-primary)] line-clamp-1">{sub.name}</h4>
                <div className="text-xs font-mono text-[var(--text-secondary)] mt-1">{sub.code}</div>

                <div className="mt-4 pt-3 border-t border-[var(--border-glass)] space-y-1.5">
                  <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                    <span>Confidence Index</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">{sub.confidenceRating}%</span>
                  </div>
                  <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${sub.confidenceRating}%`, backgroundColor: sub.color }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Area: Mode Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-glass)] pb-2">
        <Button
          variant={activeTab === 'notes' ? 'primary' : 'ghost'}
          size="sm"
          icon={<FileText className="w-4 h-4" />}
          onClick={() => setActiveTab('notes')}
        >
          Study Notes ({filteredNotes.length})
        </Button>
        <Button
          variant={activeTab === 'flashcards' ? 'purple' : 'ghost'}
          size="sm"
          icon={<Layers className="w-4 h-4" />}
          onClick={() => setActiveTab('flashcards')}
        >
          Flashcards Decks
        </Button>
      </div>

      {activeTab === 'notes' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Col: Note List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--accent-purple)]" />
                Notes List
              </h4>
              <Button
                variant="purple"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setIsNoteModalOpen(true)}
              >
                New Note
              </Button>
            </div>

            <div className="space-y-3">
              {filteredNotes.length === 0 ? (
                <Card className="p-6 text-center text-xs text-[var(--text-secondary)]">
                  No notes created for this subject yet.
                </Card>
              ) : (
                filteredNotes.map((n) => {
                  const isSelected = selectedNoteId === n.id;
                  return (
                    <Card
                      key={n.id}
                      interactive
                      onClick={() => {
                        setSelectedNoteId(n.id);
                        setEditContent(n.content);
                        setIsEditingNote(false);
                      }}
                      className={`p-4 transition-all ${
                        isSelected ? 'border-[var(--accent-purple)] bg-[var(--bg-secondary)]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="text-sm font-semibold text-[var(--text-primary)] truncate">{n.title}</h5>
                        {n.isFavorite && <Star className="w-3.5 h-3.5 text-[var(--accent-amber)] fill-current" />}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{n.content}</p>
                      {n.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {n.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.2 bg-[var(--border-glass)] text-[var(--text-secondary)] text-[10px] rounded"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          {/* Right 2 Cols: Markdown Note Preview & Editor */}
          <div className="lg:col-span-2">
            {selectedNote ? (
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border-glass)]">
                  <div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{selectedNote.title}</h3>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Updated {new Date(selectedNote.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditingNote ? (
                      <Button variant="emerald" size="sm" onClick={handleSaveNoteEdit}>
                        Save Changes
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Edit3 className="w-4 h-4" />}
                        onClick={() => {
                          setEditContent(selectedNote.content);
                          setIsEditingNote(true);
                        }}
                      >
                        Edit Note
                      </Button>
                    )}
                  </div>
                </div>

                {isEditingNote ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-96 p-4 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl font-mono text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
                  />
                ) : (
                  <div className="prose max-w-none text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-line font-sans space-y-2">
                    {selectedNote.content}
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-12 text-center text-[var(--text-secondary)]">
                Select or create a note to view its contents.
              </Card>
            )}
          </div>
        </div>
      ) : (
        /* Flashcards Deck Review Mode */
        <Card className="max-w-xl mx-auto p-8 text-center space-y-6">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono">
            <span>SPACED REPETITION DECK</span>
            <span>Card {flashcardIdx + 1} of 3</span>
          </div>

          <div
            onClick={() => setShowFlashcardBack(!showFlashcardBack)}
            className="p-12 bg-[var(--bg-tertiary)] border border-[var(--border-glass-hover)] rounded-2xl cursor-pointer min-h-[200px] flex items-center justify-center text-center transition-all hover:scale-[1.01]"
          >
            {showFlashcardBack ? (
              <div className="space-y-2">
                <Badge variant="emerald" size="sm">Answer</Badge>
                <div className="text-base font-semibold text-[var(--text-primary)]">
                  Memoization stores recursive subproblem results in a hash table; tabulation fills a bottom-up array iteratively.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Badge variant="purple" size="sm">Question (Click to Flip)</Badge>
                <div className="text-lg font-bold text-[var(--text-primary)]">
                  What is the difference between Top-Down Memoization and Bottom-Up Tabulation in DP?
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowFlashcardBack(false);
                setFlashcardIdx((prev) => (prev > 0 ? prev - 1 : 0));
              }}
            >
              Previous Card
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowFlashcardBack(false);
                setFlashcardIdx((prev) => (prev + 1) % 3);
              }}
            >
              Next Card
            </Button>
          </div>
        </Card>
      )}

      {/* Add Subject Modal */}
      <Modal
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        title="Add Academic Subject"
      >
        <form onSubmit={handleSubjectSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Subject Name *</label>
            <input
              type="text"
              required
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              placeholder="e.g. Cognitive Neuroscience"
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Course Code</label>
              <input
                type="text"
                value={newSubCode}
                onChange={(e) => setNewSubCode(e.target.value)}
                placeholder="e.g. COGS 105"
                className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Target Grade</label>
              <input
                type="text"
                value={newSubGrade}
                onChange={(e) => setNewSubGrade(e.target.value)}
                placeholder="e.g. A+"
                className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" type="button" onClick={() => setIsSubjectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Save Subject
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Note Modal */}
      <Modal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        title="Create Rich Study Note"
      >
        <form onSubmit={handleNoteSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Note Title *</label>
            <input
              type="text"
              required
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              placeholder="e.g. Schrödinger Equation Proofs"
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Tags (Comma separated)</label>
            <input
              type="text"
              value={newNoteTags}
              onChange={(e) => setNewNoteTags(e.target.value)}
              placeholder="quantum, physics, equations"
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Content (Markdown & Math supported)</label>
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Write your study notes using markdown..."
              className="w-full h-40 px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" type="button" onClick={() => setIsNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="purple" size="md" type="submit">
              Save Note
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
