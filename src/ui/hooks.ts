import { useCallback, useEffect, useState } from 'react';
import { sendToWorker, type ProgressSnapshot } from '../shared/messages';
import { LOCAL_KEYS, loadSettings, saveSettings } from '../shared/storage';
import type { FocusSnapshot, Settings, StatusSnapshot } from '../shared/types';
import { paletteFor } from '../character/characters/palette';

/** Live settings from chrome.storage.local, with validated saves. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSettings().then((s) => alive && setSettings(s));
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[LOCAL_KEYS.settings]) void loadSettings().then(setSettings);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  const update = useCallback(async (fn: (s: Settings) => Settings) => {
    const current = await loadSettings();
    const saved = await saveSettings(fn(current));
    setSettings(saved);
    return saved;
  }, []);

  return { settings, update };
}

/** Polls the worker for status while the view is open (for live countdowns). */
export function useStatus(intervalMs = 1000) {
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await sendToWorker({ type: 'GET_STATUS' }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { status, setStatus, refresh, error };
}

/** Keeps the --accent CSS variable in sync with the character's color. */
export function useAccent(color: Settings['character']['color'] | undefined) {
  useEffect(() => {
    if (color) document.documentElement.style.setProperty('--accent', paletteFor(color).accent);
  }, [color]);
}

/** Ticks every second (for "3m left" labels). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m === 1 ? '1 min ago' : `${m} min ago`;
}

// ---- V2 hooks -------------------------------------------------------------------

/**
 * Focus timer state. The worker owns the timer; this only polls (1 s) while the
 * view is open to render the countdown, and derives remaining time from timestamps.
 */
export function useFocus(intervalMs = 1000) {
  const [snap, setSnap] = useState<FocusSnapshot | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSnap(await sendToWorker({ type: 'FOCUS_GET' }));
    } catch {
      // worker restarting; next tick retries
    }
  }, []);
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);
  return { snap, setSnap, refresh };
}

/** Achievements, inventory and stats; refreshes whenever they change in storage. */
export function useProgress() {
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const refresh = useCallback(async () => {
    try {
      setProgress(await sendToWorker({ type: 'PROGRESS_GET' }));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area === 'local' &&
        (changes[LOCAL_KEYS.achievements] ||
          changes[LOCAL_KEYS.inventory] ||
          changes[LOCAL_KEYS.stats] ||
          changes[LOCAL_KEYS.unseenUnlocks])
      ) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [refresh]);
  return { progress, setProgress, refresh };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function openOptions(section?: string) {
  void chrome.tabs.create({
    url: chrome.runtime.getURL(`options/index.html${section ? `#${section}` : ''}`),
  });
}
