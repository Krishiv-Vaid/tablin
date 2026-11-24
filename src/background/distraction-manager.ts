import {
  ELAPSE_TOLERANCE_MS,
  PAUSE_DURATIONS_MS,
  REAPPEAR_MS,
  REOPEN_WINDOW_MS,
  SNOOZE_MS,
} from '../shared/constants';
import { matchSite } from '../detection/website-detector';
import { baseDelayMs } from '../shared/settings';
import { bumpDay, computeStreak, pruneStats, todayStats, touchDay } from '../shared/stats';
import type { TablinStore } from '../shared/storage';
import type {
  CloseResult,
  FocusSession,
  LastClosedTab,
  PauseMode,
  PauseState,
  Settings,
  SiteRule,
  StatusSnapshot,
  TabRecord,
  TabSync,
} from '../shared/types';
import {
  buildPlan,
  currentCount,
  effectiveDelayMs,
  levelForCount,
  periodKey,
  speedMultiplierForLevel,
} from './escalation-manager';
import { verifyClosable, type TabInfo, type TabsPort } from './tab-manager';

export interface Clock {
  now(): number;
}

export interface ManagerDeps {
  store: TablinStore;
  tabs: TabsPort;
  clock?: Clock;
  newId?: () => string;
  /** Optional in-memory backup timer; the persisted state stays authoritative. */
  scheduleBackup?: (tabId: number, dueAt: number | null) => void;
  /** Called when pause/enabled state changes (badge, alarms). */
  onPauseChanged?: (pause: PauseState | null) => void;
}

interface Ctx {
  now: number;
  settings: Settings;
  pause: PauseState | null;
  watching: boolean;
  tabs: Record<string, TabRecord>;
  session: FocusSession;
  outbox: Map<number, TabSync>;
}

const key = (tabId: number) => String(tabId);

/**
 * Owns the per-tab countdown/appearance lifecycle.
 *
 * Every public method loads state from storage, mutates it, persists it and only then
 * notifies content scripts. Nothing critical lives only in memory, so the Chrome
 * service worker can be suspended and restarted between any two events. Calls are
 * serialised so rapid tab switching can't interleave read-modify-write cycles.
 */
