import { describe, expect, it } from 'vitest';
import { REAPPEAR_MS, SNOOZE_MS } from '../../src/shared/constants';
import type { TabSync } from '../../src/shared/types';
import { DOCS, harness, REDDIT, YT } from './helpers';

const counting = (s: TabSync) => (s.mode === 'counting' ? s.dueAt : null);

describe('countdown', () => {
  it('only starts when the distracting tab is active', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: false });
    expect(await h.manager.handlePageReady(1, YT)).toEqual({ mode: 'waiting' });
    h.tabs.activate(1);
    await h.manager.handleActivated(1, 1);
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'counting', dueAt: h.clock.t + 12_000 });
  });

  it('starts immediately for an active tab with the default 12s delay', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    const sync = await h.manager.handlePageReady(1, YT);
    expect(counting(sync)).toBe(h.clock.t + 12_000);
  });

  it('respects per-site delay overrides', async () => {
    const h = await harness((s) => ({
      ...s,
      sites: s.sites.map((x) => (x.id === 'youtube' ? { ...x, delaySeconds: 30 } : x)),
    }));
    h.tabs.add({ id: 1, url: YT, active: true });
    expect(counting(await h.manager.handlePageReady(1, YT))).toBe(h.clock.t + 30_000);
  });

  it('ignores non-distracting and disabled sites', async () => {
    const h = await harness((s) => ({
      ...s,
      sites: s.sites.map((x) => (x.id === 'reddit' ? { ...x, enabled: false } : x)),
    }));
    h.tabs.add({ id: 1, url: DOCS, active: true });
    h.tabs.add({ id: 2, url: REDDIT, active: false, windowId: 2 });
    expect(await h.manager.handlePageReady(1, DOCS)).toEqual({ mode: 'idle' });
    expect(await h.manager.handlePageReady(2, REDDIT)).toEqual({ mode: 'idle' });
  });

  it('refuses an early elapse and accepts it when due', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(5_000);
    expect((await h.manager.handleCountdownElapsed(1)).mode).toBe('counting');
    h.clock.advance(7_000);
    const sync = await h.manager.handleCountdownElapsed(1);
    expect(sync.mode).toBe('appear');
    const stats = await h.store.getStats();
    expect(stats.totalIntercepted).toBe(1);
  });

  it('elapse is idempotent (content timer + backup timer both firing)', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(12_000);
    await h.manager.handleCountdownElapsed(1, 'content');
    const again = await h.manager.handleCountdownElapsed(1, 'backup');
    expect(again.mode).toBe('appear');
    expect((await h.store.getStats()).totalIntercepted).toBe(1);
    expect((await h.store.getEscalation()).count).toBe(1);
  });

  it('duplicate PAGE_READY events and reloads do not reset a running countdown', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    const first = counting(await h.manager.handlePageReady(1, YT));
    h.clock.advance(4_000);
    const dup = counting(await h.manager.handlePageReady(1, YT));
    expect(dup).toBe(first);
  });

  it('reloading while the character is out brings it back quickly', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(12_000);
    await h.manager.handleCountdownElapsed(1);
    h.clock.advance(1_000);
    const sync = await h.manager.handlePageReady(1, YT);
    expect(counting(sync)).toBe(h.clock.t + REAPPEAR_MS);
  });
});

