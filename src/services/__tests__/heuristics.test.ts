import { describe, it, expect } from 'vitest';
import { calculateNextBestAction } from '../heuristics';
import { Task, Subject } from '../../types';

describe('Heuristics Engine (calculateNextBestAction)', () => {
  it('returns null when there are no tasks', () => {
    const result = calculateNextBestAction([], []);
    expect(result).toBeNull();
  });

  it('returns null when all tasks are completed', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Completed Task',
        priority: 'high',
        estimatedMinutes: 30,
        completedMinutes: 30,
        status: 'completed',
        createdAt: Date.now(),
      },
    ];
    const result = calculateNextBestAction(tasks, []);
    expect(result).toBeNull();
  });

  it('selects an overdue high-priority task over a low-priority task without a deadline', () => {
    const now = Date.now();
    const tasks: Task[] = [
      {
        id: 'task_low',
        title: 'Low Priority Task',
        priority: 'low',
        estimatedMinutes: 30,
        completedMinutes: 0,
        status: 'todo',
        createdAt: now,
      },
      {
        id: 'task_urgent',
        title: 'Urgent Overdue Task',
        priority: 'urgent',
        dueDate: now - 3600 * 1000, // overdue by 1 hour
        estimatedMinutes: 60,
        completedMinutes: 0,
        status: 'todo',
        createdAt: now,
      },
    ];

    const result = calculateNextBestAction(tasks, []);

    expect(result).not.toBeNull();
    expect(result?.taskId).toBe('task_urgent');
    expect(result?.title).toBe('Urgent Overdue Task');
  });

  it('populates explainability factors and confidence score correctly for a two-task scenario', () => {
    const now = Date.now();
    const subjects: Subject[] = [
      {
        id: 'sub_cs',
        name: 'Computer Science',
        color: '#4F7CFF',
        confidenceRating: 40, // Low confidence gap (60%)
        createdAt: now,
      },
    ];

    const tasks: Task[] = [
      {
        id: 't1',
        subjectId: 'sub_cs',
        title: 'DP Homework',
        priority: 'high',
        dueDate: now + 5 * 3600 * 1000, // Due in 5h
        estimatedMinutes: 45,
        completedMinutes: 0,
        status: 'todo',
        createdAt: now,
      },
      {
        id: 't2',
        subjectId: 'sub_cs',
        title: 'Light Reading',
        priority: 'low',
        estimatedMinutes: 15,
        completedMinutes: 0,
        status: 'todo',
        createdAt: now,
      },
    ];

    const result = calculateNextBestAction(tasks, subjects);

    expect(result).not.toBeNull();
    expect(result?.taskId).toBe('t1');
    expect(result?.confidenceScore).toBeGreaterThanOrEqual(72);
    expect(result?.confidenceScore).toBeLessThanOrEqual(98);
    expect(result?.factors.length).toBe(4);
    expect(result?.actionableSteps.length).toBeGreaterThan(0);
    expect(result?.factors.map((f) => f.category)).toEqual([
      'deadline',
      'confidence',
      'priority',
      'energy',
    ]);
  });
});
