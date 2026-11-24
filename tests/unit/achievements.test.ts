import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  computeMetrics,
  evaluateAchievements,
  progressList,
  rewardFor,
  validateAchievements,
  type ProgressMetrics,
} from '../../src/shared/achievements';
import { COSMETICS, COSMETICS_BY_ID, emptyInventory } from '../../src/shared/cosmetics';
import { emptyStats, recordFocus } from '../../src/shared/stats';
import { isFocusError } from '../../src/background/focus-manager';
import { focusHarness, MIN } from './helpers';

const zero: ProgressMetrics = {
  completedSessions: 0,
  longestSessionMinutes: 0,
  bestWeekSessions: 0,
  longestStreak: 0,
  totalIntercepted: 0,
  totalFocusMinutes: 0,
};
const NOW = new Date(2026, 10, 24, 12).getTime();

describe('achievement catalog', () => {
  it('has the 18 specified achievements with unique ids in four categories', () => {
    expect(ACHIEVEMENTS).toHaveLength(18);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(18);
    expect(new Set(ACHIEVEMENTS.map((a) => a.category))).toEqual(
      new Set(['focus', 'streaks', 'distractions', 'time']),
    );
  });

  it('every reward points at a real cosmetic and every unlockable cosmetic at a real achievement', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const c of COSMETICS) if (c.unlockedBy) expect(ids.has(c.unlockedBy)).toBe(true);
    for (const a of ACHIEVEMENTS) {
      const r = rewardFor(a.id);
      if (r) expect(COSMETICS_BY_ID.has(r)).toBe(true);
    }
  });

  it('maps the specified rewards', () => {
    expect(rewardFor('first-focus')).toBe('hat:party');
    expect(rewardFor('getting-started')).toBe('color:pastel');
    expect(rewardFor('dedicated')).toBe('hat:grad');
    expect(rewardFor('three-days')).toBe('acc:star');
    expect(rewardFor('week-warrior')).toBe('hat:crown');
    expect(rewardFor('focus-machine')).toBe('cel:confetti');
    expect(rewardFor('protector')).toBe('acc:headband');
    expect(rewardFor('ten-hours')).toBe('fx:golden');
  });
});