describe('switching tabs', () => {
  it('pauses the countdown when switching away and resumes with the remaining time', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    h.tabs.add({ id: 2, url: DOCS });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(5_000);
    h.tabs.activate(2);
    await h.manager.handleActivated(2, 1);
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'waiting' });
    h.clock.advance(60_000);
    h.tabs.activate(1);
    await h.manager.handleActivated(1, 1);
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'counting', dueAt: h.clock.t + 7_000 });
  });

  it('"start over" behavior restarts the countdown on return', async () => {
    const h = await harness((s) => ({ ...s, behavior: { ...s.behavior, switchAway: 'restart' } }));
    h.tabs.add({ id: 1, url: YT, active: true });
    h.tabs.add({ id: 2, url: DOCS });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(10_000);
    h.tabs.activate(2);
    await h.manager.handleActivated(2, 1);
    h.tabs.activate(1);
    await h.manager.handleActivated(1, 1);
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'counting', dueAt: h.clock.t + 12_000 });
  });

  it('hidden page (visibility) pauses too', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(3_000);
    expect(await h.manager.handleVisibility(1, false)).toEqual({ mode: 'waiting' });
    h.clock.advance(3_000);
    expect(counting(await h.manager.handleVisibility(1, true))).toBe(h.clock.t + 9_000);
  });

  it('a background tab can never make the character appear', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    h.tabs.add({ id: 2, url: DOCS });
    await h.manager.handlePageReady(1, YT);
    // Tab becomes inactive without us seeing onActivated (e.g. worker asleep).
    h.tabs.activate(2);
    h.clock.advance(13_000);
    const sync = await h.manager.handleCountdownElapsed(1);
    expect(sync).toEqual({ mode: 'waiting' });
  });

  it('survives rapid tab switching: only the final active tab counts down', async () => {
    const h = await harness();
    for (const id of [1, 2, 3]) h.tabs.add({ id, url: id === 2 ? REDDIT : YT });
    h.tabs.activate(1);
    await Promise.all([1, 2, 3].map((id) => h.manager.handlePageReady(id, id === 2 ? REDDIT : YT)));
    const order = [2, 3, 1, 3, 2, 1, 2, 3];
    await Promise.all(
      order.map((id) => {
        h.tabs.activate(id);
        return h.manager.handleActivated(id, 1);
      }),
    );
    const recs = await h.store.getTabs();
    expect(recs['3']!.phase).toBe('counting');
    expect(recs['1']!.phase).toBe('waiting');
    expect(recs['2']!.phase).toBe('waiting');
  });

  it('activation in another window does not pause this window', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true, windowId: 1 });
    h.tabs.add({ id: 9, url: DOCS, active: true, windowId: 2 });
    await h.manager.handlePageReady(1, YT);
    await h.manager.handleActivated(9, 2);
    expect((await h.store.getTabs())['1']!.phase).toBe('counting');
  });

  it('navigating to a non-distracting URL drops tracking', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.tabs.tabs.get(1)!.url = DOCS;
    await h.manager.handleUrlChanged(1, DOCS);
    expect(await h.store.getTabs()).toEqual({});
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'idle' });
  });

  it('closing a tab forgets it', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    await h.manager.handleRemoved(1);
    expect(await h.store.getTabs()).toEqual({});
  });
});

describe('service worker suspension', () => {
  it('a fresh worker instance picks up the persisted countdown', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(12_500);
    const fresh = h.restart(); // all in-memory state gone
    expect((await fresh.handleCountdownElapsed(1)).mode).toBe('appear');
  });

  it('a paused countdown keeps its remaining time across restarts', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    h.tabs.add({ id: 2, url: DOCS });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(8_000);
    h.tabs.activate(2);
    await h.manager.handleActivated(2, 1);
    h.restart();
    h.tabs.activate(1);
    await h.manager.handleActivated(1, 1);
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'counting', dueAt: h.clock.t + 4_000 });
  });
});

async function appeared(patch?: Parameters<typeof harness>[0]) {
  const h = await harness(patch);
  h.tabs.add({ id: 1, url: YT, active: true, title: 'Cats', index: 3 });
  h.tabs.add({ id: 2, url: REDDIT, windowId: 1 });
  await h.manager.handlePageReady(1, YT);
  await h.manager.handlePageReady(2, REDDIT);
  h.clock.advance(12_000);
  await h.manager.handleCountdownElapsed(1);
  h.clock.advance(4_000); // walk + cancel window
  return h;
}

const autoClose = (s: Parameters<Parameters<typeof harness>[0] & object>[0]) => ({
  ...s,
  autoClose: true,
});

