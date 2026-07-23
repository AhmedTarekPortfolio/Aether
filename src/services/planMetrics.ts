import { Task, Subject, TaskPriority } from '../types';

export interface PlanOverviewMetrics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  completionPercentage: number;
  upcomingDeadlinesCount: number;
  tasksThisWeekCount: number;
  totalWorkloadMinutes: number;
}

export interface SubjectPlanningSummary {
  subjectId: string;
  name: string;
  code?: string;
  color: string;
  confidenceRating: number;
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  completionPercentage: number;
  remainingMinutes: number;
  highestPriority: TaskPriority | 'none';
}

export interface DailyWorkloadMetric {
  day: string;
  dateStr: string;
  tasksCount: number;
  totalMinutes: number;
}

export interface PriorityHighlights {
  overdueTasks: Task[];
  urgentTasks: Task[];
  nextRecommendedTask: Task | null;
}

/**
 * Calculates overall planning overview statistics.
 */
export function calculatePlanOverview(tasks: Task[]): PlanOverviewMetrics {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = totalTasks - completedTasks;
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const upcomingDeadlinesCount = tasks.filter(
    (t) => t.status !== 'completed' && t.dueDate && t.dueDate > now
  ).length;

  const tasksThisWeekCount = tasks.filter(
    (t) => t.status !== 'completed' && t.dueDate && t.dueDate >= now && t.dueDate <= now + weekMs
  ).length;

  const totalWorkloadMinutes = tasks
    .filter((t) => t.status !== 'completed')
    .reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    completionPercentage,
    upcomingDeadlinesCount,
    tasksThisWeekCount,
    totalWorkloadMinutes,
  };
}

/**
 * Derives planning metrics grouped per subject.
 */
export function calculateSubjectSummaries(
  tasks: Task[],
  subjects: Subject[]
): SubjectPlanningSummary[] {
  const priorityRank: Record<TaskPriority, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return subjects.map((subject) => {
    const subjectTasks = tasks.filter((t) => t.subjectId === subject.id);
    const totalTasks = subjectTasks.length;
    const completedTasks = subjectTasks.filter((t) => t.status === 'completed').length;
    const remainingTasks = totalTasks - completedTasks;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const remainingMinutes = subjectTasks
      .filter((t) => t.status !== 'completed')
      .reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);

    const pendingTasks = subjectTasks.filter((t) => t.status !== 'completed');
    let highestPriority: TaskPriority | 'none' = 'none';
    let maxRank = 0;

    for (const t of pendingTasks) {
      const rank = priorityRank[t.priority] || 0;
      if (rank > maxRank) {
        maxRank = rank;
        highestPriority = t.priority;
      }
    }

    return {
      subjectId: subject.id,
      name: subject.name,
      code: subject.code,
      color: subject.color,
      confidenceRating: subject.confidenceRating,
      totalTasks,
      completedTasks,
      remainingTasks,
      completionPercentage,
      remainingMinutes,
      highestPriority,
    };
  });
}

/**
 * Computes 7-day workload distribution from real tasks and due dates.
 */
export function calculateWeeklyWorkload(tasks: Task[]): DailyWorkloadMetric[] {
  const result: DailyWorkloadMetric[] = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);

    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });

    let tasksCount = 0;
    let totalMinutes = 0;

    for (const t of tasks) {
      if (t.dueDate) {
        const tDateStr = new Date(t.dueDate).toISOString().slice(0, 10);
        if (tDateStr === dateStr) {
          tasksCount++;
          if (t.status !== 'completed') {
            totalMinutes += t.estimatedMinutes || 0;
          }
        }
      }
    }

    result.push({
      day: dayLabel,
      dateStr,
      tasksCount,
      totalMinutes,
    });
  }

  return result;
}

/**
 * Extracts priority highlights: overdue tasks, urgent tasks, and next recommended task.
 */
export function getPriorityHighlights(tasks: Task[]): PriorityHighlights {
  const now = Date.now();
  const pending = tasks.filter((t) => t.status !== 'completed');

  const overdueTasks = pending
    .filter((t) => t.dueDate && t.dueDate < now)
    .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));

  const urgentTasks = pending
    .filter((t) => t.priority === 'urgent' || t.priority === 'high')
    .sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));

  // Determine next recommended task deterministically
  let nextRecommendedTask: Task | null = null;
  if (overdueTasks.length > 0) {
    nextRecommendedTask = overdueTasks[0];
  } else if (urgentTasks.length > 0) {
    nextRecommendedTask = urgentTasks[0];
  } else if (pending.length > 0) {
    nextRecommendedTask = pending.sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity))[0];
  }

  return {
    overdueTasks,
    urgentTasks,
    nextRecommendedTask,
  };
}

/**
 * Formats due date timestamp to relative string.
 */
export function formatDueDate(dueDate?: number): string {
  if (!dueDate) return 'No due date';

  const msLeft = dueDate - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (msLeft < 0) {
    const daysLate = Math.round(Math.abs(msLeft) / dayMs);
    return daysLate === 0 ? 'Overdue today' : `${daysLate}d overdue`;
  }

  const hoursLeft = msLeft / (60 * 60 * 1000);
  if (hoursLeft < 24) return `Due in ${Math.max(1, Math.round(hoursLeft))}h`;

  const daysLeft = Math.round(hoursLeft / 24);
  return `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

/**
 * Generates calendar 7-day slot descriptors.
 */
export function getCalendarGridDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      dateStr: d.toISOString().slice(0, 10),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
    };
  });
}
