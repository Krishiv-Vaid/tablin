import type { SiteRule } from '../shared/types';

/** Lowercased hostname of an http(s) URL, or null for anything else (chrome://, file:, junk). */
export function hostnameOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return host.length > 0 ? host : null;
}

/** True when `host` is `domain` itself or any subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export interface MatchOptions {
  /** Also match rules that are switched off (used by the settings UI). */
  includeDisabled?: boolean;
}

/** Finds the site rule a URL belongs to. Disabled rules are ignored unless asked for. */
export function matchSite(
  url: string,
  sites: readonly SiteRule[],
  options: MatchOptions = {},
): SiteRule | null {
  const host = hostnameOf(url);
  if (!host) return null;
  for (const site of sites) {
    if (!site.enabled && !options.includeDisabled) continue;
    if (site.domains.some((domain) => hostMatchesDomain(host, domain))) return site;
  }
  return null;
}

const DOMAIN_RE = /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

/**
 * Normalises user input ("https://www.Twitch.tv/videos", "twitch.tv") to a bare
 * domain ("twitch.tv"). Returns null if it is not a plausible public domain.
 */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `https://${value}`;
  const host = hostnameOf(value);
  if (!host) return null;
  const bare = host.replace(/^www\./, '');
  return DOMAIN_RE.test(bare) ? bare : null;
}

/** Chrome match patterns that cover a domain and all of its subdomains. */
export function matchPatternsFor(domain: string): string[] {
  return [`*://${domain}/*`, `*://*.${domain}/*`];
}
