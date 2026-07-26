import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db, CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../../db/database';
import * as topicApi from '../topicApi';
import * as flashcardApi from '../flashcardApi';
import * as goalApi from '../goalApi';
import * as statisticApi from '../statisticApi';
import * as achievementApi from '../achievementApi';

describe('essential workspace repositories', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
    await db.users.put({ id: 'default_user', name: 'Test', email: 'test@example.com', academicLevel: 'Test', createdAt: 1, updatedAt: 1 });
    await db.subjects.put({ id: 'subject-1', userId: 'default_user', name: 'Biology', color: '#fff', confidenceRating: 0, createdAt: 1 });
  });
  afterEach(() => db.close());

  it('creates, updates, persists, and safely deletes topics', async () => {
    await topicApi.addTopic({ id: 'topic-1', subjectId: 'subject-1', title: ' Cells ', masteryLevel: 10 });
    await topicApi.updateTopic('topic-1', { title: 'Cell biology', masteryLevel: 30 });
    db.close(); await db.open();
    expect((await topicApi.getTopics())[0]).toMatchObject({ title: 'Cell biology', masteryLevel: 30 });
    await db.notes.add({ id: 'note-1', subjectId: 'subject-1', topicId: 'topic-1', title: 'N', content: '', tags: [], updatedAt: 1 });
    await expect(topicApi.deleteTopic('topic-1')).rejects.toThrow(/referenced/);
    await db.notes.clear();
    await topicApi.deleteTopic('topic-1');
    expect(await topicApi.getTopics()).toEqual([]);
  });

  it('rejects invalid topic parents and values', async () => {
    await expect(topicApi.addTopic({ id: 'bad', subjectId: 'missing', title: 'X', masteryLevel: 0 })).rejects.toThrow(/subject/);
    await expect(topicApi.addTopic({ id: 'bad', subjectId: 'subject-1', title: ' ', masteryLevel: 0 })).rejects.toThrow(/empty/);
  });

  it('creates, edits, persists, and deletes owned flashcards', async () => {
    const base = { id: 'card-1', userId: 'default_user', subjectId: 'subject-1', front: 'Q', back: 'A', easeFactor: 2.5, interval: 0, repetitions: 0, nextReviewDate: 1 };
    await flashcardApi.addFlashcard(base);
    await flashcardApi.updateFlashcard('card-1', { front: 'Question', back: 'Answer' });
    db.close(); await db.open();
    expect((await flashcardApi.getFlashcards())[0]).toMatchObject({ front: 'Question', back: 'Answer' });
    await flashcardApi.deleteFlashcard('card-1');
    expect(await flashcardApi.getFlashcards()).toEqual([]);
  });

  it('rejects empty flashcards and mismatched topics', async () => {
    const base = { id: 'card-1', userId: 'default_user', subjectId: 'subject-1', front: '', back: 'A', easeFactor: 2.5, interval: 0, repetitions: 0, nextReviewDate: 1 };
    await expect(flashcardApi.addFlashcard(base)).rejects.toThrow(/question/);
    await db.topics.add({ id: 'other-topic', subjectId: 'other-subject', title: 'X', masteryLevel: 0 });
    await expect(flashcardApi.addFlashcard({ ...base, front: 'Q', topicId: 'other-topic' })).rejects.toThrow(/does not belong/);
  });

  it('creates, updates status and progress, persists, and deletes goals', async () => {
    await goalApi.addGoal({ id: 'goal-1', userId: 'default_user', title: 'Read', description: '', type: 'custom', targetValue: 10, currentValue: 0, unit: 'pages', status: 'active', createdAt: 1 });
    await goalApi.updateGoal('goal-1', { currentValue: 10, status: 'completed' });
    db.close(); await db.open();
    expect((await goalApi.getGoals())[0]).toMatchObject({ currentValue: 10, status: 'completed' });
    expect((await goalApi.getGoals())[0].completedAt).toBeTypeOf('number');
    await goalApi.deleteGoal('goal-1');
    expect(await goalApi.getGoals()).toEqual([]);
  });

  it('reads persisted statistics and returns canonical achievements without resetting progress', async () => {
    await db.statistics.add({ id: 'stat-1', userId: 'default_user', metricKey: 'focus_minutes', periodStart: 1, periodEnd: 2, value: 25, computedAt: 2 });
    await db.user_achievements.add({ id: 'earned-1', userId: 'default_user', achievementId: 'ach_first_task', progress: 1, unlockedAt: 2 });
    expect(await statisticApi.getStatistics()).toHaveLength(1);
    expect(await achievementApi.getAchievementDefinitions()).toEqual(CANONICAL_ACHIEVEMENT_DEFINITIONS);
    await achievementApi.getAchievementDefinitions();
    expect((await achievementApi.getUserAchievements())[0]).toMatchObject({ progress: 1, unlockedAt: 2 });
  });
});
