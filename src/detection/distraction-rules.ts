import type { SiteRule } from '../shared/types';

/**
 * Central registry of built-in distracting websites.
 * Each entry's domains must also be listed in public/manifest.json
 * (host_permissions + content_scripts.matches); a unit test enforces this.
 */
export const BUILT_IN_SITES: readonly SiteRule[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    domains: ['instagram.com'],
    enabled: true,
    color: '#E1306C',
    delaySeconds: null,
    builtIn: true,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    domains: ['tiktok.com'],
    enabled: true,
    color: '#25F4EE',
    delaySeconds: null,
    builtIn: true,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domains: ['youtube.com'],
    enabled: true,
    color: '#FF0033',
    delaySeconds: null,
    builtIn: true,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    domains: ['facebook.com'],
    enabled: true,
    color: '#1877F2',
    delaySeconds: null,
    builtIn: true,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    domains: ['reddit.com'],
    enabled: true,
    color: '#FF4500',
    delaySeconds: null,
    builtIn: true,
  },
  {
    id: 'x',
    name: 'X',
    domains: ['x.com'],
    enabled: true,
    color: '#71767B',
    delaySeconds: null,
    builtIn: true,
  },
];
