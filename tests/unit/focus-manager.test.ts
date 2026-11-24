import { describe, expect, it } from 'vitest';
import { isFocusError, nextBreakKind, type FocusError } from '../../src/background/focus-manager';
import { DEFAULT_FOCUS } from '../../src/shared/settings';
import type { FocusSnapshot } from '../../src/shared/types';
import { focusHarness, MIN, YT } from './helpers';

const ok = (s: FocusSnapshot | FocusError) => {
  if (isFocusError(s)) throw new Error(s.error);
  return s as FocusSnapshot;
};

describe('focus sessions', () => {
  it('starts a 25-minute session by default with a durable end timestamp and an alarm', async () => {
    const h = await focusHarness();
    const snap = ok(await h.focus.start('focus'));
    expect(snap.current).toMatchObject({
      kind: 'focus',
      status: 'running',
      durationMs: 25 * MIN,
      endsAt: h.clock.t + 25 * MIN,
    });
    expect(snap.remainingMs).toBe(25 * MIN);
    expect(h.alarms.at(-1)).toBe(h.clock.t + 25 * MIN);
    expect((await h.store.getFocus()).current?.id).toBe(snap.current!.id);
  });

  it('accepts custom durations within 1–240 minutes and rejects others', async () => {
    const h = await focusHarness();
    expect(ok(await h.focus.start('focus', 1)).current?.durationMs).toBe(MIN);
    expect(ok(await h.focus.start('focus', 240)).current?.durationMs).toBe(240 * MIN);
    for (const bad of [0, 241, 1.5, -5])
      expect(isFocusError(await h.focus.start('focus', bad))).toBe(true);
    expect(isFocusError(await h.focus.start('shortBreak', 61))).toBe(true);
  });

  it('pauses and resumes using timestamps (paused time does not count)', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(10 * MIN);
    const paused = await h.focus.pause();
    expect(paused.current).toMatchObject({ status: 'paused', remainingMs: 15 * MIN, endsAt: null });
    expect(h.alarms.at(-1)).toBeNull();
    h.clock.advance(60 * MIN); // a long pause
    expect((await h.focus.snapshot()).remainingMs).toBe(15 * MIN);
    const resumed = await h.focus.resume();
    expect(resumed.current).toMatchObject({ status: 'running', endsAt: h.clock.t + 15 * MIN });
    h.clock.advance(15 * MIN);
    const done = await h.focus.tick();
    expect(done.current).toBeNull();
    expect(done.celebrate).toMatchObject({ outcome: 'completed', focusedMs: 25 * MIN });
  });

  it('completes when the end time passes, records stats once, and celebrates', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(25 * MIN + 500);
    const snap = await h.focus.tick();
    expect(snap.celebrate).toMatchObject({ kind: 'focus', outcome: 'completed' });
    const stats = await h.store.getStats();
    expect(stats.totalFocusSessions).toBe(1);
    expect(stats.totalFocusMinutes).toBe(25);
    expect(stats.days['2026-11-24']).toMatchObject({
      focusMinutes: 25,
      focusSessions: 1,
      qualifyingSessions: 1,
    });
    expect(snap.streak).toMatchObject({ current: 1, todayDone: true });
    expect(h.ended).toHaveLength(1);
  });

  it('never records a completion twice (alarm + backup timer + popup + restarted worker)', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(26 * MIN);
    await Promise.all([h.focus.tick(), h.focus.tick(), h.focus.snapshot()]);
    await h.restartFocus().tick();
    await h.focus.tick();
    const stats = await h.store.getStats();
    expect(stats.totalFocusSessions).toBe(1);
    expect(await h.store.getFocusHistory()).toHaveLength(1);
    expect(h.ended).toHaveLength(1);
  });

  it('survives service worker suspension (fresh manager over the same storage)', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 45));
    h.clock.advance(20 * MIN);
    const fresh = h.restartFocus();
    expect((await fresh.snapshot()).remainingMs).toBe(25 * MIN);
    h.clock.advance(25 * MIN);
    expect((await fresh.tick()).celebrate?.focusedMs).toBe(45 * MIN);
  });

  it('keeps running with no UI at all (popup closed): completion is found by the alarm tick', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 15));
    // Nothing calls snapshot (no popup). Time passes; only the alarm fires.
    h.clock.advance(15 * MIN);
    await h.focus.tick();
    expect((await h.store.getStats()).totalFocusSessions).toBe(1);
    // The celebration waits for the next time the popup opens.
    expect((await h.store.getFocus()).celebrate?.kind).toBe('focus');
    expect((await h.focus.acknowledge()).celebrate).toBeNull();
  });

  it('ending early credits the focused time but is not a completed session (no penalty, no streak)', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(12 * MIN);
    const snap = await h.focus.end();
    expect(snap.current).toBeNull();
    expect(snap.celebrate).toBeNull();
    const stats = await h.store.getStats();
    expect(stats.totalFocusMinutes).toBe(12);
    expect(stats.totalFocusSessions).toBe(0);
    expect(snap.streak.current).toBe(0);
    expect((await h.store.getFocusHistory())[0]).toMatchObject({
      outcome: 'ended',
      focusedMs: 12 * MIN,
    });
  });

  it('a session ended within the first minute is not recorded at all', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(20_000);
    await h.focus.end();
    expect(await h.store.getFocusHistory()).toEqual([]);
  });

  it('starting a new session ends (and credits) the running one', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(10 * MIN);
    const snap = ok(await h.focus.start('shortBreak'));
    expect(snap.current?.kind).toBe('shortBreak');
    expect((await h.store.getStats()).totalFocusMinutes).toBe(10);
  });

  it('suggests a long break after every 4 completed focus sessions', async () => {
    const h = await focusHarness();
    for (let i = 0; i < 4; i++) {
      expect((await h.focus.snapshot()).nextBreak).toBe('shortBreak');
      ok(await h.focus.start('focus', 5));
      h.clock.advance(5 * MIN);
      await h.focus.tick();
    }
    const snap = await h.focus.snapshot();
    expect(snap.cycleCount).toBe(4);
    expect(snap.nextBreak).toBe('longBreak');
    ok(await h.focus.start('longBreak'));
    h.clock.advance(15 * MIN);
    expect((await h.focus.tick()).cycleCount).toBe(0);
    expect(nextBreakKind(8, DEFAULT_FOCUS)).toBe('longBreak');
  });

  it('breaks complete without counting as focus time', async () => {
    const h = await focusHarness();
    ok(await h.focus.start('shortBreak', 5));
    h.clock.advance(5 * MIN);
    const snap = await h.focus.tick();
    expect(snap.celebrate).toMatchObject({ kind: 'shortBreak', outcome: 'completed' });
    expect((await h.store.getStats()).totalFocusMinutes).toBe(0);
  });

  it('auto-starts the break at the moment focus ended, even if noticed late', async () => {
    const h = await focusHarness((s) => ({ ...s, focus: { ...s.focus, autoStartBreaks: true } }));
    const start = h.clock.t;
    ok(await h.focus.start('focus', 25));
    h.clock.advance(27 * MIN); // alarm delayed 2 minutes
    const snap = await h.focus.tick();
    expect(snap.current).toMatchObject({
      kind: 'shortBreak',
      startedAt: start + 25 * MIN,
      endsAt: start + 30 * MIN,
    });
    expect(snap.remainingMs).toBe(3 * MIN);
  });

  it('a break that also elapsed while the computer slept completes too', async () => {
    const h = await focusHarness((s) => ({ ...s, focus: { ...s.focus, autoStartBreaks: true } }));
    ok(await h.focus.start('focus', 25));
    h.clock.advance(3 * 60 * MIN);
    const snap = await h.focus.tick();
    expect(snap.current).toBeNull();
    expect((await h.store.getFocusHistory()).map((e) => e.kind)).toEqual(['shortBreak', 'focus']);
  });

  it('records the completion on the local day it ended', async () => {
    const h = await focusHarness();
    h.clock.t = new Date(2026, 10, 24, 23, 50).getTime();
    ok(await h.focus.start('focus', 25));
    h.clock.advance(30 * MIN); // noticed just after midnight
    await h.focus.tick();
    expect((await h.store.getFocusHistory())[0]!.day).toBe('2026-11-25');
  });
});

