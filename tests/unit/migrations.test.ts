import { describe, expect, it } from 'vitest';
import { STORAGE_SCHEMA_VERSION } from '../../src/shared/constants';
import { migrateStorage } from '../../src/shared/migrations';
import { LOCAL_KEYS, TablinStore } from '../../src/shared/storage';
import { MemoryArea } from './helpers';

/** A realistic v1 (Tablin 0.1.0) storage snapshot. */
function v1Storage(): MemoryArea {
  const local = new MemoryArea();
  local.data.set(LOCAL_KEYS.settings, {
    schemaVersion: 1,
    enabled: true,
    autoClose: true,
    delaySeconds: 20,
    defaultPause: '1h',
    sites: [
      {
        id: 'youtube',
        name: 'YouTube',
        domains: ['youtube.com'],
        enabled: false,
        color: '#FF0033',
        delaySeconds: 30,
        builtIn: true,
      },
      {
        id: 'reddit',
        name: 'Reddit',
        domains: ['reddit.com'],
        enabled: true,
        color: '#FF4500',
        delaySeconds: 8,
        builtIn: true,
      },
      {
        id: 'x',
        name: 'X',
        domains: ['x.com'],
        enabled: true,
        color: '#71767B',
        delaySeconds: null,
        builtIn: true,
      },
      {
        id: 'custom:twitch.tv',
        name: 'Twitch',
        domains: ['twitch.tv'],
        enabled: true,
        color: '#9146FF',
        delaySeconds: 45,
        builtIn: false,
      },
    ],
    character: {
      design: 'tablin',
      color: 'purple',
      size: 'large',
      intensity: 'lively',
      name: 'Mochi',
    },
    behavior: {
      escalationEnabled: true,
      maxSpeedMultiplier: 2.6,
      escalationCurve: 'steep',
      resetFrequency: 'session',
      slingshotEnabled: false,
      soundEnabled: true,
      reducedMotion: 'reduce',
      speed: 1.3,
      protectAudible: false,
      switchAway: 'restart',
    },
    onboardingComplete: true,
  });
  local.data.set(LOCAL_KEYS.stats, {
    days: {
      '2026-11-20': { intercepted: 7, closed: 3, snoozed: 2, reminders: 1 },
      '2026-11-21': { intercepted: 5, closed: 1, snoozed: 0, reminders: 0 },
    },
    totalIntercepted: 12,
    totalClosed: 4,
    totalFocusSessions: 9, // v1: browser sessions
  });
  local.data.set(LOCAL_KEYS.escalation, { count: 3, periodKey: 'day:2026-11-21' });
  return local;
}

const NOW = new Date(2026, 10, 24, 12).getTime();

