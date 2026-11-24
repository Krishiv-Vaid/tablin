import { COSMETICS } from './cosmetics';
import { bestWeekSessions, focusStreak } from './stats';
import type {
  AchievementCategory,
  AchievementRecord,
  Inventory,
  Stats,
  UnlockEvent,
} from './types';

/** Measurable quantities achievements are defined over — all derived from stored data. */
export interface ProgressMetrics {
  completedSessions: number;
  longestSessionMinutes: number;
  bestWeekSessions: number;
  longestStreak: number;
  totalIntercepted: number;
  totalFocusMinutes: number;
}

export type Metric = keyof ProgressMetrics;

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  metric: Metric;
  target: number;
  /** 1–4: drives the badge's ring count. */
  tier: number;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  // Focus
  {
    id: 'first-focus',
    name: 'First Focus',
    description: 'Complete your first focus session.',
    category: 'focus',
    metric: 'completedSessions',
    target: 1,
    tier: 1,
  },
  {
    id: 'getting-started',
    name: 'Getting Started',
    description: 'Complete 5 focus sessions.',
    category: 'focus',
    metric: 'completedSessions',
    target: 5,
    tier: 2,
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    description: 'Complete 10 focus sessions.',
    category: 'focus',
    metric: 'completedSessions',
    target: 10,
    tier: 3,
  },
  {
    id: 'focus-machine',
    name: 'Focus Machine',
    description: 'Complete 25 focus sessions.',
    category: 'focus',
    metric: 'completedSessions',
    target: 25,
    tier: 4,
  },
  {
    id: 'deep-work',
    name: 'Deep Work',
    description: 'Complete a 90-minute focus session.',
    category: 'focus',
    metric: 'longestSessionMinutes',
    target: 90,
    tier: 3,
  },
  {
    id: 'consistency',
    name: 'Consistency',
    description: 'Complete 5 focus sessions in one week (Mon–Sun).',
    category: 'focus',
    metric: 'bestWeekSessions',
    target: 5,
    tier: 2,
  },
  // Streaks
  {
    id: 'three-days',
    name: 'Three Days Strong',
    description: 'Reach a 3-day focus streak.',
    category: 'streaks',
    metric: 'longestStreak',
    target: 3,
    tier: 1,
  },
  {
    id: 'week-warrior',
    name: 'Week Warrior',
    description: 'Reach a 7-day focus streak.',
    category: 'streaks',
    metric: 'longestStreak',
    target: 7,
    tier: 2,
  },
  {
    id: 'two-weeks',
    name: 'Two Weeks',
    description: 'Reach a 14-day focus streak.',
    category: 'streaks',
    metric: 'longestStreak',
    target: 14,
    tier: 3,
  },
  {
    id: 'monthly-momentum',
    name: 'Monthly Momentum',
    description: 'Reach a 30-day focus streak.',
    category: 'streaks',
    metric: 'longestStreak',
    target: 30,
    tier: 4,
  },
  // Distraction control
  {
    id: 'first-rescue',
    name: 'First Rescue',
    description: 'Get intercepted on a distracting site for the first time.',
    category: 'distractions',
    metric: 'totalIntercepted',
    target: 1,
    tier: 1,
  },
  {
    id: 'tab-guardian',
    name: 'Tab Guardian',
    description: 'Intercept 10 distractions.',
    category: 'distractions',
    metric: 'totalIntercepted',
    target: 10,
    tier: 2,
  },
  {
    id: 'protector',
    name: 'Protector',
    description: 'Intercept 50 distractions.',
    category: 'distractions',
    metric: 'totalIntercepted',
    target: 50,
    tier: 3,
  },
  {
    id: 'focus-defender',
    name: 'Focus Defender',
    description: 'Intercept 100 distractions.',
    category: 'distractions',
    metric: 'totalIntercepted',
    target: 100,
    tier: 4,
  },
  // Time
  {
    id: 'one-hour',
    name: 'One Hour',
    description: 'Accumulate 60 focus minutes.',
    category: 'time',
    metric: 'totalFocusMinutes',
    target: 60,
    tier: 1,
  },
  {
    id: 'five-hours',
    name: 'Five Hours',
    description: 'Accumulate 5 focus hours.',
    category: 'time',
    metric: 'totalFocusMinutes',
    target: 300,
    tier: 2,
  },
  {
    id: 'ten-hours',
    name: 'Ten Hours',
    description: 'Accumulate 10 focus hours.',
    category: 'time',
    metric: 'totalFocusMinutes',
    target: 600,
    tier: 3,
  },
  {
    id: 'time-champion',
    name: 'Time Champion',
    description: 'Accumulate 25 focus hours.',
    category: 'time',
    metric: 'totalFocusMinutes',
    target: 1500,
    tier: 4,
  },
];

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  focus: 'Focus',
  streaks: 'Streaks',
  distractions: 'Distraction control',
  time: 'Time',
};

/** Cosmetic reward for an achievement, if any. */
export function rewardFor(achievementId: string): string | null {
  return COSMETICS.find((c) => c.unlockedBy === achievementId)?.id ?? null;
}

export function computeMetrics(stats: Stats, now: number): ProgressMetrics {
  return {
    completedSessions: stats.totalFocusSessions,
    longestSessionMinutes: stats.longestFocusMinutes,
    bestWeekSessions: bestWeekSessions(stats),
    longestStreak: focusStreak(stats, now).longest,
    totalIntercepted: stats.totalIntercepted,
    totalFocusMinutes: stats.totalFocusMinutes,
  };
}

export interface AchievementProgress {
  achievement: Achievement;
  value: number;
  /** 0..1 */
  ratio: number;
  unlockedAt: number | null;
  rewardId: string | null;
}

export function progressList(
  metrics: ProgressMetrics,
  record: AchievementRecord,
): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const value = metrics[a.metric];
    return {
      achievement: a,
      value: Math.min(value, a.target),
      ratio: Math.min(1, value / a.target),
      unlockedAt: record[a.id] ?? null,
      rewardId: rewardFor(a.id),
    };
  });
}

export function validateAchievements(raw: unknown): AchievementRecord {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: AchievementRecord = {};
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (ACHIEVEMENTS_BY_ID.has(id) && typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

/**
 * Idempotent evaluation: unlocks every achievement whose condition is met and
 * isn't already unlocked, and grants missing rewards for unlocked achievements.
 * Running it twice changes nothing the second time.
 */
export function evaluateAchievements(
  metrics: ProgressMetrics,
  record: AchievementRecord,
  inventory: Inventory,
  now: number,
): { record: AchievementRecord; inventory: Inventory; events: UnlockEvent[] } {
  const nextRecord = { ...record };
  const unlocked = { ...inventory.unlocked };
  const events: UnlockEvent[] = [];
  for (const a of ACHIEVEMENTS) {
    if (nextRecord[a.id] === undefined && metrics[a.metric] >= a.target) {
      nextRecord[a.id] = now;
      events.push({ achievementId: a.id, rewardId: rewardFor(a.id), at: now });
    }
    const reward = rewardFor(a.id);
    if (nextRecord[a.id] !== undefined && reward && unlocked[reward] === undefined) {
      unlocked[reward] = nextRecord[a.id]!;
    }
  }
  return { record: nextRecord, inventory: { ...inventory, unlocked }, events };
}
