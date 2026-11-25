import { BUILT_IN_SITES } from '../detection/distraction-rules';
import { normalizeDomain } from '../detection/website-detector';
import {
  BREAK_MINUTES_MAX,
  BREAK_MINUTES_MIN,
  CLOSE_TIMER_MAX_SECONDS,
  CLOSE_TIMER_MIN_SECONDS,
  DEFAULT_CLOSE_TIMER_SECONDS,
  DEFAULT_DELAY_SECONDS,
  DEFAULT_MAX_SPEED_MULTIPLIER,
  DELAY_MAX_SECONDS,
  DELAY_MIN_SECONDS,
  FOCUS_MINUTES_MAX,
  FOCUS_MINUTES_MIN,
  MAX_CUSTOM_SITES,
  MAX_NAME_LENGTH,
  SPEED_MULTIPLIER_MAX,
  SPEED_MULTIPLIER_MIN,
  SPEED_SETTING_MAX,
  SPEED_SETTING_MIN,
} from './constants';
import {
  ALL_CHARACTER_COLORS,
  ANIMATION_INTENSITIES,
  CHARACTER_DESIGNS,
  CHARACTER_SIZES,
  DELAY_PRESETS,
  ESCALATION_CURVES,
  REDUCED_MOTION_PREFERENCES,
  RESET_FREQUENCIES,
  SWITCH_AWAY_BEHAVIORS,
  type BehaviorSettings,
  type CharacterSettings,
  type DelayConfig,
  type FocusSettings,
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

export const DEFAULT_FOCUS: FocusSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  relaxDuringBreaks: true,
  // Off until the user turns it on (which asks Chrome for the optional permission).
  notifications: false,
};

