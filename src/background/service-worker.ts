/**
 * Tablin background service worker (Manifest V3).
 *
 * All listeners are registered synchronously at top level so Chrome can wake the
 * worker for any of them. No state lives here: the managers persist everything
 * to chrome.storage, so suspension at any moment is safe. Every entry point first
 * awaits the storage migration so old data is upgraded before anything reads it.
 */
import { ACHIEVEMENTS_BY_ID } from '../shared/achievements';
import {
  ALARM_FOCUS_END,
  ALARM_FOCUS_TICK,
  ALARM_PAUSE_END,
  CUSTOM_SCRIPT_ID,
} from '../shared/constants';
import { COSMETICS_BY_ID, equip } from '../shared/cosmetics';
import {
  createRouter,
  type Handlers,
  type ProgressSnapshot,
  type SenderInfo,
} from '../shared/messages';
import { migrateStorage } from '../shared/migrations';
import { chromeArea, LOCAL_KEYS, TablinStore } from '../shared/storage';
import type { FocusHistoryEntry, PauseState, Settings, UnlockEvent } from '../shared/types';
import { matchPatternsFor } from '../detection/website-detector';
import { DistractionManager } from './distraction-manager';
import { FocusManager } from './focus-manager';
import { completionMessage } from '../shared/focus-messages';
import { Serial } from './serial';
import { createChromeTabsPort } from './tab-manager';

const local = chromeArea(chrome.storage.local);
const session = chromeArea(chrome.storage.session);
const store = new TablinStore(local, session);
const tabs = createChromeTabsPort();
const serial = new Serial();

/** Upgrade stored data (idempotent) before anything else touches it. */
const ready: Promise<unknown> = migrateStorage(local, session).catch((error: unknown) => {
  console.error('Tablin migration failed', error);
});

// In-memory backup timers. If the worker is suspended these are lost, which is fine:
// persisted timestamps plus alarms / content-script timers cover it.
const backups = new Map<number, ReturnType<typeof setTimeout>>();
function scheduleBackup(tabId: number, due: number | null): void {
  const existing = backups.get(tabId);
  if (existing) clearTimeout(existing);
  backups.delete(tabId);
  if (due === null) return;
  const delay = Math.max(0, due - Date.now()) + 400;
  if (delay > 120_000) return;
  backups.set(
    tabId,
    setTimeout(() => {
      backups.delete(tabId);
      void distraction.handleCountdownElapsed(tabId, 'backup');
    }, delay),
  );
}

const distraction = new DistractionManager({
  store,
  tabs,
  serial,
  scheduleBackup,
  onPauseChanged: (pause) => void onPauseChanged(pause),
});

let focusBackup: ReturnType<typeof setTimeout> | undefined;
const focus = new FocusManager({
  store,
  serial,
  scheduleEnd: (endsAt) => void scheduleFocusEnd(endsAt),
  onSessionEnd: (entry, unlocks) => void notifySessionEnd(entry, unlocks),
  onChange: () => {
    // Breaks may relax interception; cosmetics/messages may change.
    void distraction.resyncAll().then(updateBadge);
  },
});

async function scheduleFocusEnd(endsAt: number | null): Promise<void> {
  clearTimeout(focusBackup);
  await chrome.alarms.clear(ALARM_FOCUS_END);
  await chrome.alarms.clear(ALARM_FOCUS_TICK);
  if (endsAt === null) return;
  await chrome.alarms.create(ALARM_FOCUS_END, { when: Math.max(endsAt, Date.now() + 1000) });
  await chrome.alarms.create(ALARM_FOCUS_TICK, { periodInMinutes: 1 });
  // Alarms can fire up to ~30 s late; a backup timer gives precise completion while awake.
  const delay = endsAt - Date.now() + 250;
  if (delay < 5 * 60_000) focusBackup = setTimeout(() => void focus.tick(), Math.max(0, delay));
}

async function onPauseChanged(pause: PauseState | null): Promise<void> {
  await chrome.alarms.clear(ALARM_PAUSE_END);
  if (pause?.until) await chrome.alarms.create(ALARM_PAUSE_END, { when: pause.until });
  await updateBadge();
}

