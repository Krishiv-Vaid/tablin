import { STATS_RETENTION_DAYS } from './constants';
import type { DayStats, Stats, StreakInfo } from './types';

export const EMPTY_DAY: Readonly<DayStats> = {
  intercepted: 0,
  closed: 0,
  snoozed: 0,
  reminders: 0,
  focusMinutes: 0,
  focusSessions: 0,
  qualifyingSessions: 0,
};

export function emptyStats(): Stats {
  return {
    days: {},
    totalIntercepted: 0,
    totalClosed: 0,
    totalWatchSessions: 0,
    totalFocusSessions: 0,
    totalFocusMinutes: 0,
    longestFocusMinutes: 0,
    longestStreak: 0,
  };
}

/** Local calendar date (YYYY-MM-DD) for a timestamp, in the user's current timezone. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Shifts a YYYY-MM-DD key by whole calendar days (DST-safe: anchored at noon). */
export function shiftDay(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + deltaDays, 12).getTime());
}

/** Monday of the week containing `key` (local calendar). */
export function weekStart(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = Sunday
  return shiftDay(key, -((dow + 6) % 7));
}

const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const amount = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;

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
        focusMinutes: amount(v.focusMinutes),
        focusSessions: count(v.focusSessions),
        qualifyingSessions: count(v.qualifyingSessions),
      };
    }
  }
  return {
    days,
    totalIntercepted: count(r.totalIntercepted),
    totalClosed: count(r.totalClosed),
    totalWatchSessions: count(r.totalWatchSessions),
    totalFocusSessions: count(r.totalFocusSessions),
    totalFocusMinutes: amount(r.totalFocusMinutes),
    longestFocusMinutes: amount(r.longestFocusMinutes),
    longestStreak: count(r.longestStreak),
  };
}

/** Marks a day as active (creates an empty entry) without changing counters. */
export function touchDay(stats: Stats, now: number): Stats {
  const key = dayKey(now);
  if (stats.days[key]) return stats;
  return { ...stats, days: { ...stats.days, [key]: { ...EMPTY_DAY } } };
}

type CounterField = 'intercepted' | 'closed' | 'snoozed' | 'reminders';

export function bumpDay(stats: Stats, now: number, field: CounterField): Stats {
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
 * Records focus time on `day` (the local day the session ended). Completed
 * sessions also count as sessions, and qualify for the streak if long enough.
 */
export function recordFocus(
  stats: Stats,
  day: string,
  minutes: number,
  completed: boolean,
  qualifies: boolean,
): Stats {
  const d = stats.days[day] ?? { ...EMPTY_DAY };
  const rounded = Math.round(minutes * 100) / 100;
  const next: Stats = {
    ...stats,
    days: {
      ...stats.days,
      [day]: {
        ...d,
        focusMinutes: Math.round((d.focusMinutes + rounded) * 100) / 100,
        focusSessions: d.focusSessions + (completed ? 1 : 0),
        qualifyingSessions: d.qualifyingSessions + (qualifies ? 1 : 0),
      },
    },
    totalFocusMinutes: Math.round((stats.totalFocusMinutes + rounded) * 100) / 100,
    totalFocusSessions: stats.totalFocusSessions + (completed ? 1 : 0),
    longestFocusMinutes: completed
      ? Math.max(stats.longestFocusMinutes, rounded)
      : stats.longestFocusMinutes,
  };
  next.longestStreak = Math.max(next.longestStreak, focusStreak(next, day).current);
  return next;
}

/**
 * Focus streak: consecutive local calendar days with at least one qualifying
 * completed focus session, ending today — or yesterday, so a streak isn't
 * "lost" in the morning before you've had a chance to focus.
 */
export function focusStreak(stats: Stats, nowOrDay: number | string): StreakInfo {
  const today = typeof nowOrDay === 'string' ? nowOrDay : dayKey(nowOrDay);
  const qualifies = (key: string) => (stats.days[key]?.qualifyingSessions ?? 0) > 0;
  const todayDone = qualifies(today);
  let key = todayDone ? today : shiftDay(today, -1);
  let current = 0;
  while (qualifies(key)) {
    current += 1;
    key = shiftDay(key, -1);
  }
  const lastQualifyingDay = Object.keys(stats.days).filter(qualifies).sort().pop() ?? null;
  return { current, longest: Math.max(stats.longestStreak, current), lastQualifyingDay, todayDone };
}

/** The last `n` days, oldest first, including empty days. */
export function recentDays(stats: Stats, now: number, n: number): { key: string; day: DayStats }[] {
  const today = dayKey(now);
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDay(today, i - (n - 1));
    return { key, day: stats.days[key] ?? { ...EMPTY_DAY } };
  });
}

/** Focus totals for the last `n` weeks (Monday–Sunday, local), oldest first. */
export function recentWeeks(
  stats: Stats,
  now: number,
  n: number,
): { start: string; focusMinutes: number; focusSessions: number; intercepted: number }[] {
  const thisWeek = weekStart(dayKey(now));
  return Array.from({ length: n }, (_, i) => {
    const start = shiftDay(thisWeek, (i - (n - 1)) * 7);
    let focusMinutes = 0;
    let focusSessions = 0;
    let intercepted = 0;
    for (let d = 0; d < 7; d++) {
      const day = stats.days[shiftDay(start, d)];
      if (!day) continue;
      focusMinutes += day.focusMinutes;
      focusSessions += day.focusSessions;
      intercepted += day.intercepted;
    }
    return {
      start,
      focusMinutes: Math.round(focusMinutes * 100) / 100,
      focusSessions,
      intercepted,
    };
  });
}

/** Most completed focus sessions in any single Monday–Sunday week on record. */
export function bestWeekSessions(stats: Stats): number {
  const byWeek = new Map<string, number>();
  for (const [key, day] of Object.entries(stats.days)) {
    if (!day.focusSessions) continue;
    const w = weekStart(key);
    byWeek.set(w, (byWeek.get(w) ?? 0) + day.focusSessions);
  }
  return Math.max(0, ...byWeek.values());
}

export function pruneStats(stats: Stats, now: number): Stats {
  const cutoff = shiftDay(dayKey(now), -STATS_RETENTION_DAYS);
  const days = Object.fromEntries(Object.entries(stats.days).filter(([key]) => key >= cutoff));
  return { ...stats, days };
}