export function defaultSettings(): Settings {
  return {
    schemaVersion: 2,
    enabled: true,
    autoClose: false,
    closeTimerSeconds: DEFAULT_CLOSE_TIMER_SECONDS,
    delaySeconds: DEFAULT_DELAY_SECONDS,
    defaultPause: '15m',
    sites: BUILT_IN_SITES.map((s) => ({ ...s, domains: [...s.domains], delay: { ...s.delay } })),
    character: { ...DEFAULT_CHARACTER },
    behavior: { ...DEFAULT_BEHAVIOR },
    focus: { ...DEFAULT_FOCUS },
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

// ---- countdown delay config ---------------------------------------------------

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Parses what the user typed into a custom-delay field. */
export function parseCustomDelay(input: string): ParseResult {
  return parseWhole(input, DELAY_MIN_SECONDS, DELAY_MAX_SECONDS, 'seconds');
}

/** Parses a focus/break length the user typed. */
export function parseMinutes(input: string, min: number, max: number): ParseResult {
  return parseWhole(input, min, max, 'minutes');
}

function parseWhole(input: string, min: number, max: number, unit: string): ParseResult {
  const text = input.trim();
  if (text === '') return { ok: false, error: `Enter a number of ${unit}.` };
  if (!/^\d+$/.test(text)) return { ok: false, error: `Use a whole number of ${unit}.` };
  const value = Number(text);
  if (value < min || value > max) {
    return { ok: false, error: `Choose between ${min} and ${max} ${unit}.` };
  }
  return { ok: true, value };
}

function validSeconds(v: unknown): v is number {
  return (
    typeof v === 'number' && Number.isInteger(v) && v >= DELAY_MIN_SECONDS && v <= DELAY_MAX_SECONDS
  );
}

const isPreset = (seconds: number) => (DELAY_PRESETS as readonly number[]).includes(seconds);

/** A DelayConfig for an exact number of seconds (preset if it is one, otherwise custom). */
export function delayFromSeconds(seconds: number): DelayConfig {
  return isPreset(seconds) ? { mode: 'preset', seconds } : { mode: 'custom', seconds };
}

/**
 * Validates a stored delay config. Also accepts the v1 format (`delaySeconds`:
 * number | null) so per-site overrides survive the upgrade.
 */
export function validateDelay(raw: unknown, legacySeconds?: unknown): DelayConfig {
  if (isRecord(raw)) {
    if (raw.mode === 'inherit') return { mode: 'inherit' };
    if (raw.mode === 'preset' && validSeconds(raw.seconds) && isPreset(raw.seconds)) {
      return { mode: 'preset', seconds: raw.seconds };
    }
    if ((raw.mode === 'custom' || raw.mode === 'preset') && validSeconds(raw.seconds)) {
      return { mode: 'custom', seconds: raw.seconds };
    }
    return { mode: 'inherit' };
  }
  if (typeof legacySeconds === 'number' && Number.isFinite(legacySeconds)) {
    const clamped = Math.round(
      Math.min(DELAY_MAX_SECONDS, Math.max(DELAY_MIN_SECONDS, legacySeconds)),
    );
    return delayFromSeconds(clamped);
  }
  return { mode: 'inherit' };
}

/** The effective countdown for a site, in seconds. */
export function siteDelaySeconds(
  settings: Pick<Settings, 'delaySeconds'>,
  site: Pick<SiteRule, 'delay'>,
): number {
  return site.delay.mode === 'inherit' ? settings.delaySeconds : site.delay.seconds;
}

/** Effective countdown for a site in ms. */
export function baseDelayMs(settings: Settings, site: SiteRule): number {
  return siteDelaySeconds(settings, site) * 1000;
}

// ---- sites ------------------------------------------------------------------------

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
    delay: validateDelay(raw.delay, raw.delaySeconds),
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
      delay: saved ? validateDelay(saved.delay, saved.delaySeconds) : { ...site.delay },
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
 * Turns anything read from storage (possibly partial, stale, corrupted, or the v1
 * schema) into a complete, valid v2 Settings object. Unknown keys are dropped;
 * bad values fall back to defaults; numbers are clamped into their allowed ranges.
 */
export function validateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isRecord(raw)) return d;
  const c = isRecord(raw.character) ? raw.character : {};
  const b = isRecord(raw.behavior) ? raw.behavior : {};
  const f = isRecord(raw.focus) ? raw.focus : {};

  return {
    schemaVersion: 2,
    enabled: bool(raw.enabled, d.enabled),
    autoClose: bool(raw.autoClose, d.autoClose),
    closeTimerSeconds: num(
      raw.closeTimerSeconds,
      CLOSE_TIMER_MIN_SECONDS,
      CLOSE_TIMER_MAX_SECONDS,
      d.closeTimerSeconds,
      1,
    ),
    delaySeconds: num(raw.delaySeconds, DELAY_MIN_SECONDS, DELAY_MAX_SECONDS, d.delaySeconds, 1),
    defaultPause: oneOf(raw.defaultPause, ['15m', '1h'] as const, d.defaultPause),
    sites: validateSites(raw.sites),
    onboardingComplete: bool(raw.onboardingComplete, d.onboardingComplete),
    character: {
      design: oneOf(c.design, CHARACTER_DESIGNS, d.character.design),
      color: oneOf(c.color, ALL_CHARACTER_COLORS, d.character.color),
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
    focus: {
      focusMinutes: num(
        f.focusMinutes,
        FOCUS_MINUTES_MIN,
        FOCUS_MINUTES_MAX,
        d.focus.focusMinutes,
        1,
      ),
      shortBreakMinutes: num(
        f.shortBreakMinutes,
        BREAK_MINUTES_MIN,
        BREAK_MINUTES_MAX,
        d.focus.shortBreakMinutes,
        1,
      ),
      longBreakMinutes: num(
        f.longBreakMinutes,
        BREAK_MINUTES_MIN,
        BREAK_MINUTES_MAX,
        d.focus.longBreakMinutes,
        1,
      ),
      sessionsBeforeLongBreak: num(
        f.sessionsBeforeLongBreak,
        2,
        8,
        d.focus.sessionsBeforeLongBreak,
        1,
      ),
      autoStartBreaks: bool(f.autoStartBreaks, d.focus.autoStartBreaks),
      relaxDuringBreaks: bool(f.relaxDuringBreaks, d.focus.relaxDuringBreaks),
      notifications: bool(f.notifications, d.focus.notifications),
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
