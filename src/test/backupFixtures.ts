import { CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../db/database';
import type { AetherBackupDataV2 } from '../types';

export function createBackupSnapshotFixture(prefix = 'fixture'): AetherBackupDataV2 {
  const user = `${prefix}-user`;
  const subject = `${prefix}-subject`;
  const topic = `${prefix}-topic`;
  const task = `${prefix}-task`;
  return {
    users: [{ id: user, name: 'Synthetic learner', email: `${prefix}@example.test`, academicLevel: 'UG', createdAt: 1, updatedAt: 2 }],
    settings: [{ id: `${prefix}-settings`, userId: user, theme: 'dark', soundEnabled: true, aiProvider: 'local', notificationsEnabled: true, studyGoalHoursWeekly: 10, updatedAt: 2 }],
    subjects: [{ id: subject, userId: user, name: 'Synthetic subject', color: '#123456', confidenceRating: 50, createdAt: 3 }],
    topics: [{ id: topic, subjectId: subject, title: 'Synthetic topic', masteryLevel: 20 }],
    tasks: [{ id: task, userId: user, subjectId: subject, title: 'Synthetic task', priority: 'low', estimatedMinutes: 10, completedMinutes: 0, status: 'todo', createdAt: 4 }],
    notes: [{ id: `${prefix}-note`, userId: user, subjectId: subject, topicId: topic, title: 'Synthetic note', content: 'Controlled fixture text.', tags: [], updatedAt: 5 }],
    flashcards: [{ id: `${prefix}-card`, userId: user, subjectId: subject, topicId: topic, front: 'Question', back: 'Answer', easeFactor: 2.5, interval: 1, repetitions: 0, nextReviewDate: 6 }],
    sessions: [{ id: `${prefix}-session`, userId: user, subjectId: subject, taskId: task, type: 'pomodoro', durationMinutes: 25, distractionCount: 0, completedAt: 7 }],
    goals: [{ id: `${prefix}-goal`, userId: user, subjectId: subject, title: 'Synthetic goal', description: 'Controlled fixture text.', type: 'custom', targetValue: 1, currentValue: 0, unit: 'item', status: 'active', createdAt: 8 }],
    ai_conversations: [{ id: `${prefix}-ai`, userId: user, subjectId: subject, taskId: task, role: 'assistant', mode: 'tutor', prompt: 'Synthetic prompt.', response: 'Synthetic response.', timestamp: 9, generationStatus: 'complete' }],
    statistics: [{ id: `${prefix}-stat`, userId: user, metricKey: 'focus', periodStart: 1, periodEnd: 2, value: 1, computedAt: 3 }],
    achievement_definitions: structuredClone(CANONICAL_ACHIEVEMENT_DEFINITIONS),
    user_achievements: [{ id: `${prefix}-achievement`, userId: user, achievementId: 'ach_first_task', progress: 1 }],
    notifications: [{ id: `${prefix}-notification`, userId: user, type: 'system', title: 'Synthetic notification', message: 'Controlled fixture text.', relatedTaskId: task, relatedSubjectId: subject, read: false, createdAt: 10 }],
  };
}
