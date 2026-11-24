import { MIN_APPEAR_TO_CLOSE_MS } from '../shared/constants';
import { matchSite } from '../detection/website-detector';
import type { CloseResult, Settings, TabRecord } from '../shared/types';

/** The tab facts Tablin relies on. */
export interface TabInfo {
  id: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
}

/** Everything the worker does with tabs, behind an interface so it can be faked in tests. */
export interface TabsPort {
  get(tabId: number): Promise<TabInfo | null>;
  getActiveTab(): Promise<TabInfo | null>;
  remove(tabId: number): Promise<void>;
  create(props: { url: string; windowId?: number; index?: number }): Promise<TabInfo | null>;
  send(tabId: number, message: unknown): Promise<void>;
}

export interface CloseContext {
  tab: TabInfo | null;
  record: TabRecord | undefined;
  settings: Settings;
  paused: boolean;
  trigger: 'auto' | 'manual';
  hasUnsavedInput: boolean;
  now: number;
}

/**
 * The final safety gate before chrome.tabs.remove. Every condition is re-checked
 * against the tab's *current* state; a timer having fired is never enough.
 */
export function verifyClosable(ctx: CloseContext): CloseResult {
  const { tab, record, settings, now } = ctx;
  const fail = (reason: Extract<CloseResult, { ok: false }>['reason']): CloseResult => ({
    ok: false,
    reason,
  });

  if (!settings.enabled) return fail('disabled');
  if (ctx.paused) return fail('paused');
  if (ctx.trigger === 'auto' && !settings.autoClose) return fail('auto-close-off');
  if (!record) return fail('not-tracked');
  if (record.phase !== 'appeared' || record.appearedAt === null) return fail('not-approaching');
  if (ctx.trigger === 'auto' && now - record.appearedAt < MIN_APPEAR_TO_CLOSE_MS)
    return fail('too-soon');
  if (record.snoozedUntil !== null && record.snoozedUntil > now) return fail('snoozed');
  if (!tab) return fail('tab-missing');
  if (!tab.active) return fail('inactive');
  const site = matchSite(tab.url, settings.sites);
  if (!site || site.id !== record.siteId) return fail('url-mismatch');
  if (tab.pinned) return fail('pinned');
  if (tab.audible && settings.behavior.protectAudible) return fail('audible');
  if (ctx.hasUnsavedInput) return fail('unsaved-input');
  return { ok: true };
}

function toTabInfo(tab: chrome.tabs.Tab | undefined): TabInfo | null {
  if (!tab || typeof tab.id !== 'number' || tab.id < 0) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url ?? tab.pendingUrl ?? '',
    title: tab.title ?? '',
    active: tab.active,
    pinned: tab.pinned,
    audible: tab.audible ?? false,
  };
}

/** Real implementation backed by chrome.tabs. */
export function createChromeTabsPort(): TabsPort {
  return {
    async get(tabId) {
      try {
        return toTabInfo(await chrome.tabs.get(tabId));
      } catch {
        return null; // tab no longer exists
      }
    },
    async getActiveTab() {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return toTabInfo(tab);
    },
    async remove(tabId) {
      await chrome.tabs.remove(tabId);
    },
    async create({ url, windowId, index }) {
      try {
        return toTabInfo(await chrome.tabs.create({ url, windowId, index, active: true }));
      } catch {
        // The original window may be gone; fall back to the current window.
        return toTabInfo(await chrome.tabs.create({ url, active: true }));
      }
    },
    async send(tabId, message) {
      try {
        await chrome.tabs.sendMessage(tabId, message);
      } catch {
        // No content script listening (page navigated, still loading, or restricted). Fine.
      }
    },
  };
}