describe('closing tabs', () => {
  it('nudge mode (default) never auto-closes', async () => {
    const h = await appeared();
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'auto-close-off',
    });
    expect(h.tabs.removed).toEqual([]);
    expect((await h.store.getStats()).days['2026-11-24']!.reminders).toBe(1);
  });

  it('nudge mode still lets the user close explicitly', async () => {
    const h = await appeared();
    expect(await h.manager.requestClose(1, 'manual', false)).toEqual({ ok: true });
    expect(h.tabs.removed).toEqual([1]);
  });

  it('auto-close closes exactly the verified tab and remembers it for undo', async () => {
    const h = await appeared(autoClose);
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({ ok: true });
    expect(h.tabs.removed).toEqual([1]);
    expect(await h.store.getLastClosed()).toMatchObject({
      url: YT,
      title: 'Cats',
      index: 3,
      siteName: 'YouTube',
    });
    expect((await h.store.getStats()).totalClosed).toBe(1);
  });

  it('never closes a background tab', async () => {
    const h = await appeared(autoClose);
    // Tab 2 was tracked but never active/appeared.
    expect((await h.manager.requestClose(2, 'auto', false)).ok).toBe(false);
    h.tabs.activate(2);
    await h.manager.handleActivated(2, 1);
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'not-approaching',
    });
    expect(h.tabs.removed).toEqual([]);
  });

  it('re-checks the tab is still active even without an activation event', async () => {
    const h = await appeared(autoClose);
    h.tabs.activate(2); // switched, but the event was lost
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it('refuses if the URL no longer matches', async () => {
    const h = await appeared(autoClose);
    h.tabs.tabs.get(1)!.url = DOCS;
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'url-mismatch',
    });
  });

  it('protects pinned tabs', async () => {
    const h = await appeared(autoClose);
    h.tabs.tabs.get(1)!.pinned = true;
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({ ok: false, reason: 'pinned' });
  });

  it('protects audible tabs by default, optionally not', async () => {
    const h = await appeared(autoClose);
    h.tabs.tabs.get(1)!.audible = true;
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'audible',
    });
    const h2 = await appeared((s) => ({
      ...s,
      autoClose: true,
      behavior: { ...s.behavior, protectAudible: false },
    }));
    h2.tabs.tabs.get(1)!.audible = true;
    expect(await h2.manager.requestClose(1, 'auto', false)).toEqual({ ok: true });
  });

  it('protects tabs with unsaved input', async () => {
    const h = await appeared(autoClose);
    expect(await h.manager.requestClose(1, 'auto', true)).toEqual({
      ok: false,
      reason: 'unsaved-input',
    });
  });

  it('refuses a close right after appearing (no instant close on release)', async () => {
    const h = await harness(autoClose);
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(12_000);
    await h.manager.handleCountdownElapsed(1);
    h.clock.advance(500);
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'too-soon',
    });
  });

  it('refuses after the user snoozed', async () => {
    const h = await appeared(autoClose);
    const sync = await h.manager.snoozeTab(1);
    expect(counting(sync)).toBe(h.clock.t + SNOOZE_MS);
    expect(await h.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'not-approaching',
    });
  });

  it('refuses while paused or disabled', async () => {
    const h = await appeared(autoClose);
    await h.manager.pause('15m');
    expect(await h.manager.requestClose(1, 'auto', false)).toMatchObject({ ok: false });
    const h2 = await appeared(autoClose);
    await h2.manager.setEnabled(false);
    expect(await h2.manager.requestClose(1, 'auto', false)).toEqual({
      ok: false,
      reason: 'disabled',
    });
    expect([...h.tabs.removed, ...h2.tabs.removed]).toEqual([]);
  });

  it('reopens the last closed tab with a grace period', async () => {
    const h = await appeared(autoClose);
    await h.manager.requestClose(1, 'auto', false);
    const res = await h.manager.reopenLast();
    expect(res.reopened).toBe(true);
    expect(h.tabs.created[0]).toMatchObject({ url: YT, index: 3 });
    const newId = [...h.tabs.tabs.keys()].find((id) => id >= 1000)!;
    const sync = await h.manager.handlePageReady(newId, YT);
    expect(counting(sync)).toBeGreaterThanOrEqual(h.clock.t + SNOOZE_MS);
    expect((await h.manager.reopenLast()).reopened).toBe(false);
  });
});

