/**
 * Tablin background service worker (Manifest V3).
 *
 * All listeners are registered synchronously at top level so Chrome can wake the
 * worker for any of them. No state lives here: DistractionManager persists
 * everything to chrome.storage, so suspension at any moment is safe.
 */
import { ALARM_PAUSE_END, CUSTOM_SCRIPT_ID } from '../shared/constants';
import { createRouter, type Handlers, type SenderInfo } from '../shared/messages';
import { chromeArea, LOCAL_KEYS, TablinStore } from '../shared/storage';
import type { PauseState, Settings } from '../shared/types';
import { matchPatternsFor } from '../detection/website-detector';
import { DistractionManager } from './distraction-manager';
import { createChromeTabsPort } from './tab-manager';

const store = new TablinStore(chromeArea(chrome.storage.local), chromeArea(chrome.storage.session));
const tabs = createChromeTabsPort();

// In-memory backup timers. If the worker is suspended these are lost, which is fine:
// the content script's own timer and the persisted dueAt cover it.
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
      void manager.handleCountdownElapsed(tabId, 'backup');
    }, delay),
  );
}

const manager = new DistractionManager({
  store,
  tabs,
  scheduleBackup,
  onPauseChanged: (pause) => void onPauseChanged(pause),
});

async function onPauseChanged(pause: PauseState | null): Promise<void> {
  await chrome.alarms.clear(ALARM_PAUSE_END);
  if (pause?.until) await chrome.alarms.create(ALARM_PAUSE_END, { when: pause.until });
  await updateBadge();
}

async function updateBadge(): Promise<void> {
  const status = await manager.status();
  const text = !status.enabled ? 'off' : status.pause ? 'zz' : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#3B3631' });
  await chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
}

// ---------------------------------------------------------------------------
// Messaging

const handlers: Handlers = {
  PAGE_READY: (msg, s) => manager.handlePageReady(s.tabId!, msg.url),
  VISIBILITY_CHANGED: (msg, s) => manager.handleVisibility(s.tabId!, msg.visible),
  COUNTDOWN_ELAPSED: (_msg, s) => manager.handleCountdownElapsed(s.tabId!, 'content'),
  REQUEST_CLOSE: (msg, s) => manager.requestClose(s.tabId!, msg.trigger, msg.hasUnsavedInput),
  SNOOZE_TAB: (_msg, s) => manager.snoozeTab(s.tabId!),
  GET_STATUS: () => manager.status(),
  SET_ENABLED: (msg) => manager.setEnabled(msg.enabled),
  SET_AUTO_CLOSE: (msg) => manager.setAutoClose(msg.enabled),
  PAUSE: (msg) => manager.pause(msg.mode),
  RESUME: () => manager.resume(),
  EMERGENCY_STOP: () => manager.emergencyStop(),
  CANCEL_ACTIVE: () => manager.cancelActive(),
  REOPEN_LAST: () => manager.reopenLast(),
  RESET_STATS: () => manager.resetStats(),
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
  route(message, info).then(
    (result) => sendResponse(result),
    (error: unknown) =>
      sendResponse({ error: error instanceof Error ? error.message : String(error) }),
  );
  return true; // async response
});

// ---------------------------------------------------------------------------
// Tab events

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void manager.handleActivated(tabId, windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) void manager.handleUrlChanged(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void manager.handleRemoved(tabId);
});

chrome.tabs.onReplaced.addListener((_added, removed) => {
  void manager.handleRemoved(removed);
});

// ---------------------------------------------------------------------------
// Settings, alarms, shortcuts, lifecycle

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[LOCAL_KEYS.settings]) return;
  void manager.resyncAll();
  void updateBadge();
  void syncCustomContentScripts();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_PAUSE_END) {
    void manager.resyncAll().then(updateBadge);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'emergency-stop') void manager.emergencyStop();
  if (command === 'reopen-last') void manager.reopenLast();
  if (command === 'quick-pause') void manager.quickPause();
});

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    // Persist validated defaults (and migrate older settings) on install/update.
    const settings = await store.setSettings(await store.getSettings());
    await syncCustomContentScripts();
    await injectIntoOpenTabs(settings);
    await updateBadge();
    if (details.reason === 'install') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html#welcome') });
    }
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void syncCustomContentScripts();
  void updateBadge();
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

chrome.permissions.onRemoved.addListener(() => void syncCustomContentScripts());
chrome.permissions.onAdded.addListener(() => void syncCustomContentScripts());
