/**
 * Focus sessions and breaks, owned by the background worker.
 *
 * The timer is a pair of timestamps (startedAt/endsAt, or remainingMs while
 * paused) persisted in chrome.storage.local — never a setInterval in the popup.
 * Completion is triggered by a chrome.alarm, an in-memory backup timer, or any
 * status read that notices endsAt has passed; whichever comes first wins, and
 * completion is idempotent (keyed by session id), so it is recorded exactly once.
 */
import {
  BREAK_MINUTES_MAX,
  BREAK_MINUTES_MIN,
  FOCUS_HISTORY_LIMIT,
  FOCUS_MINUTES_MAX,
  FOCUS_MINUTES_MIN,
  MIN_RECORDED_FOCUS_MS,
  STREAK_QUALIFYING_MINUTES,
} from '../shared/constants';
import { dayKey, focusStreak, recordFocus, todayStats } from '../shared/stats';
import type { TablinStore } from '../shared/storage';
import type {
  ActiveFocusSession,
  FocusHistoryEntry,
  FocusKind,
  FocusSettings,
  FocusSnapshot,
  FocusState,
  UnlockEvent,
} from '../shared/types';
import type { Clock } from './distraction-manager';
import { syncProgress } from './progress';
import { Serial } from './serial';

export interface FocusDeps {
  store: TablinStore;
  clock?: Clock;
  newId?: () => string;
  serial?: Serial;
  /** Schedule (or clear, with null) the completion alarm. */
  scheduleEnd?: (endsAt: number | null) => void;
  /** A session ended (completed or stopped). Used for notifications. */
  onSessionEnd?: (entry: FocusHistoryEntry, unlocks: UnlockEvent[]) => void;
  /** Focus/break state changed (badge, relax-during-breaks resync). */
  onChange?: (state: FocusState) => void;
}

export type FocusError = { ok: false; error: string };

const minutesLimits = (kind: FocusKind) =>
  kind === 'focus'
    ? { min: FOCUS_MINUTES_MIN, max: FOCUS_MINUTES_MAX }
    : { min: BREAK_MINUTES_MIN, max: BREAK_MINUTES_MAX };

export function defaultMinutes(kind: FocusKind, settings: FocusSettings): number {
  if (kind === 'focus') return settings.focusMinutes;
  return kind === 'shortBreak' ? settings.shortBreakMinutes : settings.longBreakMinutes;
}

export function remainingMs(current: ActiveFocusSession, now: number): number {
  return current.status === 'running'
    ? Math.max(0, (current.endsAt ?? now) - now)
    : Math.max(0, current.remainingMs);
}

export class FocusManager {
  private readonly store: TablinStore;
  private readonly clock: Clock;
  private readonly newId: () => string;
  private readonly lock: Serial;

  constructor(private readonly deps: FocusDeps) {
    this.store = deps.store;
    this.clock = deps.clock ?? { now: () => Date.now() };
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.lock = deps.serial ?? new Serial();
  }

  private async save(state: FocusState): Promise<void> {
    await this.store.setFocus(state);
    const c = state.current;
    this.deps.scheduleEnd?.(c && c.status === 'running' ? c.endsAt : null);
    this.deps.onChange?.(state);
  }

  /** Starts a focus session or break. Any session already in progress is ended (and credited) first. */
  start(kind: FocusKind, minutes?: number): Promise<FocusSnapshot | FocusError> {
    return this.lock.run(async () => {
      const now = this.clock.now();
      const settings = (await this.store.getSettings()).focus;
      const length = minutes ?? defaultMinutes(kind, settings);
      const { min, max } = minutesLimits(kind);
      if (!Number.isInteger(length) || length < min || length > max) {
        return { ok: false, error: `Choose between ${min} and ${max} minutes.` };
      }
      let state = await this.reconcile(await this.store.getFocus(), now);
      if (state.current) state = await this.finish(state, 'ended', now);
      const durationMs = length * 60_000;
      state = {
        ...state,
        celebrate: null,
        current: {
          id: this.newId(),
          kind,
          status: 'running',
          durationMs,
          startedAt: now,
          endsAt: now + durationMs,
          remainingMs: durationMs,
        },
      };
      await this.save(state);
      return this.snapshotOf(state, now);
    });
  }

  pause(): Promise<FocusSnapshot> {
    return this.lock.run(async () => {
      const now = this.clock.now();
      let state = await this.reconcile(await this.store.getFocus(), now);
      const c = state.current;
      if (c && c.status === 'running') {
        state = {
          ...state,
          current: { ...c, status: 'paused', remainingMs: remainingMs(c, now), endsAt: null },
        };
        await this.save(state);
      }
      return this.snapshotOf(state, now);
    });
  }

  resume(): Promise<FocusSnapshot> {
    return this.lock.run(async () => {
      const now = this.clock.now();
      let state = await this.reconcile(await this.store.getFocus(), now);
      const c = state.current;
      if (c && c.status === 'paused') {
        state = { ...state, current: { ...c, status: 'running', endsAt: now + c.remainingMs } };
        await this.save(state);
      }
      return this.snapshotOf(state, now);
    });
  }

  /** Stop early. Time already focused is credited; nothing is taken away. */
  end(): Promise<FocusSnapshot> {
    return this.lock.run(async () => {
      const now = this.clock.now();
      let state = await this.reconcile(await this.store.getFocus(), now);
      if (state.current) {
        state = await this.finish(state, 'ended', now);
        await this.save(state);
      }
      return this.snapshotOf(state, now);
    });
  }

