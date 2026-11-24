import { BUILT_IN_SITES } from '../detection/distraction-rules';
import { normalizeDomain } from '../detection/website-detector';
import {
  DEFAULT_DELAY_SECONDS,
  DEFAULT_MAX_SPEED_MULTIPLIER,
  DELAY_MAX_SECONDS,
  DELAY_MIN_SECONDS,
  MAX_CUSTOM_SITES,
  MAX_NAME_LENGTH,
  SPEED_MULTIPLIER_MAX,
  SPEED_MULTIPLIER_MIN,
  SPEED_SETTING_MAX,
  SPEED_SETTING_MIN,
} from './constants';
import {
  ANIMATION_INTENSITIES,
  CHARACTER_COLORS,
  CHARACTER_DESIGNS,
  CHARACTER_SIZES,
  ESCALATION_CURVES,
  REDUCED_MOTION_PREFERENCES,
  RESET_FREQUENCIES,
  SWITCH_AWAY_BEHAVIORS,
  type BehaviorSettings,
  type CharacterSettings,
  type Settings,
  type SiteRule,
} from './types';

export const DEFAULT_CHARACTER: CharacterSettings = {
  design: 'tablin',
  color: 'orange',
  size: 'medium',
  intensity: 'normal',
  name: 'Tablin',
};

export const DEFAULT_BEHAVIOR: BehaviorSettings = {
  escalationEnabled: true,
  maxSpeedMultiplier: DEFAULT_MAX_SPEED_MULTIPLIER,
  escalationCurve: 'linear',
  resetFrequency: 'daily',
  slingshotEnabled: true,
  soundEnabled: false,
  reducedMotion: 'system',
  speed: 1,
  protectAudible: true,
  switchAway: 'pause',
};

export function defaultSettings(): Settings {
  return {
    schemaVersion: 1,
    enabled: true,
    autoClose: false,
    delaySeconds: DEFAULT_DELAY_SECONDS,
    defaultPause: '15m',
    sites: BUILT_IN_SITES.map((s) => ({ ...s, domains: [...s.domains] })),
    character: { ...DEFAULT_CHARACTER },
    behavior: { ...DEFAULT_BEHAVIOR },
    onboardingComplete: false,
  };
}

// ---- small validators -------------------------------------------------------

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