describe('achievement evaluation', () => {
  it('nothing unlocks with no data', () => {
    expect(evaluateAchievements(zero, {}, emptyInventory(), NOW).events).toEqual([]);
  });

  it.each([
    ['first-focus', { completedSessions: 1 }],
    ['getting-started', { completedSessions: 5 }],
    ['dedicated', { completedSessions: 10 }],
    ['focus-machine', { completedSessions: 25 }],
    ['deep-work', { longestSessionMinutes: 90 }],
    ['consistency', { bestWeekSessions: 5 }],
    ['three-days', { longestStreak: 3 }],
    ['week-warrior', { longestStreak: 7 }],
    ['two-weeks', { longestStreak: 14 }],
    ['monthly-momentum', { longestStreak: 30 }],
    ['first-rescue', { totalIntercepted: 1 }],
    ['tab-guardian', { totalIntercepted: 10 }],
    ['protector', { totalIntercepted: 50 }],
    ['focus-defender', { totalIntercepted: 100 }],
    ['one-hour', { totalFocusMinutes: 60 }],
    ['five-hours', { totalFocusMinutes: 300 }],
    ['ten-hours', { totalFocusMinutes: 600 }],
    ['time-champion', { totalFocusMinutes: 1500 }],
  ] as const)('%s unlocks exactly at its threshold', (id, patch) => {
    const metric = Object.keys(patch)[0] as keyof ProgressMetrics;
    const target = (patch as Record<string, number>)[metric]!;
    const below = evaluateAchievements(
      { ...zero, [metric]: target - 1 },
      {},
      emptyInventory(),
      NOW,
    );
    expect(below.record[id]).toBeUndefined();
    const at = evaluateAchievements({ ...zero, [metric]: target }, {}, emptyInventory(), NOW);
    expect(at.record[id]).toBe(NOW);
  });

  it('grants rewards with the achievement', () => {
    const r = evaluateAchievements({ ...zero, completedSessions: 1 }, {}, emptyInventory(), NOW);
    expect(r.events).toEqual([{ achievementId: 'first-focus', rewardId: 'hat:party', at: NOW }]);
    expect(r.inventory.unlocked['hat:party']).toBe(NOW);
  });

  it('is idempotent: re-evaluating never duplicates unlocks or rewards', () => {
    const m = { ...zero, completedSessions: 12, totalIntercepted: 55 };
    const first = evaluateAchievements(m, {}, emptyInventory(), NOW);
    const second = evaluateAchievements(m, first.record, first.inventory, NOW + 1000);
    expect(second.events).toEqual([]);
    expect(second.record).toEqual(first.record);
    expect(second.inventory).toEqual(first.inventory);
  });

  it('repairs a missing reward for an already unlocked achievement', () => {
    const r = evaluateAchievements(zero, { 'week-warrior': 123 }, emptyInventory(), NOW);
    expect(r.events).toEqual([]);
    expect(r.inventory.unlocked['hat:crown']).toBe(123);
  });

  it('reports progress from real metrics', () => {
    const list = progressList({ ...zero, completedSessions: 3, totalFocusMinutes: 30 }, {});
    const gs = list.find((p) => p.achievement.id === 'getting-started')!;
    expect(gs).toMatchObject({ value: 3, ratio: 0.6, unlockedAt: null, rewardId: 'color:pastel' });
    expect(list.find((p) => p.achievement.id === 'one-hour')!.ratio).toBe(0.5);
  });

  it('computes metrics from stored stats', () => {
    let s = emptyStats();
    s = recordFocus(s, '2026-11-23', 25, true, true);
    s = recordFocus(s, '2026-11-24', 95, true, true);
    s.totalIntercepted = 7;
    expect(computeMetrics(s, NOW)).toEqual({
      completedSessions: 2,
      longestSessionMinutes: 95,
      bestWeekSessions: 2,
      longestStreak: 2,
      totalIntercepted: 7,
      totalFocusMinutes: 120,
    });
  });

  it('rejects unknown or malformed stored achievements', () => {
    expect(validateAchievements({ 'first-focus': 5, fake: 1, dedicated: 'x' })).toEqual({
      'first-focus': 5,
    });
  });
});

describe('achievements end to end (worker logic)', () => {
  it('first completed focus session unlocks First Focus and the party hat, once, persistently', async () => {
    const h = await focusHarness();
    const s = await h.focus.start('focus', 5);
    if (isFocusError(s)) throw new Error(s.error);
    h.clock.advance(5 * MIN);
    await h.focus.tick();
    await h.focus.tick();
    expect(Object.keys(await h.store.getAchievements())).toEqual(['first-focus']);
    expect((await h.store.getInventory()).unlocked).toHaveProperty('hat:party');
    expect((await h.store.getUnseenUnlocks()).map((u) => u.achievementId)).toEqual(['first-focus']);
    expect(h.ended[0]!.unlocks.map((u) => u.achievementId)).toEqual(['first-focus']);
  });

  it('an interception unlocks First Rescue', async () => {
    const h = await focusHarness();
    h.tabs.add({ id: 1, url: 'https://www.youtube.com/', active: true });
    await h.manager.handlePageReady(1, 'https://www.youtube.com/');
    h.clock.advance(12_000);
    await h.manager.handleCountdownElapsed(1);
    expect(await h.store.getAchievements()).toHaveProperty('first-rescue');
  });

  it('resetting statistics keeps earned achievements and rewards', async () => {
    const h = await focusHarness();
    const s = await h.focus.start('focus', 5);
    if (isFocusError(s)) throw new Error(s.error);
    h.clock.advance(5 * MIN);
    await h.focus.tick();
    await h.manager.resetStats();
    expect((await h.store.getStats()).totalFocusSessions).toBe(0);
    expect(await h.store.getAchievements()).toHaveProperty('first-focus');
    expect((await h.store.getInventory()).unlocked).toHaveProperty('hat:party');
  });
});
