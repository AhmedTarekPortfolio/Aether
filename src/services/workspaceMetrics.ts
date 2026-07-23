import { Subject, Topic, Note, Flashcard } from '../types';

export interface WorkspaceOverviewMetrics {
  totalSubjects: number;
  totalNotes: number;
  totalFlashcards: number;
  totalTopics: number;
  avgConfidence: number;
  favoriteNotesCount: number;
}

export interface SubjectWorkspaceCardMetrics {
  id: string;
  name: string;
  code?: string;
  color: string;
  confidenceRating: number;
  targetGrade?: string;
  notesCount: number;
  flashcardsCount: number;
  topicsCount: number;
  lastUpdatedNoteTitle?: string;
  lastUpdatedAt?: number;
}

export interface ActivityItem {
  id: string;
  type: 'note' | 'flashcard';
  title: string;
  subjectId: string;
  timestamp: number;
  subtitle?: string;
}

export interface WorkspaceInsight {
  id: string;
  type: 'focus_needed' | 'well_documented' | 'gap_detected';
  title: string;
  description: string;
  subjectId?: string;
}

/**
 * Calculates high-level overview metrics for the Workspace operational dashboard.
 */
export function calculateWorkspaceOverview(
  subjects: Subject[],
  topics: Topic[],
  notes: Note[],
  flashcards: Flashcard[]
): WorkspaceOverviewMetrics {
  const totalSubjects = subjects.length;
  const totalNotes = notes.length;
  const totalFlashcards = flashcards.length;
  const totalTopics = topics.length;

  const totalConfidence = subjects.reduce((acc, s) => acc + (s.confidenceRating || 0), 0);
  const avgConfidence = totalSubjects > 0 ? Math.round(totalConfidence / totalSubjects) : 0;

  const favoriteNotesCount = notes.filter((n) => n.isFavorite).length;

  return {
    totalSubjects,
    totalNotes,
    totalFlashcards,
    totalTopics,
    avgConfidence,
    favoriteNotesCount,
  };
}

/**
 * Computes individual subject workspace card statistics.
 */
export function calculateSubjectWorkspaceCards(
  subjects: Subject[],
  notes: Note[],
  flashcards: Flashcard[],
  topics: Topic[]
): SubjectWorkspaceCardMetrics[] {
  return subjects.map((subject) => {
    const subjectNotes = notes.filter((n) => n.subjectId === subject.id);
    const subjectFlashcards = flashcards.filter((f) => f.subjectId === subject.id);
    const subjectTopics = topics.filter((t) => t.subjectId === subject.id);

    const sortedNotes = [...subjectNotes].sort((a, b) => b.updatedAt - a.updatedAt);
    const lastNote = sortedNotes[0];

    return {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      color: subject.color,
      confidenceRating: subject.confidenceRating,
      targetGrade: subject.targetGrade,
      notesCount: subjectNotes.length,
      flashcardsCount: subjectFlashcards.length,
      topicsCount: subjectTopics.length,
      lastUpdatedNoteTitle: lastNote?.title,
      lastUpdatedAt: lastNote?.updatedAt,
    };
  });
}

/**
 * Derives recent user activity feed from notes and flashcard timestamps.
 */
export function getRecentActivity(
  notes: Note[],
  flashcards: Flashcard[],
  limit: number = 5
): ActivityItem[] {
  const activity: ActivityItem[] = [];

  for (const n of notes) {
    activity.push({
      id: n.id,
      type: 'note',
      title: n.title,
      subjectId: n.subjectId,
      timestamp: n.updatedAt,
      subtitle: n.tags.length > 0 ? `#${n.tags.join(', #')}` : 'Study Note',
    });
  }

  for (const f of flashcards) {
    activity.push({
      id: f.id,
      type: 'flashcard',
      title: f.front,
      subjectId: f.subjectId,
      timestamp: f.nextReviewDate || Date.now(),
      subtitle: `Flashcard • ${f.repetitions > 0 ? `Rep ${f.repetitions}` : 'New Card'}`,
    });
  }

  return activity.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

/**
 * Extracts deterministic insights from subjects, notes, and flashcards.
 */
export function getWorkspaceInsights(
  subjects: Subject[],
  notes: Note[],
  flashcards: Flashcard[]
): WorkspaceInsight[] {
  const insights: WorkspaceInsight[] = [];
  if (subjects.length === 0) return insights;

  // 1. Lowest confidence subject
  const sortedByConfidence = [...subjects].sort((a, b) => a.confidenceRating - b.confidenceRating);
  const lowest = sortedByConfidence[0];
  if (lowest && lowest.confidenceRating < 80) {
    insights.push({
      id: `low_conf_${lowest.id}`,
      type: 'focus_needed',
      title: `Low Mastery Alert: ${lowest.code || lowest.name}`,
      description: `Confidence is currently ${lowest.confidenceRating}%. Review key concepts or generate flashcards.`,
      subjectId: lowest.id,
    });
  }

  // 2. Subject with most notes
  const cards = calculateSubjectWorkspaceCards(subjects, notes, flashcards, []);
  const sortedByNotes = [...cards].sort((a, b) => b.notesCount - a.notesCount);
  const topNotesSubject = sortedByNotes[0];
  if (topNotesSubject && topNotesSubject.notesCount > 0) {
    insights.push({
      id: `top_notes_${topNotesSubject.id}`,
      type: 'well_documented',
      title: `Strong Knowledge Base: ${topNotesSubject.code || topNotesSubject.name}`,
      description: `${topNotesSubject.notesCount} study notes logged for this module.`,
      subjectId: topNotesSubject.id,
    });
  }

  // 3. Gap detected (notes exist but no flashcards)
  const gapSubject = cards.find((c) => c.notesCount > 0 && c.flashcardsCount === 0);
  if (gapSubject) {
    insights.push({
      id: `gap_${gapSubject.id}`,
      type: 'gap_detected',
      title: `Flashcard Gap: ${gapSubject.code || gapSubject.name}`,
      description: `Has ${gapSubject.notesCount} notes but zero active flashcards. Consider creating practice cards.`,
      subjectId: gapSubject.id,
    });
  }

  return insights;
}

/**
 * Formats a timestamp into a relative time string.
 */
export function formatRelativeTimestamp(timestamp?: number): string {
  if (!timestamp) return 'No activity';

  const elapsedMs = Date.now() - timestamp;
  if (elapsedMs < 0) return 'Just now';

  const mins = Math.floor(elapsedMs / (60 * 1000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