export function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function num(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  step?: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  let n = Math.min(max, Math.max(min, value));
  if (step) n = Math.round(n / step) * step;
  return Number(n.toFixed(4));
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // Strip control characters and markup-ish brackets; the name is rendered as text anyway.
  const cleaned = [...value]
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>')
    .join('')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : fallback;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function validateDelayOverride(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return num(value, DELAY_MIN_SECONDS, DELAY_MAX_SECONDS, DEFAULT_DELAY_SECONDS, 1);
}

function validateCustomSite(raw: unknown): SiteRule | null {
  if (!isRecord(raw)) return null;
  const domains = Array.isArray(raw.domains)
    ? raw.domains
        .map((d) => (typeof d === 'string' ? normalizeDomain(d) : null))
        .filter((d): d is string => d !== null)
    : [];
  const unique = [...new Set(domains)].slice(0, 4);
  if (unique.length === 0) return null;
  const primary = unique[0]!;
  return {
    id: `custom:${primary}`,
    name: cleanName(raw.name, primary),
    domains: unique,
    enabled: bool(raw.enabled, true),
    color: typeof raw.color === 'string' && HEX_RE.test(raw.color) ? raw.color : '#8A8F98',
    delaySeconds: validateDelayOverride(raw.delaySeconds),
    builtIn: false,
  };
}

function validateSites(raw: unknown): SiteRule[] {
  const stored = Array.isArray(raw) ? raw.filter(isRecord) : [];
  const byId = new Map(stored.map((s) => [s.id, s]));

  // Built-ins always exist (new ones appear after updates); only user-tunable fields persist.
  const builtIns = BUILT_IN_SITES.map((site): SiteRule => {
    const saved = byId.get(site.id);
    return {
      ...site,
      domains: [...site.domains],
      enabled: bool(saved?.enabled, site.enabled),
      delaySeconds: saved ? validateDelayOverride(saved.delaySeconds) : site.delaySeconds,
    };
  });

  const builtInDomains = new Set(builtIns.flatMap((s) => s.domains));
  const seen = new Set<string>();
  const custom: SiteRule[] = [];
  for (const entry of stored) {
    if (entry.builtIn === true) continue;
    const site = validateCustomSite(entry);
    if (!site || seen.has(site.id) || site.domains.some((d) => builtInDomains.has(d))) continue;
    seen.add(site.id);
    custom.push(site);
    if (custom.length >= MAX_CUSTOM_SITES) break;
  }
  return [...builtIns, ...custom];
}

/**
 * Turns anything read from storage (possibly partial, stale or corrupted) into a
 * complete, valid Settings object. Unknown keys are dropped; bad values fall back
 * to defaults; numbers are clamped into their allowed ranges.
 */
export function validateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isRecord(raw)) return d;
  const c = isRecord(raw.character) ? raw.character : {};
  const b = isRecord(raw.behavior) ? raw.behavior : {};

  return {
    schemaVersion: 1,
    enabled: bool(raw.enabled, d.enabled),
    autoClose: bool(raw.autoClose, d.autoClose),
    delaySeconds: num(raw.delaySeconds, DELAY_MIN_SECONDS, DELAY_MAX_SECONDS, d.delaySeconds, 1),
    defaultPause: oneOf(raw.defaultPause, ['15m', '1h'] as const, d.defaultPause),
    sites: validateSites(raw.sites),
    onboardingComplete: bool(raw.onboardingComplete, d.onboardingComplete),
    character: {
      design: oneOf(c.design, CHARACTER_DESIGNS, d.character.design),
      color: oneOf(c.color, CHARACTER_COLORS, d.character.color),
      size: oneOf(c.size, CHARACTER_SIZES, d.character.size),
      intensity: oneOf(c.intensity, ANIMATION_INTENSITIES, d.character.intensity),
      name: cleanName(c.name, d.character.name),
    },
    behavior: {
      escalationEnabled: bool(b.escalationEnabled, d.behavior.escalationEnabled),
      maxSpeedMultiplier: num(
        b.maxSpeedMultiplier,
        SPEED_MULTIPLIER_MIN,
        SPEED_MULTIPLIER_MAX,
        d.behavior.maxSpeedMultiplier,
        0.1,
      ),
      escalationCurve: oneOf(b.escalationCurve, ESCALATION_CURVES, d.behavior.escalationCurve),
      resetFrequency: oneOf(b.resetFrequency, RESET_FREQUENCIES, d.behavior.resetFrequency),
      slingshotEnabled: bool(b.slingshotEnabled, d.behavior.slingshotEnabled),
      soundEnabled: bool(b.soundEnabled, d.behavior.soundEnabled),
      reducedMotion: oneOf(b.reducedMotion, REDUCED_MOTION_PREFERENCES, d.behavior.reducedMotion),
      speed: num(b.speed, SPEED_SETTING_MIN, SPEED_SETTING_MAX, d.behavior.speed, 0.05),
      protectAudible: bool(b.protectAudible, d.behavior.protectAudible),
      switchAway: oneOf(b.switchAway, SWITCH_AWAY_BEHAVIORS, d.behavior.switchAway),
    },
  };
}

/** Creates a custom site rule from user input, or null if the domain is invalid. */
export function createCustomSite(input: string, existing: readonly SiteRule[]): SiteRule | null {
  const domain = normalizeDomain(input);
  if (!domain) return null;
  const taken = existing.some((s) =>
    s.domains.some((d) => d === domain || domain.endsWith(`.${d}`)),
  );
  if (taken) return null;
  return validateCustomSite({ name: domain, domains: [domain], enabled: true });
}

/** Effective countdown for a site in ms (per-site override or the global delay). */
export function baseDelayMs(settings: Settings, site: SiteRule): number {
  return (site.delaySeconds ?? settings.delaySeconds) * 1000;
}
