import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Subject, Topic, Note, Flashcard } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { 
  calculateWorkspaceOverview, 
  calculateSubjectWorkspaceCards, 
  getRecentActivity, 
  getWorkspaceInsights, 
  formatRelativeTimestamp 
} from '../services/workspaceMetrics';
import { 
  checkSubjectReferences, 
  SubjectReferences 
} from '../api/subjectApi';
import { 
  BookOpen, 
  FileText, 
  Plus, 
  Edit3, 
  Star, 
  Layers, 
  Sparkles, 
  Clock, 
  BrainCircuit, 
  FolderKanban, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ListTree, 
  Tag, 
  Trash2, 
  AlertTriangle 
} from 'lucide-react';

interface WorkspaceViewProps {
  subjects: Subject[];
  topics: Topic[];
  notes: Note[];
  flashcards: Flashcard[];
  onAddSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => void;
  onDeleteSubject?: (id: string) => Promise<void> | void;
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => void;
  onUpdateNote: (id: string, content: string, title?: string) => void;
}

// Framer Motion Animation Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
};

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  subjects,
  topics,
  notes,
  flashcards,
  onAddSubject,
  onDeleteSubject,
  onAddNote,
  onUpdateNote,
}) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    subjects[0]?.id || null
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    notes[0]?.id || null
  );

  const [activeTab, setActiveTab] = useState<'notes' | 'flashcards' | 'topics'>('notes');

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

  // Subject Deletion State
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [deleteReferences, setDeleteReferences] = useState<SubjectReferences | null>(null);
  const [isDeleteSubjectModalOpen, setIsDeleteSubjectModalOpen] = useState(false);

  const handleInitiateSubjectDelete = async (subjectId: string) => {
    const sub = subjects.find((s) => s.id === subjectId);
    if (!sub) return;
    const refs = await checkSubjectReferences(subjectId);
    setSubjectToDelete(sub);
    setDeleteReferences(refs);
    setIsDeleteSubjectModalOpen(true);
  };

  // New Subject Form State
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubColor, setNewSubColor] = useState('var(--accent-blue)');
  const [newSubGrade, setNewSubGrade] = useState('A');
  const [newSubConfidence, setNewSubConfidence] = useState(70);

  // New Note Form State
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteTags, setNewNoteTags] = useState('');

  // Active Note Editor State
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editContent, setEditContent] = useState(selectedNote?.content || '');

  // Flashcard Review State
  const [flashcardIdx, setFlashcardIdx] = useState(0);
  const [showFlashcardBack, setShowFlashcardBack] = useState(false);

  // Derived Business Logic & Metrics
  const overview = calculateWorkspaceOverview(subjects, topics, notes, flashcards);
  const subjectCards = calculateSubjectWorkspaceCards(subjects, notes, flashcards, topics);
  const recentActivity = getRecentActivity(notes, flashcards);
  const workspaceInsights = getWorkspaceInsights(subjects, notes, flashcards);

  const filteredNotes = notes.filter((n) =>
    selectedSubjectId ? n.subjectId === selectedSubjectId : true
  );

  const filteredFlashcards = flashcards.filter((f) =>
    selectedSubjectId ? f.subjectId === selectedSubjectId : true
  );

  const filteredTopics = topics.filter((t) =>
    selectedSubjectId ? t.subjectId === selectedSubjectId : true
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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 md:p-8 max-w-7xl mx-auto space-y-8"
    >
      {/* 1. HERO SECTION: Title & Workspace Action Bar */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Workspace Hub
            </h1>
            <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-1">
              Central operational workspace for courses, notes, flashcards, and topic outlines.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => setIsSubjectModalOpen(true)}
            >
              Add Subject
            </Button>
            <Button
              variant="purple"
              size="md"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsNoteModalOpen(true)}
            >
              New Note
            </Button>
          </div>
        </div>
      </motion.section>

      {/* 2. WORKSPACE OVERVIEW CARDS (4 Metric Row) */}
      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Active Subjects</span>
            <BookOpen className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.totalSubjects}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Avg Mastery: {overview.avgConfidence}%</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Study Notes</span>
            <FileText className="w-4 h-4 text-[var(--accent-purple)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.totalNotes} <span className="text-xs font-normal text-[var(--text-muted)]">({overview.favoriteNotesCount} starred)</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Logged markdown notes</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Flashcard Decks</span>
            <Layers className="w-4 h-4 text-[var(--accent-emerald)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.totalFlashcards}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Spaced repetition cards</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Covered Topics</span>
            <ListTree className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.totalTopics}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Outlined curriculum topics</p>
        </Card>
      </motion.section>

      {/* 3. SUBJECT WORKSPACE CARDS GRID */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[var(--accent-blue)]" />
            Course Modules Workspace
          </h3>
          {selectedSubjectId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedSubjectId(null)}
              className="text-xs text-[var(--accent-blue)]"
            >
              Show All Subjects
            </Button>
          )}
        </div>

        {subjectCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {subjectCards.map((sub) => {
              const isSelected = selectedSubjectId === sub.id;
              return (
                <Card
                  key={sub.id}
                  interactive
                  onClick={() => setSelectedSubjectId(isSelected ? null : sub.id)}
                  className={`p-5 space-y-3 transition-all border ${
                    isSelected
                      ? 'border-[var(--accent-blue)] bg-[var(--bg-secondary)] ring-1 ring-[var(--accent-blue)]/50'
                      : 'border-[var(--border-glass)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono"
                      style={{ backgroundColor: `${sub.color}20`, color: sub.color }}
                    >
                      {sub.code || sub.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="gray" size="sm">
                        Target: {sub.targetGrade || 'A'}
                      </Badge>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInitiateSubjectDelete(sub.id);
                        }}
                        title="Delete Subject"
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-rose)] rounded-lg hover:bg-[var(--accent-rose)]/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{sub.name}</h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {sub.notesCount} notes • {sub.flashcardsCount} flashcards
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-glass)] space-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                      <span>Mastery Index</span>
                      <span className="font-semibold text-[var(--text-primary)]">{sub.confidenceRating}%</span>
                    </div>
                    <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${sub.confidenceRating}%`, backgroundColor: sub.color }}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center space-y-3 border border-dashed border-[var(--border-glass)]">
            <p className="text-xs text-[var(--text-secondary)] font-medium">No subjects configured</p>
            <p className="text-[11px] text-[var(--text-muted)]">Add your academic subjects to group study notes and flashcards.</p>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsSubjectModalOpen(true)}
              className="mt-2"
            >
              Create Subject
            </Button>
          </Card>
        )}
      </motion.section>

      {/* 4. ACTIVE CONTENT BOARD: Tabs (Notes, Flashcards, Topics) */}
      <motion.section variants={itemVariants} className="space-y-4">
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
            Flashcard Decks ({filteredFlashcards.length})
          </Button>
          <Button
            variant={activeTab === 'topics' ? 'emerald' : 'ghost'}
            size="sm"
            icon={<ListTree className="w-4 h-4" />}
            onClick={() => setActiveTab('topics')}
          >
            Topic Outlines ({filteredTopics.length})
          </Button>
        </div>

        {activeTab === 'notes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Note List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent-purple)]" />
                  Notes Queue
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

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredNotes.length === 0 ? (
                  <Card className="p-8 text-center text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-glass)]">
                    No notes created for this selection yet.
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
                        className={`p-4 transition-all border ${
                          isSelected
                            ? 'border-[var(--accent-purple)] bg-[var(--bg-secondary)]'
                            : 'border-[var(--border-glass)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h5 className="text-xs font-bold text-[var(--text-primary)] truncate">{n.title}</h5>
                          {n.isFavorite && <Star className="w-3.5 h-3.5 text-[var(--accent-amber)] fill-current shrink-0" />}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{n.content}</p>
                        {n.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {n.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 bg-[var(--border-glass)] text-[var(--text-secondary)] text-[10px] rounded font-mono"
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
                <Card className="p-6 space-y-4 border border-[var(--border-glass)]">
                  <div className="flex items-center justify-between pb-4 border-b border-[var(--border-glass)]">
                    <div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)]">{selectedNote.title}</h3>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
                        Updated {formatRelativeTimestamp(selectedNote.updatedAt)}
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
                      className="w-full h-80 p-4 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
                    />
                  ) : (
                    <div className="prose max-w-none text-[var(--text-primary)] text-xs leading-relaxed whitespace-pre-line font-sans space-y-2 min-h-[200px]">
                      {selectedNote.content}
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="p-12 text-center text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-glass)]">
                  Select a note from the queue to view or edit its contents.
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === 'flashcards' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            {filteredFlashcards.length > 0 ? (
              <Card className="p-8 text-center space-y-6 border border-[var(--border-glass)]">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono">
                  <span>SPACED REPETITION DECK</span>
                  <span>Card {Math.min(flashcardIdx + 1, filteredFlashcards.length)} of {filteredFlashcards.length}</span>
                </div>

                <div
                  onClick={() => setShowFlashcardBack(!showFlashcardBack)}
                  className="p-10 bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded-2xl cursor-pointer min-h-[180px] flex items-center justify-center text-center transition-all hover:border-[var(--accent-purple)]"
                >
                  {showFlashcardBack ? (
                    <div className="space-y-2">
                      <Badge variant="emerald" size="sm">Answer</Badge>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {filteredFlashcards[flashcardIdx % filteredFlashcards.length]?.back || 'No answer'}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant="purple" size="sm">Question (Click to Flip)</Badge>
                      <div className="text-base font-bold text-[var(--text-primary)]">
                        {filteredFlashcards[flashcardIdx % filteredFlashcards.length]?.front || 'No question'}
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
                      setFlashcardIdx((prev) => (prev + 1) % filteredFlashcards.length);
                    }}
                  >
                    Next Card
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-12 text-center text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-glass)]">
                No flashcards created for this subject selection yet.
              </Card>
            )}
          </div>
        )}

        {activeTab === 'topics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTopics.length > 0 ? (
              filteredTopics.map((top) => (
                <Card key={top.id} className="p-4 space-y-2 border border-[var(--border-glass)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListTree className="w-4 h-4 text-[var(--accent-emerald)]" />
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{top.title}</h4>
                    </div>
                    <Badge variant="emerald" size="sm">
                      {top.masteryLevel}% Mastery
                    </Badge>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-12 md:col-span-2 text-center text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-glass)]">
                No topic outlines configured for this subject selection yet.
              </Card>
            )}
          </div>
        )}
      </motion.section>

      {/* 5. RECENT ACTIVITY & 6. PRODUCTIVITY INSIGHTS */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Feed */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Recent Workspace Activity</h3>
                <p className="text-xs text-[var(--text-secondary)]">Recently updated study assets</p>
              </div>
            </div>
            <Badge variant="blue" size="sm">Real Time</Badge>
          </div>

          {recentActivity.length > 0 ? (
            <div className="space-y-2.5">
              {recentActivity.map((act) => (
                <div
                  key={act.id}
                  className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--bg-card)] text-[var(--accent-blue)] shrink-0">
                      {act.type === 'note' ? <FileText className="w-4 h-4 text-[var(--accent-purple)]" /> : <Layers className="w-4 h-4 text-[var(--accent-emerald)]" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-[var(--text-primary)] truncate">{act.title}</h4>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{act.subtitle}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                    {formatRelativeTimestamp(act.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 bg-[var(--bg-tertiary)]/50 rounded-xl border border-dashed border-[var(--border-glass)]">
              <p className="text-xs text-[var(--text-secondary)] font-medium">No recent activity</p>
              <p className="text-[11px] text-[var(--text-muted)]">Create study notes or flashcards to start logging history.</p>
            </div>
          )}
        </Card>

        {/* Productivity Insights */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Workspace Insights</h3>
              <p className="text-xs text-[var(--text-secondary)]">Deterministic study recommendations</p>
            </div>
          </div>

          {workspaceInsights.length > 0 ? (
            <div className="space-y-3">
              {workspaceInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-1.5 text-xs"
                >
                  <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                    <AlertCircle className="w-4 h-4 text-[var(--accent-amber)] shrink-0" />
                    <span>{insight.title}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {insight.description}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 bg-[var(--bg-tertiary)]/50 rounded-xl border border-dashed border-[var(--border-glass)]">
              <CheckCircle2 className="w-5 h-5 text-[var(--accent-emerald)] mx-auto" />
              <p className="text-xs text-[var(--text-secondary)] font-medium">Healthy Coverage</p>
              <p className="text-[11px] text-[var(--text-muted)]">No knowledge gaps or low-confidence alerts detected.</p>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => setIsNoteModalOpen(true)}
            >
              Add Study Note
            </Button>
          </div>
        </Card>
      </motion.section>

      {/* 7. QUICK ACTIONS */}
      <motion.section variants={itemVariants} className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Workspace Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card
            interactive
            onClick={() => setIsSubjectModalOpen(true)}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Add Subject</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Course module</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => setIsNoteModalOpen(true)}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">New Note</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Markdown note</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => setActiveTab('flashcards')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Flashcard Deck</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Review deck</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => setActiveTab('topics')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
              <ListTree className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Topic Outlines</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Curriculum tree</p>
            </div>
          </Card>
        </div>
      </motion.section>

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

      {/* Delete Subject Modal */}
      <Modal
        isOpen={isDeleteSubjectModalOpen}
        onClose={() => setIsDeleteSubjectModalOpen(false)}
        title={
          deleteReferences && !deleteReferences.isDeletable ? (
            <span className="text-[var(--accent-rose)] font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              Cannot Delete Subject
            </span>
          ) : (
            <span>Confirm Subject Deletion</span>
          )
        }
      >
        {deleteReferences && !deleteReferences.isDeletable ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              This subject cannot be deleted because it is still being used. Remove or reassign all associated items before deleting it.
            </p>

            <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-2">
              <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Blocking References:
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {deleteReferences.tasks > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.tasks} Task(s)
                  </Badge>
                )}
                {deleteReferences.notes > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.notes} Note(s)
                  </Badge>
                )}
                {deleteReferences.flashcards > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.flashcards} Flashcard(s)
                  </Badge>
                )}
                {deleteReferences.sessions > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.sessions} Focus Session(s)
                  </Badge>
                )}
                {deleteReferences.topics > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.topics} Topic(s)
                  </Badge>
                )}
                {deleteReferences.goals > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.goals} Goal(s)
                  </Badge>
                )}
                {deleteReferences.aiConversations > 0 && (
                  <Badge variant="rose" size="sm">
                    {deleteReferences.aiConversations} AI Chat(s)
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" size="md" onClick={() => setIsDeleteSubjectModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-primary)]">
              Delete subject <span className="font-bold text-[var(--accent-blue)]">'{subjectToDelete?.name}'</span>?
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
              <Button variant="ghost" size="md" onClick={() => setIsDeleteSubjectModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={async () => {
                  if (subjectToDelete && onDeleteSubject) {
                    await onDeleteSubject(subjectToDelete.id);
                  }
                  setIsDeleteSubjectModalOpen(false);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
};
