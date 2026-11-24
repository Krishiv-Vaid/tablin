import { useCallback, useEffect, useState } from 'react';
import { sendToWorker } from '../shared/messages';
import { LOCAL_KEYS, loadSettings, loadStats, saveSettings } from '../shared/storage';
import type { Settings, Stats, StatusSnapshot } from '../shared/types';
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

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    void loadStats().then(setStats);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[LOCAL_KEYS.stats]) void loadStats().then(setStats);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return stats;
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
