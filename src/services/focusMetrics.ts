import { Session } from '../types';

export interface FocusSummary {
  minutesToday: number;
  sessionsToday: number;
  averageDurationToday: number;
  averageRatingToday: number | null;
  distractionsToday: number;
}

/**
 * Returns local start of day (00:00:00.000) and end of day (23:59:59.999) timestamps
 * based on the user's local timezone.
 */
export function getLocalDayBounds(timestamp: number = Date.now()): { startOfDay: number; endOfDay: number } {
  const d = new Date(timestamp);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  return { startOfDay, endOfDay };
}

/**
 * Filters focus sessions completed today within local timezone boundaries.
 * Excludes future-dated sessions.
 */
export function getTodayFocusSessions(
  sessions: Session[],
  currentTimestamp: number = Date.now()
): Session[] {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];
  const { startOfDay, endOfDay } = getLocalDayBounds(currentTimestamp);

  return sessions.filter((s) => {
    if (!s || typeof s.completedAt !== 'number') return false;
    return s.completedAt >= startOfDay && s.completedAt <= endOfDay && s.completedAt <= currentTimestamp;
  });
}

/**
 * Calculates focus summary metrics for the current local day.
 */
export function calculateFocusSummary(
  sessions: Session[],
  currentTimestamp: number = Date.now()
): FocusSummary {
  const todaySessions = getTodayFocusSessions(sessions, currentTimestamp);

  if (todaySessions.length === 0) {
    return {
      minutesToday: 0,
      sessionsToday: 0,
      averageDurationToday: 0,
      averageRatingToday: null,
      distractionsToday: 0,
    };
  }

  const minutesToday = todaySessions.reduce((acc, s) => acc + (Math.max(0, s.durationMinutes) || 0), 0);
  const sessionsToday = todaySessions.length;
  const averageDurationToday = Math.round(minutesToday / sessionsToday);

  const ratedSessions = todaySessions.filter(
    (s) => typeof s.reflectionRating === 'number' && s.reflectionRating >= 1 && s.reflectionRating <= 5
  );

  const averageRatingToday =
    ratedSessions.length > 0
      ? Number(
          (
            ratedSessions.reduce((acc, s) => acc + (s.reflectionRating || 0), 0) / ratedSessions.length
          ).toFixed(1)
        )
      : null;

  const distractionsToday = todaySessions.reduce((acc, s) => acc + (Math.max(0, s.distractionCount) || 0), 0);

  return {
    minutesToday,
    sessionsToday,
    averageDurationToday,
    averageRatingToday,
    distractionsToday,
  };
}

/**
 * Sorts focus sessions newest-first by completedAt timestamp without mutating input array.
 */
export function sortFocusSessionsNewestFirst(sessions: Session[]): Session[] {
  if (!Array.isArray(sessions)) return [];
  return [...sessions].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}

/**
 * Formats focus session type into human-readable title.
 */
export function formatFocusSessionType(type: 'pomodoro' | 'deep_work' | 'stopwatch' | string): string {
  switch (type) {
    case 'pomodoro':
      return 'Pomodoro';
    case 'deep_work':
      return 'Deep Work';
    case 'stopwatch':
      return 'Stopwatch';
    default:
      return 'Focus Session';
  }
}

/**
 * Formats duration in minutes into a clean display string.
 */
export function formatDurationDisplay(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 mins';
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} hr ${mins} mins` : `${hrs} hr${hrs > 1 ? 's' : ''}`;
}
