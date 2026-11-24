import { describe, expect, it } from 'vitest';
import {
  bumpDay,
  computeStreak,
  dayKey,
  emptyStats,
  pruneStats,
  recentDays,
  touchDay,
  validateStats,
} from '../../src/shared/stats';

const day = (d: number) => new Date(2026, 10, d, 12).getTime();

describe('stats', () => {
  it('bumps day counters and totals', () => {
    let s = emptyStats();
    s = bumpDay(s, day(24), 'intercepted');
    s = bumpDay(s, day(24), 'intercepted');
    s = bumpDay(s, day(24), 'closed');
    expect(s.days['2026-11-24']).toEqual({ intercepted: 2, closed: 1, snoozed: 0, reminders: 0 });
    expect(s.totalIntercepted).toBe(2);
    expect(s.totalClosed).toBe(1);
  });

  it('computes streaks of consecutive active days', () => {
    let s = emptyStats();
    for (const d of [20, 21, 22, 23, 24]) s = touchDay(s, day(d));
    expect(computeStreak(s, day(24))).toBe(5);
    // Today not yet active: streak runs through yesterday.
    expect(computeStreak(s, day(25))).toBe(5);
    expect(computeStreak(s, day(27))).toBe(0);
    s = touchDay(emptyStats(), day(22));
    s = touchDay(s, day(24));
    expect(computeStreak(s, day(24))).toBe(1);
  });

  it('handles month boundaries', () => {
    let s = emptyStats();
    for (const t of [new Date(2026, 9, 31, 12).getTime(), new Date(2026, 10, 1, 12).getTime()])
      s = touchDay(s, t);
    expect(computeStreak(s, new Date(2026, 10, 1, 12).getTime())).toBe(2);
  });

  it('lists recent days oldest first, including empty ones', () => {
    const s = bumpDay(emptyStats(), day(24), 'intercepted');
    const days = recentDays(s, day(24), 3);
    expect(days.map((d) => d.key)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    expect(days[2]!.day.intercepted).toBe(1);
  });

  it('validates corrupted stats and prunes old days', () => {
    const v = validateStats({
      days: { bogus: {}, '2026-11-24': { intercepted: -5, closed: 2.7 } },
      totalIntercepted: 'x',
    });
    expect(v.days).toEqual({
      '2026-11-24': { intercepted: 0, closed: 2, snoozed: 0, reminders: 0 },
    });
    expect(v.totalIntercepted).toBe(0);
    const old = touchDay(touchDay(emptyStats(), day(24)), new Date(2025, 0, 1).getTime());
    expect(Object.keys(pruneStats(old, day(24)).days)).toEqual(['2026-11-24']);
    expect(dayKey(day(5))).toBe('2026-11-05');
  });
});