export class DistractionManager {
  private readonly store: TablinStore;
  private readonly tabs: TabsPort;
  private readonly clock: Clock;
  private readonly newId: () => string;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ManagerDeps) {
    this.store = deps.store;
    this.tabs = deps.tabs;
    this.clock = deps.clock ?? { now: () => Date.now() };
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  // ---------------------------------------------------------------------------
  // Context helpers

  private async load(): Promise<Ctx> {
    const now = this.clock.now();
    const [settings, tabs] = await Promise.all([this.store.getSettings(), this.store.getTabs()]);
    const pause = await this.activePause(now);
    const session = await this.ensureSession(now);
    return {
      now,
      settings,
      pause,
      watching: settings.enabled && pause === null,
      tabs,
      session,
      outbox: new Map(),
    };
  }

  private async commit(ctx: Ctx): Promise<void> {
    await this.store.setTabs(ctx.tabs);
    for (const [tabId, sync] of ctx.outbox) {
      void this.tabs.send(tabId, { type: 'SYNC', sync });
    }
    if (this.deps.scheduleBackup) {
      for (const rec of Object.values(ctx.tabs)) {
        this.deps.scheduleBackup(rec.tabId, rec.phase === 'counting' ? dueAt(rec) : null);
      }
    }
  }

  private async activePause(now: number): Promise<PauseState | null> {
    const sessionPause = await this.store.getSessionPause();
    if (sessionPause) return sessionPause;
    const pause = await this.store.getPause();
    if (pause && pause.until !== null && pause.until <= now) {
      // A timed pause ran out: clear it and begin a fresh focus session.
      await this.store.setPause(null);
      await this.startFocusSession(now);
      this.deps.onPauseChanged?.(null);
      return null;
    }
    return pause;
  }

  private async ensureSession(now: number): Promise<FocusSession> {
    return (await this.store.getFocusSession()) ?? this.startFocusSession(now);
  }

  private async startFocusSession(now: number): Promise<FocusSession> {
    const session: FocusSession = { id: this.newId(), startedAt: now, intercepted: 0 };
    await this.store.setFocusSession(session);
    const stats = touchDay(await this.store.getStats(), now);
    stats.totalFocusSessions += 1;
    await this.store.setStats(pruneStats(stats, now));
    return session;
  }

  private site(ctx: Ctx, rec: TabRecord): SiteRule | undefined {
    return ctx.settings.sites.find((s) => s.id === rec.siteId);
  }

  private async escalation(ctx: Ctx) {
    const state = await this.store.getEscalation();
    const pk = periodKey(ctx.settings.behavior.resetFrequency, ctx.now, ctx.session.id);
    const count = currentCount(state, pk);
    return { periodKey: pk, count, level: levelForCount(count) };
  }

  private fullDelay(ctx: Ctx, site: SiteRule, level: number): number {
    return effectiveDelayMs(
      baseDelayMs(ctx.settings, site),
      level,
      ctx.settings.behavior.escalationEnabled,
    );
  }

  private syncFor(ctx: Ctx, rec: TabRecord | undefined): TabSync {
    if (!rec || !ctx.watching) return { mode: 'idle' };
    switch (rec.phase) {
      case 'appeared': {
        const site = this.site(ctx, rec);
        return {
          mode: 'appear',
          plan: buildPlan(rec.level, ctx.settings, site?.name ?? 'This site'),
        };
      }
      case 'counting':
        return { mode: 'counting', dueAt: dueAt(rec) ?? ctx.now };
      default:
        return { mode: 'waiting' };
    }
  }

  private push(ctx: Ctx, rec: TabRecord | undefined, tabId: number): void {
    ctx.outbox.set(tabId, this.syncFor(ctx, rec));
  }

  /** Begin counting (only from 'waiting'; a running countdown is left untouched). */
  private start(ctx: Ctx, rec: TabRecord): void {
    if (rec.phase !== 'waiting') return;
    rec.phase = 'counting';
    rec.resumedAt = ctx.now;
  }

  /** Stop counting / dismiss the character because the tab is no longer in front. */
  private async stop(ctx: Ctx, rec: TabRecord): Promise<void> {
    const behavior = ctx.settings.behavior.switchAway;
    if (rec.phase === 'counting' && rec.resumedAt !== null) {
      if (behavior === 'pause') {
        rec.remainingMs = Math.max(0, rec.remainingMs - (ctx.now - rec.resumedAt));
      } else {
        const site = this.site(ctx, rec);
        if (site) rec.remainingMs = this.fullDelay(ctx, site, rec.level);
      }
    } else if (rec.phase === 'appeared') {
      const site = this.site(ctx, rec);
      rec.level = (await this.escalation(ctx)).level;
      rec.remainingMs =
        behavior === 'pause' || !site ? REAPPEAR_MS : this.fullDelay(ctx, site, rec.level);
      rec.appearedAt = null;
    }
    rec.phase = 'waiting';
    rec.resumedAt = null;
  }

  private matchesRecord(ctx: Ctx, rec: TabRecord, url: string): boolean {
    const site = matchSite(url, ctx.settings.sites);
    return site !== null && site.id === rec.siteId;
  }

  // ---------------------------------------------------------------------------
  // Tab lifecycle events

  /** A content script loaded (navigation, reload, or injection into an existing tab). */
  handlePageReady(tabId: number, url: string): Promise<TabSync> {
    return this.serial(async () => {
      const ctx = await this.load();
      const site = matchSite(url, ctx.settings.sites);
      const k = key(tabId);
      if (!site) {
        delete ctx.tabs[k];
        await this.commit(ctx);
        return { mode: 'idle' };
      }
      const tab = await this.tabs.get(tabId);
      let rec = ctx.tabs[k];
      if (rec && rec.siteId === site.id) {
        // Same site again: a duplicate event or a reload. Never reset a running countdown
        // (reloading must not buy extra time); if the character was out, bring it back soon.
        rec.url = url;
        if (rec.phase === 'appeared') {
          rec.phase = 'waiting';
          rec.resumedAt = null;
          rec.appearedAt = null;
          rec.remainingMs = REAPPEAR_MS;
          rec.level = (await this.escalation(ctx)).level;
        }
      } else {
        const { level } = await this.escalation(ctx);
        const grace = await this.store.getGrace();
        const graceUntil = grace[k];
        rec = {
          tabId,
          windowId: tab?.windowId ?? -1,
          siteId: site.id,
          url,
          phase: 'waiting',
          remainingMs: this.fullDelay(ctx, site, level),
          resumedAt: null,
          snoozedUntil: graceUntil !== undefined && graceUntil > ctx.now ? graceUntil : null,
          appearedAt: null,
          level,
        };
        ctx.tabs[k] = rec;
      }
      if (tab) rec.windowId = tab.windowId;
      if (tab?.active && ctx.watching) this.start(ctx, rec);
      await this.commit(ctx);
      return this.syncFor(ctx, rec);
    });
  }

  /** chrome.tabs.onActivated: pause every other tracked tab in the window, resume this one. */
  handleActivated(tabId: number, windowId: number): Promise<void> {
    return this.serial(async () => {
      const ctx = await this.load();
      for (const rec of Object.values(ctx.tabs)) {
        if (rec.tabId !== tabId && rec.windowId === windowId && rec.phase !== 'waiting') {
          await this.stop(ctx, rec);
          this.push(ctx, rec, rec.tabId);
        }
      }
      const rec = ctx.tabs[key(tabId)];
      if (rec) {
        const tab = await this.tabs.get(tabId);
        if (!tab || !this.matchesRecord(ctx, rec, tab.url || rec.url)) {
          delete ctx.tabs[key(tabId)];
          ctx.outbox.set(tabId, { mode: 'idle' });
        } else {
          rec.windowId = windowId;
          if (tab.active && ctx.watching) this.start(ctx, rec);
          this.push(ctx, rec, tabId);
        }
      }
      await this.commit(ctx);
    });
  }

  /** The page reported a visibility change (tab switch, window minimised, etc.). */
  handleVisibility(tabId: number, visible: boolean): Promise<TabSync> {
    return this.serial(async () => {
      const ctx = await this.load();
      const rec = ctx.tabs[key(tabId)];
      if (!rec) return { mode: 'idle' };
      if (!visible) {
        if (rec.phase !== 'waiting') await this.stop(ctx, rec);
      } else {
        const tab = await this.tabs.get(tabId);
        if (tab?.active && ctx.watching) this.start(ctx, rec);
      }
      await this.commit(ctx);
      return this.syncFor(ctx, rec);
    });
  }

  /** chrome.tabs.onUpdated with a URL change (including single-page-app navigation). */
  handleUrlChanged(tabId: number, url: string): Promise<void> {
    return this.serial(async () => {
      const ctx = await this.load();
      const rec = ctx.tabs[key(tabId)];
      if (!rec) return;
      if (this.matchesRecord(ctx, rec, url)) {
        rec.url = url;
      } else {
        delete ctx.tabs[key(tabId)];
        ctx.outbox.set(tabId, { mode: 'idle' });
      }
      await this.commit(ctx);
    });
  }

  handleRemoved(tabId: number): Promise<void> {
    return this.serial(async () => {
      const ctx = await this.load();
      delete ctx.tabs[key(tabId)];
      const grace = await this.store.getGrace();
      if (key(tabId) in grace) {
        delete grace[key(tabId)];
        await this.store.setGrace(grace);
      }
      this.deps.scheduleBackup?.(tabId, null);
      await this.commit(ctx);
    });
  }

  /**
   * The countdown finished (reported by the content script, or the backup timer).
   * Re-verifies everything before letting the character appear; idempotent.
   */
  handleCountdownElapsed(
    tabId: number,
    source: 'content' | 'backup' = 'content',
  ): Promise<TabSync> {
    return this.serial(async () => {
      const ctx = await this.load();
      const k = key(tabId);
      const rec = ctx.tabs[k];
      if (!rec || !ctx.watching || rec.phase !== 'counting') return this.syncFor(ctx, rec);
      const due = dueAt(rec);
      if (due !== null && ctx.now + ELAPSE_TOLERANCE_MS < due) return this.syncFor(ctx, rec);

      const tab = await this.tabs.get(tabId);
      if (!tab || !tab.active) {
        await this.stop(ctx, rec);
        await this.commit(ctx);
        return this.syncFor(ctx, rec);
      }
      if (!this.matchesRecord(ctx, rec, tab.url || rec.url)) {
        delete ctx.tabs[k];
        await this.commit(ctx);
        return { mode: 'idle' };
      }

      const esc = await this.escalation(ctx);
      await this.store.setEscalation({ count: esc.count + 1, periodKey: esc.periodKey });
      rec.phase = 'appeared';
      rec.appearedAt = ctx.now;
      rec.resumedAt = null;
      rec.snoozedUntil = null;
      rec.level = esc.level;

      await this.store.setStats(bumpDay(await this.store.getStats(), ctx.now, 'intercepted'));
      await this.store.setFocusSession({
        ...ctx.session,
        intercepted: ctx.session.intercepted + 1,
      });

      if (source === 'backup') this.push(ctx, rec, tabId);
      await this.commit(ctx);
      return this.syncFor(ctx, rec);
    });
  }

  /** The character reached the exit and the cancel window passed (or the user clicked Close). */
  requestClose(
    tabId: number,
    trigger: 'auto' | 'manual',
    hasUnsavedInput: boolean,
  ): Promise<CloseResult> {
    return this.serial(async () => {
      const ctx = await this.load();
      const k = key(tabId);
      const rec = ctx.tabs[k];
      const tab = await this.tabs.get(tabId);
      const verdict = verifyClosable({
        tab,
        record: rec,
        settings: ctx.settings,
        paused: ctx.pause !== null,
        trigger,
        hasUnsavedInput,
        now: ctx.now,
      });
      if (!verdict.ok) {
        if (verdict.reason === 'auto-close-off') {
          await this.store.setStats(bumpDay(await this.store.getStats(), ctx.now, 'reminders'));
        }
        return verdict;
      }
      const t = tab as TabInfo;
      const site = rec ? this.site(ctx, rec) : undefined;
      const closed: LastClosedTab = {
        url: t.url,
        title: t.title,
        siteName: site?.name ?? '',
        windowId: t.windowId,
        index: t.index,
        closedAt: ctx.now,
      };
      await this.store.setLastClosed(closed);
      await this.store.setStats(bumpDay(await this.store.getStats(), ctx.now, 'closed'));
      delete ctx.tabs[k];
      await this.commit(ctx);
      await this.tabs.remove(tabId);
      return { ok: true };
    });
  }

  /** "Not now": the character leaves and won't come back to this tab for SNOOZE_MS. */
  snoozeTab(tabId: number): Promise<TabSync> {
    return this.serial(async () => {
      const ctx = await this.load();
      const rec = ctx.tabs[key(tabId)];
      if (!rec) return { mode: 'idle' };
      await this.snoozeRecord(ctx, rec);
      await this.store.setStats(bumpDay(await this.store.getStats(), ctx.now, 'snoozed'));
      await this.commit(ctx);
      return this.syncFor(ctx, rec);
    });
  }

  private async snoozeRecord(ctx: Ctx, rec: TabRecord): Promise<void> {
    const site = this.site(ctx, rec);
    rec.level = (await this.escalation(ctx)).level;
    rec.phase = 'waiting';
    rec.resumedAt = null;
    rec.appearedAt = null;
    rec.snoozedUntil = ctx.now + SNOOZE_MS;
    if (site) rec.remainingMs = this.fullDelay(ctx, site, rec.level);
    const tab = await this.tabs.get(rec.tabId);
    if (tab?.active && ctx.watching) this.start(ctx, rec);
  }

  // ---------------------------------------------------------------------------
  // User controls (popup / settings / keyboard shortcuts)

  /** Re-evaluate every tracked tab (settings changed, pause ended, ...). */
  resyncAll(): Promise<void> {
    return this.serial(async () => {
      const ctx = await this.load();
      await this.resyncInner(ctx);
      await this.commit(ctx);
    });
  }

  private async resyncInner(ctx: Ctx): Promise<void> {
    for (const rec of Object.values(ctx.tabs)) {
      const tab = await this.tabs.get(rec.tabId);
      if (!tab) {
        delete ctx.tabs[key(rec.tabId)];
        continue;
      }
      if (!this.matchesRecord(ctx, rec, tab.url || rec.url)) {
        delete ctx.tabs[key(rec.tabId)];
        ctx.outbox.set(rec.tabId, { mode: 'idle' });
        continue;
      }
      if (!ctx.watching) {
        if (rec.phase !== 'waiting') await this.stop(ctx, rec);
      } else if (tab.active) {
        this.start(ctx, rec);
      }
      this.push(ctx, rec, rec.tabId);
    }
  }

  pause(mode: PauseMode): Promise<StatusSnapshot> {
    return this.serial(async () => {
      const now = this.clock.now();
      const pause: PauseState = {
        mode,
        startedAt: now,
        until: mode === '15m' || mode === '1h' ? now + PAUSE_DURATIONS_MS[mode] : null,
      };
      if (mode === 'session') {
        await this.store.setSessionPause(pause);
      } else {
        await this.store.setPause(pause);
      }
      const ctx = await this.load();
      await this.resyncInner(ctx);
      await this.commit(ctx);
      this.deps.onPauseChanged?.(pause);
      return this.statusInner(ctx);
    });
  }

  /** Big red button: stop every character right now and stay stopped until resumed. */
  emergencyStop(): Promise<StatusSnapshot> {
    return this.pause('indefinite');
  }

  /** Pause for the user's default duration (quick-pause shortcut). */
  async quickPause(): Promise<StatusSnapshot> {
    const settings = await this.store.getSettings();
    return this.pause(settings.defaultPause);
  }

  resume(): Promise<StatusSnapshot> {
    return this.serial(async () => {
      const now = this.clock.now();
      const wasPaused = (await this.store.getPause()) ?? (await this.store.getSessionPause());
      await this.store.setPause(null);
      await this.store.setSessionPause(null);
      if (wasPaused) await this.startFocusSession(now);
      const ctx = await this.load();
      await this.resyncInner(ctx);
      await this.commit(ctx);
      this.deps.onPauseChanged?.(null);
      return this.statusInner(ctx);
    });
  }

  setEnabled(enabled: boolean): Promise<StatusSnapshot> {
    return this.updateSettings((s) => ({ ...s, enabled }));
  }

  setAutoClose(autoClose: boolean): Promise<StatusSnapshot> {
    return this.updateSettings((s) => ({ ...s, autoClose }));
  }

  private updateSettings(update: (s: Settings) => Settings): Promise<StatusSnapshot> {
    return this.serial(async () => {
      await this.store.updateSettings(update);
      const ctx = await this.load();
      await this.resyncInner(ctx);
      await this.commit(ctx);
      this.deps.onPauseChanged?.(ctx.pause);
      return this.statusInner(ctx);
    });
  }

  /** Cancel the approach in the active tab (from the popup). */
  cancelActive(): Promise<StatusSnapshot> {
    return this.serial(async () => {
      const ctx = await this.load();
      const active = await this.tabs.getActiveTab();
      const rec = active ? ctx.tabs[key(active.id)] : undefined;
      if (rec) {
        await this.snoozeRecord(ctx, rec);
        await this.store.setStats(bumpDay(await this.store.getStats(), ctx.now, 'snoozed'));
        this.push(ctx, rec, rec.tabId);
      }
      await this.commit(ctx);
      return this.statusInner(ctx);
    });
  }

  /** Undo: reopen the last tab Tablin closed, with a grace period so it isn't closed again. */
  reopenLast(): Promise<{ reopened: boolean; tab: LastClosedTab | null }> {
    return this.serial(async () => {
      const now = this.clock.now();
      const last = await this.store.getLastClosed();
      if (!last || now - last.closedAt > REOPEN_WINDOW_MS) return { reopened: false, tab: null };
      const created = await this.tabs.create({
        url: last.url,
        windowId: last.windowId,
        index: last.index,
      });
      if (created) {
        const grace = await this.store.getGrace();
        grace[key(created.id)] = now + SNOOZE_MS;
        await this.store.setGrace(grace);
      }
      await this.store.setLastClosed(null);
      return { reopened: created !== null, tab: last };
    });
  }

  resetStats(): Promise<StatusSnapshot> {
    return this.serial(async () => {
      await this.store.resetStats();
      const ctx = await this.load();
      return this.statusInner(ctx);
    });
  }

  status(): Promise<StatusSnapshot> {
    return this.serial(async () => this.statusInner(await this.load()));
  }

  private async statusInner(ctx: Ctx): Promise<StatusSnapshot> {
    const [stats, last, esc, active] = await Promise.all([
      this.store.getStats(),
      this.store.getLastClosed(),
      this.escalation(ctx),
      this.tabs.getActiveTab(),
    ]);
    const rec = active ? ctx.tabs[key(active.id)] : undefined;
    const site = rec ? this.site(ctx, rec) : undefined;
    const { behavior } = ctx.settings;
    return {
      enabled: ctx.settings.enabled,
      autoClose: ctx.settings.autoClose,
      onboardingComplete: ctx.settings.onboardingComplete,
      defaultPause: ctx.settings.defaultPause,
      pause: ctx.pause,
      today: todayStats(stats, ctx.now),
      streak: computeStreak(stats, ctx.now),
      totalFocusSessions: stats.totalFocusSessions,
      session: ctx.session,
      escalation: {
        enabled: behavior.escalationEnabled,
        count: esc.count,
        nextLevel: esc.level,
        nextSpeedMultiplier: speedMultiplierForLevel(esc.level, behavior),
        resetFrequency: behavior.resetFrequency,
      },
      activeTab: rec && site ? { siteName: site.name, phase: rec.phase, dueAt: dueAt(rec) } : null,
      lastClosed: last && ctx.now - last.closedAt <= REOPEN_WINDOW_MS ? last : null,
      character: ctx.settings.character,
    };
  }
}

/** When the character is due to appear, or null if not counting. */
export function dueAt(rec: TabRecord): number | null {
  if (rec.resumedAt === null) return null;
  return Math.max(rec.resumedAt + rec.remainingMs, rec.snoozedUntil ?? 0);
}
