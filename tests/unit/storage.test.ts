import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/shared/settings';
import { LOCAL_KEYS, TablinStore } from '../../src/shared/storage';
import { emptyStats } from '../../src/shared/stats';
import { MemoryArea } from './helpers';

describe('storage persistence', () => {
  it('round-trips settings and survives a "restart" (new store over the same area)', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    await store.setSettings({
      ...defaultSettings(),
      autoClose: true,
      delaySeconds: 30,
      character: { ...defaultSettings().character, color: 'purple' },
    });
    // Simulate Chrome restart: session storage is wiped, local storage remains.
    const after = new TablinStore(local, new MemoryArea());
    const s = await after.getSettings();
    expect(s.autoClose).toBe(true);
    expect(s.delaySeconds).toBe(30);
    expect(s.character.color).toBe('purple');
  });

  it('validates on write and on read', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    await store.setSettings({ ...defaultSettings(), delaySeconds: 9999 });
    expect((local.data.get(LOCAL_KEYS.settings) as { delaySeconds: number }).delaySeconds).toBe(60);
    local.data.set(LOCAL_KEYS.settings, { delaySeconds: 'oops', enabled: false });
    const s = await store.getSettings();
    expect(s.delaySeconds).toBe(12);
    expect(s.enabled).toBe(false);
  });

  it('session pause is cleared by a browser restart, timed pause is not', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    await store.setSessionPause({ mode: 'session', startedAt: 1, until: null });
    await store.setPause({ mode: '1h', startedAt: 1, until: 999 });
    const after = new TablinStore(local, new MemoryArea());
    expect(await after.getSessionPause()).toBeNull();
    expect(await after.getPause()).toEqual({ mode: '1h', startedAt: 1, until: 999 });
  });

  it('rejects malformed pause, escalation and last-closed values', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    local.data.set(LOCAL_KEYS.pause, { mode: 'forever', startedAt: 1, until: null });
    local.data.set(LOCAL_KEYS.escalation, { count: 'many' });
    local.data.set(LOCAL_KEYS.lastClosed, { url: 5 });
    expect(await store.getPause()).toBeNull();
    expect(await store.getEscalation()).toEqual({ count: 0, periodKey: '' });
    expect(await store.getLastClosed()).toBeNull();
  });

  it('resetStats clears counters and escalation', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    await store.setStats({
      ...emptyStats(),
      totalIntercepted: 5,
      totalClosed: 2,
      totalFocusSessions: 3,
    });
    await store.setEscalation({ count: 4, periodKey: 'day:x' });
    await store.resetStats();
    expect((await store.getStats()).totalIntercepted).toBe(0);
    expect((await store.getEscalation()).count).toBe(0);
  });
});