async function updateBadge(): Promise<void> {
  const status = await distraction.status();
  let text = !status.enabled ? 'off' : status.pause ? 'zz' : '';
  let color = '#3B3631';
  if (status.focus) {
    const minutes = Math.ceil(status.focus.remainingMs / 60_000);
    text = status.focus.status === 'paused' ? '❚❚' : `${minutes}m`;
    color = status.focus.kind === 'focus' ? '#E8772A' : '#3F7D4E';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
}

async function notifySessionEnd(entry: FocusHistoryEntry, unlocks: UnlockEvent[]): Promise<void> {
  if (entry.outcome !== 'completed') return;
  const settings = await store.getSettings();
  if (!settings.focus.notifications) return;
  // `notifications` is an optional permission, granted only when the user opts in.
  if (!(await chrome.permissions.contains({ permissions: ['notifications'] }))) return;
  const name = settings.character.name;
  const minutes = Math.round(entry.focusedMs / 60_000);
  let title: string;
  let message: string;
  if (entry.kind === 'focus') {
    title = completionMessage(entry.id, minutes, name);
    message = `${minutes} minutes of focus done. Time for a break?`;
  } else {
    title = 'Break is over';
    message = `${name} is ready when you are.`;
  }
  const earned = unlocks
    .map((u) => {
      const a = ACHIEVEMENTS_BY_ID.get(u.achievementId)?.name;
      const r = u.rewardId ? COSMETICS_BY_ID.get(u.rewardId)?.name : null;
      return a ? (r ? `${a} (unlocked ${r})` : a) : null;
    })
    .filter(Boolean);
  if (earned.length) message += ` Achievement: ${earned.join(', ')}!`;
  try {
    await chrome.notifications.create(`tablin-focus-${entry.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      priority: 0,
    });
  } catch {
    // Notifications disabled at the OS level; the popup still celebrates.
  }
}

async function progressSnapshot(): Promise<ProgressSnapshot> {
  const [achievements, inventory, unseen, stats] = await Promise.all([
    store.getAchievements(),
    store.getInventory(),
    store.getUnseenUnlocks(),
    store.getStats(),
  ]);
  return { now: Date.now(), achievements, inventory, unseen, stats };
}

// ---------------------------------------------------------------------------
// Messaging

const handlers: Handlers = {
  PAGE_READY: (msg, s) => distraction.handlePageReady(s.tabId!, msg.url),
  VISIBILITY_CHANGED: (msg, s) => distraction.handleVisibility(s.tabId!, msg.visible),
  COUNTDOWN_ELAPSED: (_msg, s) => distraction.handleCountdownElapsed(s.tabId!, 'content'),
  REQUEST_CLOSE: (msg, s) => distraction.requestClose(s.tabId!, msg.trigger, msg.hasUnsavedInput),
  SNOOZE_TAB: (_msg, s) => distraction.snoozeTab(s.tabId!),
  GET_STATUS: () => distraction.status(),
  SET_ENABLED: (msg) => distraction.setEnabled(msg.enabled),
  SET_AUTO_CLOSE: (msg) => distraction.setAutoClose(msg.enabled),
  PAUSE: (msg) => distraction.pause(msg.mode),
  RESUME: () => distraction.resume(),
  EMERGENCY_STOP: () => distraction.emergencyStop(),
  CANCEL_ACTIVE: () => distraction.cancelActive(),
  REOPEN_LAST: () => distraction.reopenLast(),
  RESET_STATS: () => distraction.resetStats(),
  FOCUS_GET: () => focus.snapshot(),
  FOCUS_START: (msg) => focus.start(msg.kind, msg.minutes),
  FOCUS_PAUSE: () => focus.pause(),
  FOCUS_RESUME: () => focus.resume(),
  FOCUS_END: () => focus.end(),
  FOCUS_ACK: () => focus.acknowledge(),
  PROGRESS_GET: () => serial.run(progressSnapshot),
  EQUIP: (msg) =>
    serial.run(async () => {
      const result = equip(await store.getInventory(), msg.slot, msg.id);
      if (result.ok) await store.setInventory(result.inventory);
      return result;
    }),
  ACK_UNLOCKS: () =>
    serial.run(async () => {
      await store.setUnseenUnlocks([]);
      return progressSnapshot();
    }),
};
const route = createRouter(handlers);
const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const info: SenderInfo = {
    tabId: sender.tab?.id,
    windowId: sender.tab?.windowId,
    url: sender.url,
    isExtensionPage:
      sender.origin === extensionOrigin || (sender.url ?? '').startsWith(extensionOrigin),
  };
  ready
    .then(() => route(message, info))
    .then(
      (result) => sendResponse(result),
      (error: unknown) =>
        sendResponse({ error: error instanceof Error ? error.message : String(error) }),
    );
  return true; // async response
});

const after = (fn: () => unknown) => void ready.then(fn);

// ---------------------------------------------------------------------------
// Tab events

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  after(() => distraction.handleActivated(tabId, windowId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) after(() => distraction.handleUrlChanged(tabId, changeInfo.url!));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  after(() => distraction.handleRemoved(tabId));
});

chrome.tabs.onReplaced.addListener((_added, removed) => {
  after(() => distraction.handleRemoved(removed));
});

// ---------------------------------------------------------------------------
// Settings, alarms, shortcuts, notifications, lifecycle

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[LOCAL_KEYS.settings] || changes[LOCAL_KEYS.inventory]) {
    after(() => distraction.resyncAll());
    after(updateBadge);
  }
  if (changes[LOCAL_KEYS.settings]) after(syncCustomContentScripts);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_PAUSE_END) after(() => distraction.resyncAll().then(updateBadge));
  if (alarm.name === ALARM_FOCUS_END) after(() => focus.tick());
  if (alarm.name === ALARM_FOCUS_TICK) after(() => focus.tick().then(updateBadge));
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'emergency-stop') after(() => distraction.emergencyStop());
  if (command === 'reopen-last') after(() => distraction.reopenLast());
  if (command === 'quick-pause') after(() => distraction.quickPause());
});

// The notifications API only exists once its optional permission is granted.
let notificationClicksWired = false;
function wireNotificationClicks(): void {
  if (notificationClicksWired || !chrome.notifications) return;
  notificationClicksWired = true;
  chrome.notifications.onClicked.addListener((id) => {
    if (!id.startsWith('tablin-focus-')) return;
    void chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html#focus') });
    void chrome.notifications.clear(id);
  });
}
wireNotificationClicks();

chrome.runtime.onInstalled.addListener((details) => {
  after(async () => {
    // Persist validated settings (the migration already upgraded v1 data).
    const settings = await store.setSettings(await store.getSettings());
    await syncCustomContentScripts();
    await injectIntoOpenTabs(settings);
    await focus.tick(); // re-arm alarms for a session that was running during the update
    await updateBadge();
    if (details.reason === 'install') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html#welcome') });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  after(syncCustomContentScripts);
  after(() => focus.tick());
  after(updateBadge);
});

/**
 * Tabs that were already open when Tablin was installed don't have the content
 * script yet. Inject it so they behave like freshly opened pages.
 */
async function injectIntoOpenTabs(settings: Settings): Promise<void> {
  const patterns = settings.sites
    .filter((s) => s.builtIn)
    .flatMap((s) => s.domains.flatMap(matchPatternsFor));
  const open = await chrome.tabs.query({ url: patterns });
  await Promise.all(
    open.map((tab) =>
      tab.id === undefined
        ? undefined
        : chrome.scripting
            .executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] })
            .catch(() => undefined),
    ),
  );
}

/**
 * Custom sites are covered by optional host permissions the user grants from the
 * settings page. Register one dynamic content script covering all of them.
 */
async function syncCustomContentScripts(): Promise<void> {
  const settings = await store.getSettings();
  const custom = settings.sites.filter((s) => !s.builtIn);
  const granted: string[] = [];
  for (const site of custom) {
    const origins = site.domains.flatMap(matchPatternsFor);
    if (await chrome.permissions.contains({ origins })) granted.push(...origins);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
  if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
  }
  if (granted.length === 0) return;
  await chrome.scripting.registerContentScripts([
    {
      id: CUSTOM_SCRIPT_ID,
      matches: granted,
      js: ['content-script.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

chrome.permissions.onRemoved.addListener(() => after(syncCustomContentScripts));
chrome.permissions.onAdded.addListener(() => {
  wireNotificationClicks();
  after(syncCustomContentScripts);
});
