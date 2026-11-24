import {
  MAX_ESCALATION_LEVEL,
  MIN_ESCALATED_DELAY_MS,
  SPEED_MULTIPLIER_MAX,
} from '../shared/constants';
import { EMPTY_EQUIPPED } from '../shared/cosmetics';
import { dayKey } from '../shared/stats';
import type {
  ApproachPlan,
  CharacterColor,
  Equipped,
  BehaviorSettings,
  EscalationCurve,
  EscalationState,
  Gait,
  Mood,
  ResetFrequency,
  Settings,
} from '../shared/types';

/**
 * Escalation: every interception within a period (day or browser session) raises
 * the level for the next one, up to MAX_ESCALATION_LEVEL.
 *
 *   level 1 → casual walk at 1×
 *   level 2 → notices sooner, a bit faster
 *   level 3 → runs
 *   level 4 → quicker still, says something
 *   level 5+ → max speed (capped by the user's max multiplier)
 */

const CURVE_EXPONENT: Record<EscalationCurve, number> = {
  gentle: 1.8, // slow start, late ramp
  linear: 1,
  steep: 0.55, // ramps up early
};

/** How much sooner the character notices you at each level (fraction of the base delay). */
const DELAY_FACTOR = [1, 0.85, 0.7, 0.6, 0.5] as const;

export function periodKey(frequency: ResetFrequency, now: number, sessionId: string): string {
  return frequency === 'daily' ? `day:${dayKey(now)}` : `session:${sessionId}`;
}

/** Interceptions so far in the current period (0 if the period rolled over). */
export function currentCount(state: EscalationState, key: string): number {
  return state.periodKey === key ? state.count : 0;
}

/** Level of the *next* appearance, given how many happened before it. */
export function levelForCount(countBefore: number): number {
  return Math.min(MAX_ESCALATION_LEVEL, Math.max(1, Math.floor(countBefore) + 1));
}

/** 0 at level 1 → 1 at the max level, shaped by the curve. */
export function escalationProgress(level: number, curve: EscalationCurve): number {
  const clamped = Math.min(MAX_ESCALATION_LEVEL, Math.max(1, level));
  const linear = (clamped - 1) / (MAX_ESCALATION_LEVEL - 1);
  return Math.pow(linear, CURVE_EXPONENT[curve]);
}

export function speedMultiplierForLevel(
  level: number,
  behavior: Pick<BehaviorSettings, 'escalationEnabled' | 'maxSpeedMultiplier' | 'escalationCurve'>,
): number {
  if (!behavior.escalationEnabled) return 1;
  const max = Math.min(SPEED_MULTIPLIER_MAX, Math.max(1, behavior.maxSpeedMultiplier));
  const value = 1 + (max - 1) * escalationProgress(level, behavior.escalationCurve);
  return Math.round(value * 100) / 100;
}

export function effectiveDelayMs(
  baseMs: number,
  level: number,
  escalationEnabled: boolean,
): number {
  if (!escalationEnabled) return baseMs;
  const idx = Math.min(DELAY_FACTOR.length, Math.max(1, level)) - 1;
  const scaled = Math.round(baseMs * DELAY_FACTOR[idx]!);
  return Math.max(Math.min(baseMs, MIN_ESCALATED_DELAY_MS), scaled);
}

export function moodForLevel(level: number): Mood {
  if (level >= 5) return 'frustrated';
  if (level >= 3) return 'determined';
  if (level === 2) return 'curious';
  return 'casual';
}

export function gaitFor(level: number, speedMultiplier: number, baseSpeed: number): Gait {
  return level >= 3 || speedMultiplier * baseSpeed >= 1.5 ? 'run' : 'walk';
}

export function messageForLevel(level: number, name: string, siteName: string): string | null {
  if (level === 4) return `${siteName} again? ${name} is getting faster…`;
  if (level >= 5) return `Max speed! ${name} believes in you.`;
  return null;
}

export interface PlanExtras {
  color?: CharacterColor;
  cosmetics?: Equipped;
  focusActive?: boolean;
}

export function buildPlan(
  level: number,
  settings: Settings,
  siteName: string,
  extras: PlanExtras = {},
): ApproachPlan {
  const { behavior, character } = settings;
  const speedMultiplier = speedMultiplierForLevel(level, behavior);
  const escalated = behavior.escalationEnabled ? level : 1;
  const focusActive = extras.focusActive ?? false;
  const levelMessage = behavior.escalationEnabled
    ? messageForLevel(level, character.name, siteName)
    : null;
  return {
    level,
    speedMultiplier,
    gait: gaitFor(escalated, speedMultiplier, behavior.speed),
    mood: behavior.escalationEnabled ? moodForLevel(level) : 'casual',
    message: levelMessage ?? (focusActive ? `You're mid-focus! ${character.name} is on it.` : null),
    autoClose: settings.autoClose,
    siteName,
    character: { ...character, color: extras.color ?? character.color },
    cosmetics: { ...(extras.cosmetics ?? EMPTY_EQUIPPED) },
    focusActive,
    behavior: {
      slingshotEnabled: behavior.slingshotEnabled,
      soundEnabled: behavior.soundEnabled,
      reducedMotion: behavior.reducedMotion,
      speed: behavior.speed,
    },
  };
}
