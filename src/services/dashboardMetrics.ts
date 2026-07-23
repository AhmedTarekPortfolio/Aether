import { Task, Subject, FocusSession } from '../types';

export interface DailyFocusMetric {
  day: string;
  minutes: number;
}

export interface SecondaryRecommendation {
  id: string;
  type: 'lowest_confidence' | 'overdue_tasks';
  title: string;
  description: string;
  actionText: string;
  tabTarget: 'workspace' | 'plan';
}

/**
 * Calculates consecutive study streak ending on the latest active day (today or yesterday).
 */
export function calculateStudyStreak(sessions: FocusSession[]): number {
  if (!sessions || sessions.length === 0) return 0;

  // Set of YYYY-MM-DD strings for days with >= 1 session
  const activeDays = new Set<string>();
  for (const s of sessions) {
    if (s.completedAt) {
      const dateStr = new Date(s.completedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
      activeDays.add(dateStr);
    }
  }

  if (activeDays.size === 0) return 0;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA');

  // Find most recent day with a session
  const sortedDays = Array.from(activeDays).sort((a, b) => b.localeCompare(a));
  const latestActiveDay = sortedDays[0];

  // If latest active day is prior to yesterday, streak is broken
  if (latestActiveDay < yesterdayStr && latestActiveDay !== todayStr) {
    return 0;
  }

  let streak = 0;
  let curr = new Date(latestActiveDay + 'T12:00:00');

  while (true) {
    const currStr = curr.toLocaleDateString('en-CA');
    if (activeDays.has(currStr)) {
      streak++;
      curr.setDate(curr.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Filters tasks due during the current local calendar day (midnight to 23:59:59), pending status.
 */
export function getTodaysTasks(tasks: Task[]): Task[] {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const startMs = startOfDay.getTime();
  const endMs = endOfDay.getTime();

  return tasks
    .filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate >= startMs && t.dueDate <= endMs)
    .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
}

/**
 * Computes actual total focus duration minutes per day for the last 7 calendar days ending today.
 */
export function getWeeklyFocusMinutes(sessions: FocusSession[]): DailyFocusMetric[] {
  const days: DailyFocusMetric[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);

    const dateStr = d.toLocaleDateString('en-CA');
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });

    let minutes = 0;
    for (const s of sessions) {
      if (s.completedAt) {
        const sDateStr = new Date(s.completedAt).toLocaleDateString('en-CA');
        if (sDateStr === dateStr) {
          minutes += s.durationMinutes || 0;
        }
      }
    }

    days.push({ day: dayLabel, minutes });
  }

  return days;
}

/**
 * Computes 4 key header progress metrics from real data.
 */
export function getDashboardOverviewMetrics(
  tasks: Task[],
  subjects: Subject[],
  sessions: FocusSession[]
) {
  const todayStr = new Date().toLocaleDateString('en-CA');

  const focusMinutesToday = sessions.reduce((acc, s) => {
    if (s.completedAt && new Date(s.completedAt).toLocaleDateString('en-CA') === todayStr) {
      return acc + (s.durationMinutes || 0);
    }
    return acc;
  }, 0);

  const tasksCompletedToday = tasks.reduce((acc, t) => {
    if (t.status === 'completed' && t.completedAt && new Date(t.completedAt).toLocaleDateString('en-CA') === todayStr) {
      return acc + 1;
    }
    return acc;
  }, 0);

  const pendingTasksCount = tasks.filter((t) => t.status !== 'completed').length;
  const activeSubjectsCount = subjects.length;

  return {
    focusMinutesToday,
    tasksCompletedToday,
    pendingTasksCount,
    activeSubjectsCount,
  };
}

/**
 * Extracts 1-2 secondary derived insight recommendations from existing subjects & tasks.
 */
export function getSecondaryRecommendations(
  tasks: Task[],
  subjects: Subject[]
): SecondaryRecommendation[] {
  const recommendations: SecondaryRecommendation[] = [];

  // 1. Check for lowest confidence subject below 60%
  if (subjects.length > 0) {
    const sortedSubjects = [...subjects].sort((a, b) => a.confidenceRating - b.confidenceRating);
    const lowest = sortedSubjects[0];
    if (lowest.confidenceRating < 60) {
      recommendations.push({
        id: `rec_sub_${lowest.id}`,
        type: 'lowest_confidence',
        title: `Low Confidence: ${lowest.code || lowest.name}`,
        description: `Your confidence rating in ${lowest.name} is currently ${lowest.confidenceRating}%. Review notes & flashcards to boost mastery.`,
        actionText: 'Review Workspace',
        tabTarget: 'workspace',
      });
    }
  }

  // 2. Check for overdue pending tasks
  const startOfDayMs = new Date().setHours(0, 0, 0, 0);
  const overdueTasks = tasks.filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate < startOfDayMs);

  if (overdueTasks.length > 0) {
    recommendations.push({
      id: 'rec_overdue',
      type: 'overdue_tasks',
      title: `${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}`,
      description: `You have ${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} past their due date. Re-prioritize your planner queue.`,
      actionText: 'Open Planner',
      tabTarget: 'plan',
    });
  }

  return recommendations;
}