  /** Called by the completion alarm / backup timer. Safe to call any number of times. */
  tick(): Promise<FocusSnapshot> {
    return this.lock.run(async () => {
      const now = this.clock.now();
      const state = await this.reconcile(await this.store.getFocus(), now);
      return this.snapshotOf(state, now);
    });
  }

  snapshot(): Promise<FocusSnapshot> {
    return this.tick();
  }

  /** The UI showed the completion celebration. */
  acknowledge(): Promise<FocusSnapshot> {
    return this.lock.run(async () => {
      const now = this.clock.now();
      let state = await this.reconcile(await this.store.getFocus(), now);
      if (state.celebrate) {
        state = { ...state, celebrate: null };
        await this.store.setFocus(state);
      }
      return this.snapshotOf(state, now);
    });
  }

  // ---------------------------------------------------------------------------

  /** Completes the running session if its end time has passed (persisting the result). */
  private async reconcile(state: FocusState, now: number): Promise<FocusState> {
    const c = state.current;
    if (!c || c.status !== 'running' || c.endsAt === null || now < c.endsAt) return state;
    let next = await this.finish(state, 'completed', c.endsAt);
    const settings = (await this.store.getSettings()).focus;
    if (c.kind === 'focus' && settings.autoStartBreaks) {
      const kind = nextBreakKind(next.cycleCount, settings);
      const durationMs = defaultMinutes(kind, settings) * 60_000;
      // The break starts when the focus session ended, not when we noticed.
      const startedAt = c.endsAt;
      next = {
        ...next,
        current: {
          id: this.newId(),
          kind,
          status: 'running',
          durationMs,
          startedAt,
          endsAt: startedAt + durationMs,
          remainingMs: durationMs,
        },
      };
      // If that break has also elapsed meanwhile (computer asleep), complete it too.
      if (now >= startedAt + durationMs)
        next = await this.finish(next, 'completed', startedAt + durationMs);
    }
    await this.save(next);
    return next;
  }

  /**
   * Records the current session as completed or ended and clears it.
   * Idempotent: a session id already in history is never recorded twice.
   */
  private async finish(
    state: FocusState,
    outcome: 'completed' | 'ended',
    endedAt: number,
  ): Promise<FocusState> {
    const c = state.current;
    if (!c) return state;
    const focusedMs =
      outcome === 'completed' ? c.durationMs : c.durationMs - remainingMs(c, endedAt);
    const entry: FocusHistoryEntry = {
      id: c.id,
      kind: c.kind,
      outcome,
      startedAt: c.startedAt,
      endedAt,
      plannedMs: c.durationMs,
      focusedMs: Math.max(0, Math.round(focusedMs)),
      day: dayKey(endedAt),
    };

    const history = await this.store.getFocusHistory();
    let unlocks: UnlockEvent[] = [];
    const alreadyRecorded = history.some((h) => h.id === c.id);
    const worthRecording = outcome === 'completed' || entry.focusedMs >= MIN_RECORDED_FOCUS_MS;

    if (!alreadyRecorded && worthRecording) {
      await this.store.setFocusHistory([entry, ...history].slice(0, FOCUS_HISTORY_LIMIT));
      if (c.kind === 'focus') {
        const minutes = entry.focusedMs / 60_000;
        const completed = outcome === 'completed';
        const qualifies = completed && minutes >= STREAK_QUALIFYING_MINUTES;
        await this.store.setStats(
          recordFocus(await this.store.getStats(), entry.day, minutes, completed, qualifies),
        );
        unlocks = await syncProgress(this.store, endedAt);
      }
    }

    let cycleCount = state.cycleCount;
    if (outcome === 'completed' && c.kind === 'focus') cycleCount += 1;
    if (outcome === 'completed' && c.kind === 'longBreak') cycleCount = 0;

    const celebrate = outcome === 'completed' && !alreadyRecorded ? entry : state.celebrate;
    if (!alreadyRecorded && worthRecording) this.deps.onSessionEnd?.(entry, unlocks);
    return { current: null, cycleCount, celebrate };
  }

  private async snapshotOf(state: FocusState, now: number): Promise<FocusSnapshot> {
    const [settings, stats, history] = await Promise.all([
      this.store.getSettings(),
      this.store.getStats(),
      this.store.getFocusHistory(),
    ]);
    const today = todayStats(stats, now);
    return {
      now,
      current: state.current,
      remainingMs: state.current ? remainingMs(state.current, now) : 0,
      celebrate: state.celebrate,
      nextBreak: nextBreakKind(state.cycleCount, settings.focus),
      cycleCount: state.cycleCount,
      settings: settings.focus,
      streak: focusStreak(stats, now),
      today: { focusMinutes: today.focusMinutes, focusSessions: today.focusSessions },
      history: history.slice(0, 20),
    };
  }
}

/** Every Nth completed focus session earns a long break. */
export function nextBreakKind(
  cycleCount: number,
  settings: FocusSettings,
): 'shortBreak' | 'longBreak' {
  return cycleCount > 0 && cycleCount % settings.sessionsBeforeLongBreak === 0
    ? 'longBreak'
    : 'shortBreak';
}

export function isFocusError(v: unknown): v is FocusError {
  return typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;
}
