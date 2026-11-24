import { describe, expect, it } from 'vitest';
import {
  bestWeekSessions,
  bumpDay,
  dayKey,
  emptyStats,
  focusStreak,
  pruneStats,
  recentDays,
  recentWeeks,
  recordFocus,
  touchDay,
  validateStats,
  weekStart,
} from '../../src/shared/stats';
import type { Stats } from '../../src/shared/types';

const day = (d: number, month = 10) => new Date(2026, month, d, 12).getTime();
const key = (d: number, month = 10) => dayKey(day(d, month));
/** Records one completed, streak-qualifying 25-minute session on each given day. */
function focusedOn(days: string[], s: Stats = emptyStats()): Stats {
  return days.reduce((acc, k) => recordFocus(acc, k, 25, true, true), s);
}

describe('stats counters', () => {
  it('bumps day counters and totals', () => {
    let s = emptyStats();
    s = bumpDay(s, day(24), 'intercepted');
    s = bumpDay(s, day(24), 'intercepted');
    s = bumpDay(s, day(24), 'closed');
    expect(s.days['2026-11-24']).toMatchObject({
      intercepted: 2,
      closed: 1,
      snoozed: 0,
      reminders: 0,
    });
    expect(s.totalIntercepted).toBe(2);
    expect(s.totalClosed).toBe(1);
  });

  it('records focus minutes, sessions, totals and the longest session', () => {
    let s = recordFocus(emptyStats(), '2026-11-24', 25, true, true);
    s = recordFocus(s, '2026-11-24', 90, true, true);
    s = recordFocus(s, '2026-11-24', 12.5, false, false); // ended early: minutes count, session doesn't
    expect(s.days['2026-11-24']).toMatchObject({
      focusMinutes: 127.5,
      focusSessions: 2,
      qualifyingSessions: 2,
    });
    expect(s.totalFocusMinutes).toBe(127.5);
    expect(s.totalFocusSessions).toBe(2);
    expect(s.longestFocusMinutes).toBe(90);
  });
});

describe('focus streaks', () => {
  it('first qualifying day starts a 1-day streak', () => {
    const s = focusedOn([key(24)]);
    expect(focusStreak(s, day(24))).toMatchObject({
      current: 1,
      longest: 1,
      todayDone: true,
      lastQualifyingDay: '2026-11-24',
    });
  });

  it('counts consecutive days (Mon, Tue, Wed → 3)', () => {
    const s = focusedOn([key(23), key(24), key(25)]);
    expect(focusStreak(s, day(25)).current).toBe(3);
  });

  it("doesn't break the streak before you've focused today", () => {
    const s = focusedOn([key(23), key(24)]);
    expect(focusStreak(s, day(25))).toMatchObject({ current: 2, todayDone: false });
  });

  it('a missed day resets the current streak but keeps the longest', () => {
    let s = focusedOn([key(20), key(21), key(22), key(23)]);
    s = focusedOn([key(26)], s);
    expect(focusStreak(s, day(26))).toMatchObject({ current: 1, longest: 4 });
    expect(focusStreak(s, day(28)).current).toBe(0);
  });

  it('short or unfinished sessions do not qualify', () => {
    let s = recordFocus(emptyStats(), key(24), 3, true, false);
    s = recordFocus(s, key(24), 30, false, false);
    expect(focusStreak(s, day(24)).current).toBe(0);
  });

  it('duplicate completions on the same day do not double-increment', () => {
    const s = focusedOn([key(24), key(24), key(24)]);
    expect(focusStreak(s, day(24)).current).toBe(1);
    expect(s.longestStreak).toBe(1);
  });

  it('handles month boundaries', () => {
    const s = focusedOn([key(31, 9), key(1, 10)]);
    expect(focusStreak(s, day(1, 10)).current).toBe(2);
  });

  it('timezone changes do not rewrite recorded days', () => {
    // Days are stored as the local date at the time of completion; the streak
    // only compares those stored keys, so a later timezone change can't shift them.
    const s = focusedOn(['2026-11-23', '2026-11-24']);
    expect(focusStreak(s, '2026-11-24').current).toBe(2);
    expect(Object.keys(s.days)).toEqual(['2026-11-23', '2026-11-24']);
  });

  it('longest streak persists even after old days are pruned', () => {
    let s = focusedOn([key(1, 0), key(2, 0), key(3, 0)]); // January
    s = pruneStats(s, new Date(2028, 0, 1).getTime());
    expect(Object.keys(s.days)).toEqual([]);
    expect(focusStreak(s, new Date(2028, 0, 1).getTime())).toMatchObject({
      current: 0,
      longest: 3,
    });
  });
});

describe('grouping', () => {
  it('lists recent days oldest first, including empty ones', () => {
    const s = bumpDay(emptyStats(), day(24), 'intercepted');
    const days = recentDays(s, day(24), 3);
    expect(days.map((d) => d.key)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    expect(days[2]!.day.intercepted).toBe(1);
  });

  it('weeks start on Monday (local)', () => {
    expect(weekStart('2026-11-24')).toBe('2026-11-23'); // Tue → Mon
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sun → Mon
  });

  it('sums weekly focus totals', () => {
    let s = recordFocus(emptyStats(), '2026-11-17', 30, true, true); // previous week
    s = recordFocus(s, '2026-11-23', 25, true, true);
    s = recordFocus(s, '2026-11-24', 45, true, true);
    const weeks = recentWeeks(s, day(24), 2);
    expect(weeks).toEqual([
      { start: '2026-11-16', focusMinutes: 30, focusSessions: 1, intercepted: 0 },
      { start: '2026-11-23', focusMinutes: 70, focusSessions: 2, intercepted: 0 },
    ]);
    expect(bestWeekSessions(s)).toBe(2);
  });

  it('validates corrupted stats, migrates nothing silently, and prunes old days', () => {
    const v = validateStats({
      days: { bogus: {}, '2026-11-24': { intercepted: -5, closed: 2.7, focusMinutes: 'x' } },
      totalIntercepted: 'x',
    });
    expect(v.days).toEqual({
      '2026-11-24': {
        intercepted: 0,
        closed: 2,
        snoozed: 0,
        reminders: 0,
        focusMinutes: 0,
        focusSessions: 0,
        qualifyingSessions: 0,
      },
    });
    expect(v.totalIntercepted).toBe(0);
    const old = touchDay(touchDay(emptyStats(), day(24)), new Date(2024, 0, 1).getTime());
    expect(Object.keys(pruneStats(old, day(24)).days)).toEqual(['2026-11-24']);
    expect(dayKey(day(5))).toBe('2026-11-05');
  });
});
