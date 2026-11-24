import { validateSettings } from './settings';
import { emptyStats, validateStats } from './stats';
import type {
  EscalationState,
  FocusSession,
  LastClosedTab,
  PauseState,
  Settings,
  Stats,
  TabRecord,
} from './types';

/** The subset of chrome.storage.StorageArea Tablin uses; trivially fakeable in tests. */
export interface KeyValueArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** chrome.storage.local — survives browser restarts. */
export const LOCAL_KEYS = {
  settings: 'settings',
  stats: 'stats',
  pause: 'pause',
  escalation: 'escalation',
  lastClosed: 'lastClosed',
} as const;

/** chrome.storage.session — survives worker suspension, cleared when the browser quits. */
export const SESSION_KEYS = {
  tabs: 'tabs',
  focusSession: 'focusSession',
  sessionPause: 'sessionPause',
  grace: 'grace',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function validatePause(raw: unknown): PauseState | null {
  if (!isObj(raw)) return null;
  const { mode, startedAt, until } = raw;
  if (mode !== '15m' && mode !== '1h' && mode !== 'session' && mode !== 'indefinite') return null;
  if (typeof startedAt !== 'number') return null;
  if (until !== null && typeof until !== 'number') return null;
  return { mode, startedAt, until };
}

function validateTabs(raw: unknown): Record<string, TabRecord> {
  if (!isObj(raw)) return {};
  const out: Record<string, TabRecord> = {};
  for (const [key, rec] of Object.entries(raw)) {
    if (isObj(rec) && typeof rec.tabId === 'number' && typeof rec.url === 'string') {
      out[key] = rec as unknown as TabRecord;
    }
  }
  return out;
}

/** Typed, validated access to everything Tablin persists. */
export class TablinStore {
  constructor(
    private readonly local: KeyValueArea,
    private readonly session: KeyValueArea,
  ) {}

  private async getOne(area: KeyValueArea, key: string): Promise<unknown> {
    const result = await area.get([key]);
    return result[key];
  }

  async getSettings(): Promise<Settings> {
    return validateSettings(await this.getOne(this.local, LOCAL_KEYS.settings));
  }

  async setSettings(settings: Settings): Promise<Settings> {
    const valid = validateSettings(settings);
    await this.local.set({ [LOCAL_KEYS.settings]: valid });
    return valid;
  }

  async updateSettings(update: (s: Settings) => Settings): Promise<Settings> {
    return this.setSettings(update(await this.getSettings()));
  }

  async getStats(): Promise<Stats> {
    return validateStats(await this.getOne(this.local, LOCAL_KEYS.stats));
  }

  async setStats(stats: Stats): Promise<void> {
    await this.local.set({ [LOCAL_KEYS.stats]: stats });
  }

  async resetStats(): Promise<void> {
    await this.local.set({ [LOCAL_KEYS.stats]: emptyStats() });
    await this.local.remove([LOCAL_KEYS.escalation]);
  }

  async getPause(): Promise<PauseState | null> {
    return validatePause(await this.getOne(this.local, LOCAL_KEYS.pause));
  }

  async setPause(pause: PauseState | null): Promise<void> {
    if (pause) await this.local.set({ [LOCAL_KEYS.pause]: pause });
    else await this.local.remove([LOCAL_KEYS.pause]);
  }

  async getSessionPause(): Promise<PauseState | null> {
    return validatePause(await this.getOne(this.session, SESSION_KEYS.sessionPause));
  }

  async setSessionPause(pause: PauseState | null): Promise<void> {
    if (pause) await this.session.set({ [SESSION_KEYS.sessionPause]: pause });
    else await this.session.remove([SESSION_KEYS.sessionPause]);
  }

  async getEscalation(): Promise<EscalationState> {
    const raw = await this.getOne(this.local, LOCAL_KEYS.escalation);
    if (isObj(raw) && typeof raw.count === 'number' && typeof raw.periodKey === 'string') {
      return { count: Math.max(0, Math.floor(raw.count)), periodKey: raw.periodKey };
    }
    return { count: 0, periodKey: '' };
  }

  async setEscalation(state: EscalationState): Promise<void> {
    await this.local.set({ [LOCAL_KEYS.escalation]: state });
  }

  async getLastClosed(): Promise<LastClosedTab | null> {
    const raw = await this.getOne(this.local, LOCAL_KEYS.lastClosed);
    return isObj(raw) && typeof raw.url === 'string' && typeof raw.closedAt === 'number'
      ? (raw as unknown as LastClosedTab)
      : null;
  }

  async setLastClosed(tab: LastClosedTab | null): Promise<void> {
    if (tab) await this.local.set({ [LOCAL_KEYS.lastClosed]: tab });
    else await this.local.remove([LOCAL_KEYS.lastClosed]);
  }

  async getTabs(): Promise<Record<string, TabRecord>> {
    return validateTabs(await this.getOne(this.session, SESSION_KEYS.tabs));
  }

  async setTabs(tabs: Record<string, TabRecord>): Promise<void> {
    await this.session.set({ [SESSION_KEYS.tabs]: tabs });
  }

  async getFocusSession(): Promise<FocusSession | null> {
    const raw = await this.getOne(this.session, SESSION_KEYS.focusSession);
    return isObj(raw) && typeof raw.id === 'string' && typeof raw.startedAt === 'number'
      ? (raw as unknown as FocusSession)
      : null;
  }

  async setFocusSession(session: FocusSession): Promise<void> {
    await this.session.set({ [SESSION_KEYS.focusSession]: session });
  }

  /** Tabs reopened via "undo" get a grace period: tabId → epoch ms. */
  async getGrace(): Promise<Record<string, number>> {
    const raw = await this.getOne(this.session, SESSION_KEYS.grace);
    if (!isObj(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number'),
    );
  }

  async setGrace(grace: Record<string, number>): Promise<void> {
    await this.session.set({ [SESSION_KEYS.grace]: grace });
  }
}

/** Adapts a chrome.storage area to KeyValueArea. */
export function chromeArea(area: chrome.storage.StorageArea): KeyValueArea {
  return {
    get: (keys) => area.get(keys) as Promise<Record<string, unknown>>,
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

/** Settings helpers for extension pages (popup/options), which can't touch session storage. */
export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get([LOCAL_KEYS.settings]);
  return validateSettings(raw[LOCAL_KEYS.settings]);
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const valid = validateSettings(settings);
  await chrome.storage.local.set({ [LOCAL_KEYS.settings]: valid });
  return valid;
}

export async function loadStats(): Promise<Stats> {
  const raw = await chrome.storage.local.get([LOCAL_KEYS.stats]);
  return validateStats(raw[LOCAL_KEYS.stats]);
}
