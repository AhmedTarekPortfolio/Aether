import { describe, it, expect } from 'vitest';
import {
  getLocalDayBounds,
  getTodayFocusSessions,
  calculateFocusSummary,
  sortFocusSessionsNewestFirst,
  formatFocusSessionType,
  formatDurationDisplay,
} from '../focusMetrics';
import { Session } from '../../types';

describe('Focus Metrics Service (src/services/focusMetrics.ts)', () => {
  const now = new Date('2026-07-23T14:30:00.000Z').getTime();

  it('1. Handles empty session list safely', () => {
    const summary = calculateFocusSummary([], now);
    expect(summary.minutesToday).toBe(0);
    expect(summary.sessionsToday).toBe(0);
    expect(summary.averageDurationToday).toBe(0);
    expect(summary.averageRatingToday).toBeNull();
    expect(summary.distractionsToday).toBe(0);
  });

  it('2. Calculates metrics for one session completed today', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        type: 'pomodoro',
        durationMinutes: 25,
        distractionCount: 1,
        reflectionRating: 5,
        completedAt: now - 3600 * 1000,
      },
    ];

    const summary = calculateFocusSummary(sessions, now);
    expect(summary.minutesToday).toBe(25);
    expect(summary.sessionsToday).toBe(1);
    expect(summary.averageDurationToday).toBe(25);
    expect(summary.averageRatingToday).toBe(5);
    expect(summary.distractionsToday).toBe(1);
  });

  it('3. Calculates metrics for multiple sessions today', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        type: 'pomodoro',
        durationMinutes: 25,
        distractionCount: 2,
        reflectionRating: 4,
        completedAt: now - 7200 * 1000,
      },
      {
        id: 's2',
        type: 'deep_work',
        durationMinutes: 45,
        distractionCount: 0,
        reflectionRating: 5,
        completedAt: now - 3600 * 1000,
      },
    ];

    const summary = calculateFocusSummary(sessions, now);
    expect(summary.minutesToday).toBe(70);
    expect(summary.sessionsToday).toBe(2);
    expect(summary.averageDurationToday).toBe(35); // Math.round(70 / 2)
    expect(summary.averageRatingToday).toBe(4.5); // (4 + 5) / 2
    expect(summary.distractionsToday).toBe(2);
  });

  it('4. Excludes sessions from yesterday and future dates', () => {
    const { startOfDay } = getLocalDayBounds(now);
    const yesterdayTimestamp = startOfDay - 3600 * 1000;
    const futureTimestamp = now + 86400 * 1000;

    const sessions: Session[] = [
      { id: 's_yest', type: 'pomodoro', durationMinutes: 30, distractionCount: 0, completedAt: yesterdayTimestamp },
      { id: 's_today', type: 'pomodoro', durationMinutes: 25, distractionCount: 1, completedAt: now - 1800 * 1000 },
      { id: 's_future', type: 'deep_work', durationMinutes: 60, distractionCount: 0, completedAt: futureTimestamp },
    ];

    const todaySessions = getTodayFocusSessions(sessions, now);
    expect(todaySessions.length).toBe(1);
    expect(todaySessions[0].id).toBe('s_today');

    const summary = calculateFocusSummary(sessions, now);
    expect(summary.minutesToday).toBe(25);
    expect(summary.sessionsToday).toBe(1);
  });

  it('5. Handles missing or zero reflection ratings correctly', () => {
    const sessions: Session[] = [
      { id: 's1', type: 'pomodoro', durationMinutes: 25, distractionCount: 0, completedAt: now - 1000 },
      { id: 's2', type: 'stopwatch', durationMinutes: 15, distractionCount: 1, reflectionRating: 4, completedAt: now - 2000 },
    ];

    const summary = calculateFocusSummary(sessions, now);
    expect(summary.averageRatingToday).toBe(4);
  });

  it('6. Sorts sessions newest-first without input array mutation', () => {
    const sessions: Session[] = [
      { id: 'older', type: 'pomodoro', durationMinutes: 25, distractionCount: 0, completedAt: 1000 },
      { id: 'newer', type: 'deep_work', durationMinutes: 45, distractionCount: 0, completedAt: 5000 },
      { id: 'middle', type: 'stopwatch', durationMinutes: 10, distractionCount: 0, completedAt: 3000 },
    ];

    const copy = [...sessions];
    const sorted = sortFocusSessionsNewestFirst(sessions);

    expect(sorted[0].id).toBe('newer');
    expect(sorted[1].id).toBe('middle');
    expect(sorted[2].id).toBe('older');
    // Verify original array was not mutated
    expect(sessions).toEqual(copy);
  });

  it('7. Formats session types cleanly', () => {
    expect(formatFocusSessionType('pomodoro')).toBe('Pomodoro');
    expect(formatFocusSessionType('deep_work')).toBe('Deep Work');
    expect(formatFocusSessionType('stopwatch')).toBe('Stopwatch');
    expect(formatFocusSessionType('custom')).toBe('Focus Session');
  });

  it('8. Formats duration display string correctly', () => {
    expect(formatDurationDisplay(0)).toBe('0 mins');
    expect(formatDurationDisplay(25)).toBe('25 mins');
    expect(formatDurationDisplay(60)).toBe('1 hr');
    expect(formatDurationDisplay(75)).toBe('1 hr 15 mins');
    expect(formatDurationDisplay(120)).toBe('2 hrs');
  });
});
