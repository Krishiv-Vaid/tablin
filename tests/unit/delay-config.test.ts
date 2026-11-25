import { describe, expect, it } from 'vitest';
import {
  baseDelayMs,
  defaultSettings,
  delayFromSeconds,
  parseCustomDelay,
  parseMinutes,
  siteDelaySeconds,
  validateDelay,
  validateSettings,
} from '../../src/shared/settings';
import { TablinStore } from '../../src/shared/storage';
import { DELAY_PRESETS } from '../../src/shared/types';
import { harness, MemoryArea, YT } from './helpers';

describe('custom countdown parsing', () => {
  it.each([
    ['27', 27],
    [' 5 ', 5],
    ['60', 60],
  ])('accepts %j', (input, value) => expect(parseCustomDelay(input)).toEqual({ ok: true, value }));

  it.each([
    ['', 'Enter a number of seconds.'],
    ['4', 'Choose between 5 and 60 seconds.'],
    ['61', 'Choose between 5 and 60 seconds.'],
    ['12.5', 'Use a whole number of seconds.'],
    ['-10', 'Use a whole number of seconds.'],
    ['ten', 'Use a whole number of seconds.'],
    ['1e2', 'Use a whole number of seconds.'],
  ])('rejects %j', (input, error) => expect(parseCustomDelay(input)).toEqual({ ok: false, error }));

  it('parses focus minutes with their own range', () => {
    expect(parseMinutes('90', 1, 240)).toEqual({ ok: true, value: 90 });
    expect(parseMinutes('0', 1, 240).ok).toBe(false);
    expect(parseMinutes('241', 1, 240).ok).toBe(false);
  });
});

describe('delay config', () => {
  it('presets stay presets; other values become custom', () => {
    for (const p of DELAY_PRESETS)
      expect(delayFromSeconds(p)).toEqual({ mode: 'preset', seconds: p });
    expect(delayFromSeconds(27)).toEqual({ mode: 'custom', seconds: 27 });
  });

  it('validates stored configs and rejects out-of-range or malformed ones', () => {
    expect(validateDelay({ mode: 'custom', seconds: 27 })).toEqual({ mode: 'custom', seconds: 27 });
    expect(validateDelay({ mode: 'preset', seconds: 27 })).toEqual({ mode: 'custom', seconds: 27 });
    expect(validateDelay({ mode: 'custom', seconds: 4 })).toEqual({ mode: 'inherit' });
    expect(validateDelay({ mode: 'custom', seconds: 61 })).toEqual({ mode: 'inherit' });
    expect(validateDelay({ mode: 'custom', seconds: 20.5 })).toEqual({ mode: 'inherit' });
    expect(validateDelay({ mode: 'sometimes' })).toEqual({ mode: 'inherit' });
    expect(validateDelay(undefined, 99)).toEqual({ mode: 'preset', seconds: 60 }); // v1 legacy, clamped
  });

  it('inherit follows the global default; explicit overrides do not', () => {
    const s = defaultSettings();
    const inherit = { delay: { mode: 'inherit' as const } };
    const custom = { delay: { mode: 'custom' as const, seconds: 27 } };
    expect(siteDelaySeconds(s, inherit)).toBe(12);
    s.delaySeconds = 40;
    expect(siteDelaySeconds(s, inherit)).toBe(40);
    expect(siteDelaySeconds(s, custom)).toBe(27);
  });

  it('per-site custom delays persist through a restart', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    await store.updateSettings((s) => ({
      ...s,
      sites: s.sites.map((x) =>
        x.id === 'instagram' ? { ...x, delay: { mode: 'custom', seconds: 27 } } : x,
      ),
    }));
    const s = await new TablinStore(local, new MemoryArea()).getSettings();
    const ig = s.sites.find((x) => x.id === 'instagram')!;
    expect(ig.delay).toEqual({ mode: 'custom', seconds: 27 });
    expect(baseDelayMs(s, ig)).toBe(27_000);
  });

  it('changing the global default never overwrites explicit per-site settings', () => {
    const s = validateSettings({
      delaySeconds: 12,
      sites: [{ id: 'youtube', enabled: true, delay: { mode: 'custom', seconds: 27 } }],
    });
    const changed = validateSettings({ ...s, delaySeconds: 50 });
    expect(changed.sites.find((x) => x.id === 'youtube')!.delay).toEqual({
      mode: 'custom',
      seconds: 27,
    });
  });

  it('a custom 27s delay drives the real countdown', async () => {
    const h = await harness((s) => ({
      ...s,
      sites: s.sites.map((x) =>
        x.id === 'youtube' ? { ...x, delay: { mode: 'custom', seconds: 27 } } : x,
      ),
    }));
    h.tabs.add({ id: 1, url: YT, active: true });
    const sync = await h.manager.handlePageReady(1, YT);
    expect(sync).toEqual({ mode: 'counting', dueAt: h.clock.t + 27_000 });
  });

  it('a delay change mid-countdown keeps the running deadline; the next countdown uses the new value', async () => {
    const h = await harness();
    h.tabs.add({ id: 1, url: YT, active: true });
    h.tabs.add({ id: 2, url: YT, windowId: 2 });
    const first = await h.manager.handlePageReady(1, YT);
    await h.store.updateSettings((s) => ({
      ...s,
      sites: s.sites.map((x) =>
        x.id === 'youtube' ? { ...x, delay: { mode: 'custom', seconds: 40 } } : x,
      ),
    }));
    await h.manager.resyncAll();
    expect(h.tabs.lastSync(1)).toEqual(first);
    h.tabs.tabs.get(2)!.active = true;
    expect(await h.manager.handlePageReady(2, YT)).toEqual({
      mode: 'counting',
      dueAt: h.clock.t + 40_000,
    });
  });
});
