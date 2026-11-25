/**
 * Versioned storage migrations. Each step is idempotent: running the whole
 * migration twice (or on partially written / corrupted data) never duplicates
 * rewards or loses user data.
 *
 *   v0  fresh install (nothing stored)
 *   v1  Tablin 0.1.x: settings.sites[].delaySeconds, stats.totalFocusSessions = browser sessions
 *   v2  Tablin 2.0: per-site DelayConfig, focus settings, focus timer state & history,
 *       achievements, inventory; stats.totalWatchSessions + focus totals
 */
import { computeMetrics, evaluateAchievements } from './achievements';
import { STORAGE_SCHEMA_VERSION } from './constants';
import { LOCAL_KEYS, TablinStore, type KeyValueArea } from './storage';
import { validateSettings } from './settings';
import { validateStats } from './stats';

export interface MigrationReport {
  from: number;
  to: number;
  migrated: boolean;
  /** Achievements newly unlocked from existing data during migration. */
  unlocked: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Converts v1 stats in place-equivalent: browser-session count moves to totalWatchSessions. */
export function migrateStatsV1(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  if (raw.totalWatchSessions !== undefined) return raw; // already v2
  return {
    ...raw,
    totalWatchSessions: typeof raw.totalFocusSessions === 'number' ? raw.totalFocusSessions : 0,
    totalFocusSessions: 0,
    totalFocusMinutes: 0,
    longestFocusMinutes: 0,
    longestStreak: 0,
  };
}

export async function migrateStorage(
  local: KeyValueArea,
  session: KeyValueArea,
  now: number = Date.now(),
): Promise<MigrationReport> {
  const store = new TablinStore(local, session);
  const from = await store.getSchemaVersion();
  if (from >= STORAGE_SCHEMA_VERSION) {
    return { from, to: from, migrated: false, unlocked: [] };
  }

  const raw = await local.get([LOCAL_KEYS.settings, LOCAL_KEYS.stats]);

  // Settings: validateSettings understands the v1 shape and preserves every user choice
  // (site toggles, per-site delays → DelayConfig, color, name, behavior).
  if (raw[LOCAL_KEYS.settings] !== undefined) {
    await local.set({ [LOCAL_KEYS.settings]: validateSettings(raw[LOCAL_KEYS.settings]) });
  }

  // Stats: keep every counter and day; re-label the v1 session counter.
  const stats = validateStats(migrateStatsV1(raw[LOCAL_KEYS.stats]));
  if (raw[LOCAL_KEYS.stats] !== undefined) await store.setStats(stats);

  // New stores: initialise only if missing (validators repair anything malformed).
  const existing = await local.get([
    LOCAL_KEYS.focus,
    LOCAL_KEYS.focusHistory,
    LOCAL_KEYS.inventory,
    LOCAL_KEYS.achievements,
  ]);
  if (existing[LOCAL_KEYS.focus] === undefined) await store.setFocus(await store.getFocus());
  if (existing[LOCAL_KEYS.focusHistory] === undefined) await store.setFocusHistory([]);

  // Achievements earned by data that already exists (e.g. distractions intercepted in v1)
  // are unlocked for real; idempotent, so a second run grants nothing new.
  const result = evaluateAchievements(
    computeMetrics(stats, now),
    await store.getAchievements(),
    await store.getInventory(),
    now,
  );
  await store.setAchievements(result.record);
  await store.setInventory(result.inventory);
  if (result.events.length > 0) {
    await store.setUnseenUnlocks([...(await store.getUnseenUnlocks()), ...result.events]);
  }

  await store.setSchemaVersion(STORAGE_SCHEMA_VERSION);
  return {
    from,
    to: STORAGE_SCHEMA_VERSION,
    migrated: true,
    unlocked: result.events.map((e) => e.achievementId),
  };
}
