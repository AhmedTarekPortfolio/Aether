import { describe, it, expect } from 'vitest';
import { 
  calculatePlanOverview, 
  calculateSubjectSummaries, 
  calculateWeeklyWorkload, 
  getPriorityHighlights,
  formatDueDate 
} from '../planMetrics';
import { Task, Subject } from '../../types';

describe('Plan Metrics Calculations (planMetrics.ts)', () => {
  const now = Date.now();

  const mockSubjects: Subject[] = [
    {
      id: 'sub_cs',
      name: 'Computer Science',
      code: 'CS 301',
      color: '#4F7CFF',
      confidenceRating: 75,
      createdAt: now,
    },
    {
      id: 'sub_math',
      name: 'Linear Algebra',
      code: 'MATH 210',
      color: '#2DD4BF',
      confidenceRating: 90,
      createdAt: now,
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task_1',
      title: 'DP Homework',
      subjectId: 'sub_cs',
      priority: 'urgent',
      estimatedMinutes: 60,
      completedMinutes: 0,
      status: 'todo',
      dueDate: now - 3600 * 1000, // Overdue by 1 hour
      createdAt: now,
    },
    {
      id: 'task_2',
      title: 'Matrix Proof',
      subjectId: 'sub_math',
      priority: 'high',
      estimatedMinutes: 45,
      completedMinutes: 45,
      status: 'completed',
      dueDate: now + 86400 * 1000,
      createdAt: now,
    },
    {
      id: 'task_3',
      title: 'Reading Assignment',
      subjectId: 'sub_cs',
      priority: 'medium',
      estimatedMinutes: 30,
      completedMinutes: 0,
      status: 'todo',
      dueDate: now + 2 * 86400 * 1000,
      createdAt: now,
    },
  ];

  it('calculates plan overview statistics correctly', () => {
    const overview = calculatePlanOverview(mockTasks);
    expect(overview.totalTasks).toBe(3);
    expect(overview.completedTasks).toBe(1);
    expect(overview.pendingTasks).toBe(2);
    expect(overview.completionPercentage).toBe(33); // 1/3 = 33%
    expect(overview.totalWorkloadMinutes).toBe(90); // 60 + 30
  });

  it('derives subject summaries accurately', () => {
    const summaries = calculateSubjectSummaries(mockTasks, mockSubjects);
    expect(summaries.length).toBe(2);

    const csSummary = summaries.find((s) => s.subjectId === 'sub_cs');
    expect(csSummary?.totalTasks).toBe(2);
    expect(csSummary?.completedTasks).toBe(0);
    expect(csSummary?.remainingTasks).toBe(2);
    expect(csSummary?.highestPriority).toBe('urgent');
    expect(csSummary?.remainingMinutes).toBe(90);

    const mathSummary = summaries.find((s) => s.subjectId === 'sub_math');
    expect(mathSummary?.completionPercentage).toBe(100);
    expect(mathSummary?.remainingTasks).toBe(0);
  });

  it('computes 7-day weekly workload distribution', () => {
    const weekly = calculateWeeklyWorkload(mockTasks);
    expect(weekly.length).toBe(7);
    expect(weekly[0].day).toBeDefined();
  });

  it('identifies overdue tasks and top priority recommendation', () => {
    const highlights = getPriorityHighlights(mockTasks);
    expect(highlights.overdueTasks.length).toBe(1);
    expect(highlights.overdueTasks[0].id).toBe('task_1');
    expect(highlights.nextRecommendedTask?.id).toBe('task_1');
  });

  it('formats due dates correctly into relative text', () => {
    expect(formatDueDate()).toBe('No due date');
    expect(formatDueDate(now - 86400 * 1000 * 2)).toBe('2d overdue');
    expect(formatDueDate(now + 5 * 60 * 60 * 1000)).toBe('Due in 5h');
  });
});