describe('focus × distractions', () => {
  it('relaxes interceptions during breaks (by default) and resumes after', async () => {
    const h = await focusHarness();
    h.tabs.add({ id: 1, url: YT, active: true });
    ok(await h.focus.start('shortBreak', 5));
    expect(await h.manager.handlePageReady(1, YT)).toEqual({ mode: 'idle' });
    expect((await h.manager.status()).relaxing).toBe(true);
    h.clock.advance(5 * MIN);
    await h.focus.tick();
    expect((await h.manager.handlePageReady(1, YT)).mode).toBe('counting');
  });

  it('keeps intercepting during breaks when relax is off', async () => {
    const h = await focusHarness((s) => ({
      ...s,
      focus: { ...s.focus, relaxDuringBreaks: false },
    }));
    h.tabs.add({ id: 1, url: YT, active: true });
    ok(await h.focus.start('shortBreak', 5));
    expect((await h.manager.handlePageReady(1, YT)).mode).toBe('counting');
  });

  it('during focus the character mentions the session', async () => {
    const h = await focusHarness();
    h.tabs.add({ id: 1, url: YT, active: true });
    ok(await h.focus.start('focus', 25));
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(12_000);
    const sync = await h.manager.handleCountdownElapsed(1);
    if (sync.mode !== 'appear') throw new Error('expected appear');
    expect(sync.plan.focusActive).toBe(true);
    expect(sync.plan.message).toMatch(/mid-focus/);
  });

  it('a focus completion and an interception at the same moment never lose an update', async () => {
    const h = await focusHarness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    ok(await h.focus.start('focus', 1));
    h.clock.advance(MIN);
    await Promise.all([h.focus.tick(), h.manager.handleCountdownElapsed(1), h.focus.tick()]);
    const stats = await h.store.getStats();
    expect(stats.totalIntercepted).toBe(1);
    expect(stats.totalFocusSessions).toBe(1);
  });
});