describe('escalation across visits', () => {
  it('gets faster and notices sooner on repeat visits, capped', async () => {
    const h = await harness();
    const multipliers: number[] = [];
    const delays: number[] = [];
    for (let visit = 0; visit < 7; visit++) {
      const id = 100 + visit;
      h.tabs.add({ id, url: YT });
      h.tabs.activate(id);
      const sync = await h.manager.handlePageReady(id, YT);
      const due = counting(sync)!;
      delays.push(due - h.clock.t);
      h.clock.advance(due - h.clock.t);
      const appear = await h.manager.handleCountdownElapsed(id);
      if (appear.mode !== 'appear') throw new Error('expected appear');
      multipliers.push(appear.plan.speedMultiplier);
      await h.manager.handleRemoved(id);
      h.tabs.tabs.delete(id);
    }
    expect(multipliers[0]).toBe(1);
    for (let i = 1; i < 5; i++) expect(multipliers[i]!).toBeGreaterThan(multipliers[i - 1]!);
    expect(multipliers[5]).toBe(multipliers[4]);
    expect(multipliers[6]).toBe(2.2);
    expect(delays[0]).toBe(12_000);
    expect(delays[4]).toBe(6_000);
    expect(delays[6]).toBe(6_000);
  });

  it('daily reset starts over the next day', async () => {
    const h = await harness();
    await h.store.setEscalation({ count: 4, periodKey: 'day:2026-11-23' });
    const status = await h.manager.status();
    expect(status.escalation.nextLevel).toBe(1);
  });
});

describe('user controls', () => {
  it('pause hides characters everywhere and resume restarts the active countdown', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    const status = await h.manager.pause('1h');
    expect(status.pause?.mode).toBe('1h');
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'idle' });
    expect((await h.manager.handleCountdownElapsed(1)).mode).toBe('idle');
    await h.manager.resume();
    expect(h.tabs.lastSync(1)).toMatchObject({ mode: 'counting' });
  });

  it('timed pauses expire on their own and start a new focus session', async () => {
    const h = await harness();
    const before = (await h.manager.status()).totalFocusSessions;
    await h.manager.pause('15m');
    h.clock.advance(15 * 60_000 + 1);
    const s = await h.manager.status();
    expect(s.pause).toBeNull();
    expect(s.totalFocusSessions).toBe(before + 1);
  });

  it('session pause lasts until the browser restarts', async () => {
    const h = await harness();
    await h.manager.pause('session');
    h.clock.advance(24 * 3600_000);
    expect((await h.manager.status()).pause?.mode).toBe('session');
    h.session.data.clear(); // browser restart wipes session storage
    expect((await h.restart().status()).pause).toBeNull();
  });

  it('emergency stop sends every character away until resumed', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    h.tabs.add({ id: 2, url: REDDIT, active: true, windowId: 2 });
    await h.manager.handlePageReady(1, YT);
    await h.manager.handlePageReady(2, REDDIT);
    h.clock.advance(12_000);
    await h.manager.handleCountdownElapsed(1);
    const s = await h.manager.emergencyStop();
    expect(s.pause).toMatchObject({ mode: 'indefinite', until: null });
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'idle' });
    expect(h.tabs.lastSync(2)).toEqual({ mode: 'idle' });
    h.clock.advance(7 * 24 * 3600_000);
    expect((await h.manager.status()).pause?.mode).toBe('indefinite');
  });

  it('cancel from the popup snoozes the active tab', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    h.clock.advance(12_000);
    await h.manager.handleCountdownElapsed(1);
    await h.manager.cancelActive();
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'counting', dueAt: h.clock.t + SNOOZE_MS });
  });

  it('disabling a site mid-countdown stops it', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    await h.store.updateSettings((s) => ({
      ...s,
      sites: s.sites.map((x) => (x.id === 'youtube' ? { ...x, enabled: false } : x)),
    }));
    await h.manager.resyncAll();
    expect(h.tabs.lastSync(1)).toEqual({ mode: 'idle' });
    expect(await h.store.getTabs()).toEqual({});
  });

  it('status reports the active tab countdown and today counts', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    await h.manager.handlePageReady(1, YT);
    const s = await h.manager.status();
    expect(s.activeTab).toEqual({
      siteName: 'YouTube',
      phase: 'counting',
      dueAt: h.clock.t + 12_000,
    });
    expect(s.autoClose).toBe(false);
    expect(s.streak).toBe(1);
  });
});
