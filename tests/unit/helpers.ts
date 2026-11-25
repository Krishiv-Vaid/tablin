import { DistractionManager } from '../../src/background/distraction-manager';
import type { TabInfo, TabsPort } from '../../src/background/tab-manager';
import { defaultSettings } from '../../src/shared/settings';
import { TablinStore, type KeyValueArea } from '../../src/shared/storage';
import type { Settings } from '../../src/shared/types';

/** In-memory chrome.storage area; values are cloned like the real thing. */
export class MemoryArea implements KeyValueArea {
  data = new Map<string, unknown>();
  async get(keys: string[]) {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    return out;
  }
  async set(items: Record<string, unknown>) {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }
  async remove(keys: string[]) {
    for (const k of keys) this.data.delete(k);
  }
}

export class FakeTabs implements TabsPort {
  tabs = new Map<number, TabInfo>();
  removed: number[] = [];
  created: { url: string; windowId?: number; index?: number }[] = [];
  sent: { tabId: number; message: unknown }[] = [];
  private nextId = 1000;

  add(partial: Partial<TabInfo> & { id: number; url: string }): TabInfo {
    const tab: TabInfo = {
      windowId: 1,
      index: this.tabs.size,
      title: 'Tab',
      active: false,
      pinned: false,
      audible: false,
      ...partial,
    };
    this.tabs.set(tab.id, tab);
    return tab;
  }

  /** Makes `id` the active tab of its window (others in that window become inactive). */
  activate(id: number) {
    const tab = this.tabs.get(id)!;
    for (const t of this.tabs.values()) if (t.windowId === tab.windowId) t.active = t.id === id;
  }

  async get(tabId: number) {
    const t = this.tabs.get(tabId);
    return t ? { ...t } : null;
  }
  async getActiveTab() {
    const t = [...this.tabs.values()].find((x) => x.active && x.windowId === 1);
    return t ? { ...t } : null;
  }
  async remove(tabId: number) {
    this.removed.push(tabId);
    this.tabs.delete(tabId);
  }
  async create(props: { url: string; windowId?: number; index?: number }) {
    this.created.push(props);
    return this.add({
      id: this.nextId++,
      url: props.url,
      windowId: props.windowId ?? 1,
      active: true,
    });
  }
  async send(tabId: number, message: unknown) {
    this.sent.push({ tabId, message });
  }
  lastSync(tabId: number) {
    const msgs = this.sent.filter((s) => s.tabId === tabId);
    return (msgs[msgs.length - 1]?.message as { sync?: unknown } | undefined)?.sync;
  }
}

export class TestClock {
  constructor(public t = new Date(2026, 10, 24, 10, 0, 0).getTime()) {}
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

export interface Harness {
  local: MemoryArea;
  session: MemoryArea;
  store: TablinStore;
  tabs: FakeTabs;
  clock: TestClock;
  manager: DistractionManager;
  /** A fresh manager over the same storage: simulates service-worker suspension. */
  restart(): DistractionManager;
}

let ids = 0;

export async function harness(patch: (s: Settings) => Settings = (s) => s): Promise<Harness> {
  const local = new MemoryArea();
  const session = new MemoryArea();
  const store = new TablinStore(local, session);
  await store.setSettings(patch({ ...defaultSettings(), onboardingComplete: true }));
  const tabs = new FakeTabs();
  const clock = new TestClock();
  const make = () => new DistractionManager({ store, tabs, clock, newId: () => `id-${++ids}` });
  const h: Harness = {
    local,
    session,
    store,
    tabs,
    clock,
    manager: make(),
    restart() {
      h.manager = make();
      return h.manager;
    },
  };
  return h;
}

export const YT = 'https://www.youtube.com/watch?v=abc';
export const REDDIT = 'https://www.reddit.com/r/all';
export const DOCS = 'https://docs.google.com/document/d/1';

import { FocusManager } from '../../src/background/focus-manager';
import { Serial } from '../../src/background/serial';
import type { FocusHistoryEntry, UnlockEvent } from '../../src/shared/types';

export interface FocusHarness extends Harness {
  focus: FocusManager;
  serial: Serial;
  ended: { entry: FocusHistoryEntry; unlocks: UnlockEvent[] }[];
  alarms: (number | null)[];
  restartFocus(): FocusManager;
}

/** Harness with distraction + focus managers sharing one lock, like the real worker. */
export async function focusHarness(
  patch: (s: Settings) => Settings = (s) => s,
): Promise<FocusHarness> {
  const base = await harness(patch);
  const serial = new Serial();
  const ended: FocusHarness['ended'] = [];
  const alarms: (number | null)[] = [];
  let n = 0;
  const makeFocus = () =>
    new FocusManager({
      store: base.store,
      clock: base.clock,
      serial,
      newId: () => `focus-${++n}`,
      scheduleEnd: (t) => alarms.push(t),
      onSessionEnd: (entry, unlocks) => ended.push({ entry, unlocks }),
    });
  const makeDistraction = () =>
    new DistractionManager({
      store: base.store,
      tabs: base.tabs,
      clock: base.clock,
      serial,
      newId: () => `w-${++n}`,
    });
  const h: FocusHarness = {
    ...base,
    serial,
    ended,
    alarms,
    focus: makeFocus(),
    manager: makeDistraction(),
    restart() {
      h.manager = makeDistraction();
      return h.manager;
    },
    restartFocus() {
      h.focus = makeFocus();
      return h.focus;
    },
  };
  return h;
}

export const MIN = 60_000;
