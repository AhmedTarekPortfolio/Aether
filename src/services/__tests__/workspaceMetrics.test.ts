import { describe, it, expect } from 'vitest';
import { 
  calculateWorkspaceOverview, 
  calculateSubjectWorkspaceCards, 
  getRecentActivity, 
  getWorkspaceInsights, 
  formatRelativeTimestamp 
} from '../workspaceMetrics';
import { Subject, Topic, Note, Flashcard } from '../../types';

describe('Workspace Metrics Calculations (workspaceMetrics.ts)', () => {
  const now = Date.now();

  const mockSubjects: Subject[] = [
    {
      id: 'sub_cogs',
      name: 'Cognitive Science',
      code: 'COGS 101',
      color: '#4F7CFF',
      confidenceRating: 65,
      targetGrade: 'A',
      createdAt: now,
    },
    {
      id: 'sub_algo',
      name: 'Algorithms',
      code: 'CS 201',
      color: '#8B5CF6',
      confidenceRating: 90,
      targetGrade: 'A+',
      createdAt: now,
    },
  ];

  const mockTopics: Topic[] = [
    {
      id: 'top_1',
      subjectId: 'sub_cogs',
      title: 'Neural Networks Overview',
      masteryLevel: 75,
    },
  ];

  const mockNotes: Note[] = [
    {
      id: 'note_1',
      subjectId: 'sub_cogs',
      title: 'Synaptic Plasticity',
      content: 'LTP and LTD mechanisms',
      tags: ['neuro', 'biology'],
      updatedAt: now - 3600 * 1000, // 1h ago
      isFavorite: true,
    },
    {
      id: 'note_2',
      subjectId: 'sub_cogs',
      title: 'Visual Cortex Maps',
      content: 'V1 spatial orientation',
      tags: ['cortex'],
      updatedAt: now - 86400 * 1000, // 1d ago
    },
  ];

  const mockFlashcards: Flashcard[] = [
    {
      id: 'card_1',
      subjectId: 'sub_algo',
      front: 'Big-O of Quicksort',
      back: 'O(N log N) average',
      easeFactor: 2.5,
      interval: 1,
      repetitions: 2,
      nextReviewDate: now - 1800 * 1000, // 30m ago
    },
  ];

  it('calculates workspace overview statistics correctly', () => {
    const overview = calculateWorkspaceOverview(mockSubjects, mockTopics, mockNotes, mockFlashcards);
    expect(overview.totalSubjects).toBe(2);
    expect(overview.totalNotes).toBe(2);
    expect(overview.totalFlashcards).toBe(1);
    expect(overview.totalTopics).toBe(1);
    expect(overview.avgConfidence).toBe(78); // (65 + 90) / 2 = 77.5 -> 78
    expect(overview.favoriteNotesCount).toBe(1);
  });

  it('computes subject workspace cards accurately', () => {
    const cards = calculateSubjectWorkspaceCards(mockSubjects, mockNotes, mockFlashcards, mockTopics);
    expect(cards.length).toBe(2);

    const cogsCard = cards.find((c) => c.id === 'sub_cogs');
    expect(cogsCard?.notesCount).toBe(2);
    expect(cogsCard?.flashcardsCount).toBe(0);
    expect(cogsCard?.lastUpdatedNoteTitle).toBe('Synaptic Plasticity');

    const algoCard = cards.find((c) => c.id === 'sub_algo');
    expect(algoCard?.notesCount).toBe(0);
    expect(algoCard?.flashcardsCount).toBe(1);
  });

  it('derives recent activity feed chronologically', () => {
    const activity = getRecentActivity(mockNotes, mockFlashcards);
    expect(activity.length).toBe(3);
    // Most recent is card_1 (30m ago), then note_1 (1h ago), then note_2 (1d ago)
    expect(activity[0].id).toBe('card_1');
    expect(activity[1].id).toBe('note_1');
  });

  it('extracts deterministic insights correctly', () => {
    const insights = getWorkspaceInsights(mockSubjects, mockNotes, mockFlashcards);
    expect(insights.length).toBeGreaterThan(0);

    const lowConf = insights.find((i) => i.type === 'focus_needed');
    expect(lowConf?.subjectId).toBe('sub_cogs');

    const gap = insights.find((i) => i.type === 'gap_detected');
    expect(gap?.subjectId).toBe('sub_cogs'); // COGS has notes but 0 flashcards
  });

  it('formats relative timestamps correctly', () => {
    expect(formatRelativeTimestamp()).toBe('No activity');
    expect(formatRelativeTimestamp(now - 1200 * 1000)).toBe('20m ago');
    expect(formatRelativeTimestamp(now - 3600 * 1000 * 3)).toBe('3h ago');
    expect(formatRelativeTimestamp(now - 86400 * 1000 * 2)).toBe('2d ago');
  });
});