describe('storage migration v1 → v2', () => {
  it('preserves every user choice and statistic', async () => {
    const local = v1Storage();
    const report = await migrateStorage(local, new MemoryArea(), NOW);
    expect(report).toMatchObject({ from: 0, to: STORAGE_SCHEMA_VERSION, migrated: true });
    const store = new TablinStore(local, new MemoryArea());
    const s = await store.getSettings();
    expect(s.schemaVersion).toBe(2);
    expect(s).toMatchObject({
      enabled: true,
      autoClose: true,
      delaySeconds: 20,
      defaultPause: '1h',
      onboardingComplete: true,
    });
    expect(s.character).toEqual({
      design: 'tablin',
      color: 'purple',
      size: 'large',
      intensity: 'lively',
      name: 'Mochi',
    });
    expect(s.behavior).toMatchObject({
      maxSpeedMultiplier: 2.6,
      escalationCurve: 'steep',
      resetFrequency: 'session',
      slingshotEnabled: false,
      soundEnabled: true,
      speed: 1.3,
      protectAudible: false,
      switchAway: 'restart',
    });
    const site = (id: string) => s.sites.find((x) => x.id === id)!;
    expect(site('youtube')).toMatchObject({
      enabled: false,
      delay: { mode: 'preset', seconds: 30 },
    });
    expect(site('reddit')).toMatchObject({ enabled: true, delay: { mode: 'custom', seconds: 8 } });
    expect(site('x').delay).toEqual({ mode: 'inherit' });
    expect(site('custom:twitch.tv')).toMatchObject({
      name: 'Twitch',
      delay: { mode: 'preset', seconds: 45 },
    });
    expect(s.focus.focusMinutes).toBe(25);

    const stats = await store.getStats();
    expect(stats.totalIntercepted).toBe(12);
    expect(stats.totalClosed).toBe(4);
    expect(stats.totalWatchSessions).toBe(9);
    expect(stats.totalFocusSessions).toBe(0);
    expect(stats.days['2026-11-20']).toMatchObject({ intercepted: 7, closed: 3, focusMinutes: 0 });
    expect(await store.getEscalation()).toEqual({ count: 3, periodKey: 'day:2026-11-21' });
  });

  it('initialises focus state, history and inventory', async () => {
    const local = v1Storage();
    await migrateStorage(local, new MemoryArea(), NOW);
    const store = new TablinStore(local, new MemoryArea());
    expect(await store.getFocus()).toEqual({ current: null, cycleCount: 0, celebrate: null });
    expect(await store.getFocusHistory()).toEqual([]);
    expect(await store.getSchemaVersion()).toBe(2);
  });

  it('unlocks only achievements the existing data really earned', async () => {
    const local = v1Storage();
    const report = await migrateStorage(local, new MemoryArea(), NOW);
    expect(report.unlocked.sort()).toEqual(['first-rescue', 'tab-guardian']);
    const store = new TablinStore(local, new MemoryArea());
    expect(Object.keys(await store.getAchievements()).sort()).toEqual([
      'first-rescue',
      'tab-guardian',
    ]);
    expect((await store.getInventory()).unlocked).toEqual({});
  });

  it('is idempotent: a second run is a no-op, and even a forced re-run duplicates nothing', async () => {
    const local = v1Storage();
    const session = new MemoryArea();
    await migrateStorage(local, session, NOW);
    const snapshot = structuredClone([...local.data.entries()]);
    expect((await migrateStorage(local, session, NOW + 1)).migrated).toBe(false);
    expect([...local.data.entries()]).toEqual(snapshot);

    local.data.set(LOCAL_KEYS.schemaVersion, 1); // force it to run again
    const again = await migrateStorage(local, session, NOW + 2);
    expect(again.unlocked).toEqual([]);
    const store = new TablinStore(local, session);
    expect((await store.getStats()).totalWatchSessions).toBe(9);
    expect(await store.getUnseenUnlocks()).toHaveLength(2);
    expect((await store.getSettings()).sites.find((x) => x.id === 'reddit')!.delay).toEqual({
      mode: 'custom',
      seconds: 8,
    });
  });

  it('handles corrupted / partial data without throwing', async () => {
    const local = new MemoryArea();
    local.data.set(LOCAL_KEYS.settings, { sites: 'nope', character: 42, delaySeconds: 'x' });
    local.data.set(LOCAL_KEYS.stats, null);
    local.data.set(LOCAL_KEYS.inventory, { unlocked: 'bad' });
    await expect(migrateStorage(local, new MemoryArea(), NOW)).resolves.toMatchObject({
      migrated: true,
    });
    const s = await new TablinStore(local, new MemoryArea()).getSettings();
    expect(s.sites).toHaveLength(6);
    expect(s.delaySeconds).toBe(12);
  });

  it('fresh installs simply get stamped as v2', async () => {
    const local = new MemoryArea();
    const report = await migrateStorage(local, new MemoryArea(), NOW);
    expect(report.unlocked).toEqual([]);
    expect(local.data.get(LOCAL_KEYS.schemaVersion)).toBe(2);
    expect(local.data.has(LOCAL_KEYS.settings)).toBe(false);
  });
});
