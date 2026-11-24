import { STATS_RETENTION_DAYS } from './constants';
import type { DayStats, Stats } from './types';

export const EMPTY_DAY: Readonly<DayStats> = {
  intercepted: 0,
  closed: 0,
  snoozed: 0,
  reminders: 0,
};

export function emptyStats(): Stats {
  return { days: {}, totalIntercepted: 0, totalClosed: 0, totalFocusSessions: 0 };
}

/** Local calendar date (YYYY-MM-DD) for a timestamp. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shiftDay(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + deltaDays, 12).getTime());
}

const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

export function validateStats(raw: unknown): Stats {
  if (typeof raw !== 'object' || raw === null) return emptyStats();
  const r = raw as Record<string, unknown>;
  const days: Record<string, DayStats> = {};
  if (typeof r.days === 'object' && r.days !== null) {
    for (const [key, value] of Object.entries(r.days as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;
      days[key] = {
        intercepted: count(v.intercepted),
        closed: count(v.closed),
        snoozed: count(v.snoozed),
        reminders: count(v.reminders),
      };
    }
  }
  return {
    days,
    totalIntercepted: count(r.totalIntercepted),
    totalClosed: count(r.totalClosed),
    totalFocusSessions: count(r.totalFocusSessions),
  };
}

/** Marks a day as active (creates an empty entry) without changing counters. */
export function touchDay(stats: Stats, now: number): Stats {
  const key = dayKey(now);
  if (stats.days[key]) return stats;
  return { ...stats, days: { ...stats.days, [key]: { ...EMPTY_DAY } } };
}

export function bumpDay(stats: Stats, now: number, field: keyof DayStats): Stats {
  const key = dayKey(now);
  const day = stats.days[key] ?? { ...EMPTY_DAY };
  const next: Stats = {
    ...stats,
    days: { ...stats.days, [key]: { ...day, [field]: day[field] + 1 } },
  };
  if (field === 'intercepted') next.totalIntercepted += 1;
  if (field === 'closed') next.totalClosed += 1;
  return next;
}

export function todayStats(stats: Stats, now: number): DayStats {
  return stats.days[dayKey(now)] ?? { ...EMPTY_DAY };
}

/**
 * Consecutive days (ending today, or yesterday if today has no activity yet)
 * on which Tablin was on watch.
 */
export function computeStreak(stats: Stats, now: number): number {
  let key = dayKey(now);
  if (!stats.days[key]) key = shiftDay(key, -1);
  let streak = 0;
  while (stats.days[key]) {
    streak += 1;
    key = shiftDay(key, -1);
  }
  return streak;
}

/** The last `n` days, oldest first, including empty days. */
export function recentDays(stats: Stats, now: number, n: number): { key: string; day: DayStats }[] {
  const today = dayKey(now);
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDay(today, i - (n - 1));
    return { key, day: stats.days[key] ?? { ...EMPTY_DAY } };
  });
}

export function pruneStats(stats: Stats, now: number): Stats {
  const cutoff = shiftDay(dayKey(now), -STATS_RETENTION_DAYS);
  const days = Object.fromEntries(Object.entries(stats.days).filter(([key]) => key >= cutoff));
  return { ...stats, days };
}
