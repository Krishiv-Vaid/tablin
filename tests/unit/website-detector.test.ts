import { describe, expect, it } from 'vitest';
import { BUILT_IN_SITES } from '../../src/detection/distraction-rules';
import {
  hostMatchesDomain,
  hostnameOf,
  matchPatternsFor,
  matchSite,
  normalizeDomain,
} from '../../src/detection/website-detector';
import type { SiteRule } from '../../src/shared/types';

const sites = BUILT_IN_SITES.map((s) => ({ ...s }));

describe('website detection', () => {
  it.each([
    ['https://instagram.com/', 'instagram'],
    ['https://www.instagram.com/reels/', 'instagram'],
    ['https://www.tiktok.com/@someone', 'tiktok'],
    ['https://youtube.com/', 'youtube'],
    ['https://m.youtube.com/watch?v=1', 'youtube'],
    ['https://music.youtube.com/', 'youtube'],
    ['http://www.facebook.com/', 'facebook'],
    ['https://old.reddit.com/r/all', 'reddit'],
    ['https://x.com/home', 'x'],
    ['https://mobile.x.com/home', 'x'],
    ['https://WWW.YOUTUBE.COM./feed', 'youtube'],
  ])('matches %s → %s', (url, id) => {
    expect(matchSite(url, sites)?.id).toBe(id);
  });

  it.each([
    'https://notinstagram.com/',
    'https://instagram.com.evil.example/',
    'https://box.com/',
    'https://xx.co/',
    'https://youtube.co/',
    'https://docs.google.com/',
    'chrome://extensions',
    'file:///Users/me/youtube.com.html',
    'about:blank',
    'not a url',
    '',
  ])('does not match %s', (url) => {
    expect(matchSite(url, sites)).toBeNull();
  });

  it('ignores disabled sites unless asked', () => {
    const withDisabled: SiteRule[] = sites.map((s) =>
      s.id === 'youtube' ? { ...s, enabled: false } : s,
    );
    expect(matchSite('https://youtube.com', withDisabled)).toBeNull();
    expect(matchSite('https://youtube.com', withDisabled, { includeDisabled: true })?.id).toBe(
      'youtube',
    );
  });

  it('hostname helpers', () => {
    expect(hostnameOf('https://A.B.example.com:8080/x')).toBe('a.b.example.com');
    expect(hostnameOf('ftp://example.com')).toBeNull();
    expect(hostMatchesDomain('a.reddit.com', 'reddit.com')).toBe(true);
    expect(hostMatchesDomain('areddit.com', 'reddit.com')).toBe(false);
  });

  it('normalizes user-entered domains', () => {
    expect(normalizeDomain('twitch.tv')).toBe('twitch.tv');
    expect(normalizeDomain('  https://www.Twitch.tv/videos?x=1 ')).toBe('twitch.tv');
    expect(normalizeDomain('news.ycombinator.com')).toBe('news.ycombinator.com');
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('http://127.0.0.1')).toBeNull();
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('chrome://settings')).toBeNull();
  });

  it('builds match patterns covering subdomains', () => {
    expect(matchPatternsFor('twitch.tv')).toEqual(['*://twitch.tv/*', '*://*.twitch.tv/*']);
  });
});
