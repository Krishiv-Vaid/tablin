import { describe, expect, it } from 'vitest';
import {
  baseDelayMs,
  createCustomSite,
  defaultSettings,
  validateSettings,
} from '../../src/shared/settings';

describe('settings validation', () => {
  it('returns defaults for missing or garbage input', () => {
    for (const raw of [undefined, null, 42, 'x', [], {}]) {
      const s = validateSettings(raw);
      expect(s).toEqual(defaultSettings());
    }
  });

  it('defaults to nudge mode (auto-close off) with a 12s delay', () => {
    const s = defaultSettings();
    expect(s.autoClose).toBe(false);
    expect(s.delaySeconds).toBe(12);
    expect(s.enabled).toBe(true);
    expect(s.behavior.protectAudible).toBe(true);
    expect(s.sites.map((x) => x.id)).toEqual([
      'instagram',
      'tiktok',
      'youtube',
      'facebook',
      'reddit',
      'x',
    ]);
  });

  it('clamps numbers into range', () => {
    const s = validateSettings({
      delaySeconds: 1,
      behavior: { maxSpeedMultiplier: 99, speed: -3 },
    });
    expect(s.delaySeconds).toBe(5);
    expect(s.behavior.maxSpeedMultiplier).toBe(3);
    expect(s.behavior.speed).toBe(0.5);
    expect(validateSettings({ delaySeconds: 600 }).delaySeconds).toBe(60);
    expect(validateSettings({ delaySeconds: 12.6 }).delaySeconds).toBe(13);
    expect(validateSettings({ delaySeconds: Number.NaN }).delaySeconds).toBe(12);
  });

  it('rejects invalid enum values and wrong types', () => {
    const s = validateSettings({
      enabled: 'yes',
      autoClose: 1,
      character: { color: 'chartreuse', size: 'huge', intensity: 'max' },
      behavior: { resetFrequency: 'weekly', switchAway: 'explode' },
    });
    expect(s.enabled).toBe(true);
    expect(s.autoClose).toBe(false);
    expect(s.character.color).toBe('orange');
    expect(s.character.size).toBe('medium');
    expect(s.behavior.resetFrequency).toBe('daily');
    expect(s.behavior.switchAway).toBe('pause');
  });

  it('sanitizes the character name', () => {
    expect(validateSettings({ character: { name: '  <b>Mochi</b>  ' } }).character.name).toBe(
      'bMochi/b',
    );
    expect(validateSettings({ character: { name: '' } }).character.name).toBe('Tablin');
    expect(validateSettings({ character: { name: 'x'.repeat(100) } }).character.name).toHaveLength(
      24,
    );
  });

  it('keeps built-in sites (toggles persist, definitions do not) and adds new built-ins', () => {
    const s = validateSettings({
      sites: [
        {
          id: 'youtube',
          enabled: false,
          delaySeconds: 30,
          domains: ['evil.com'],
          name: 'Hacked',
          builtIn: true,
        },
      ],
    });
    const yt = s.sites.find((x) => x.id === 'youtube')!;
    expect(yt.enabled).toBe(false);
    // v1's numeric delaySeconds migrates to a v2 DelayConfig.
    expect(yt.delay).toEqual({ mode: 'preset', seconds: 30 });
    expect(yt.domains).toEqual(['youtube.com']);
    expect(yt.name).toBe('YouTube');
    expect(s.sites).toHaveLength(6);
  });

  it('validates custom sites, dropping invalid or duplicate ones', () => {
    const s = validateSettings({
      sites: [
        { name: 'Twitch', domains: ['https://www.twitch.tv'], enabled: true },
        { name: 'Twitch again', domains: ['twitch.tv'] },
        { name: 'Bad', domains: ['not a domain'] },
        { name: 'Shadow', domains: ['youtube.com'] },
      ],
    });
    const custom = s.sites.filter((x) => !x.builtIn);
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({
      id: 'custom:twitch.tv',
      domains: ['twitch.tv'],
      builtIn: false,
    });
  });

  it('createCustomSite refuses duplicates and covered subdomains', () => {
    const sites = defaultSettings().sites;
    expect(createCustomSite('twitch.tv', sites)?.domains).toEqual(['twitch.tv']);
    expect(createCustomSite('m.youtube.com', sites)).toBeNull();
    expect(createCustomSite('youtube.com', sites)).toBeNull();
    expect(createCustomSite('???', sites)).toBeNull();
  });

  it('computes per-site delay overrides', () => {
    const s = defaultSettings();
    const yt = s.sites.find((x) => x.id === 'youtube')!;
    expect(baseDelayMs(s, yt)).toBe(12_000);
    expect(baseDelayMs(s, { ...yt, delay: { mode: 'custom', seconds: 27 } })).toBe(27_000);
  });
});
