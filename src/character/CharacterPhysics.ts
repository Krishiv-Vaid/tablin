/**
 * Pure physics helpers for the character: vectors, springs, drag limits and the
 * slingshot tension model. No DOM, no browser APIs — fully unit-testable.
 */

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function normalize(a: Vec): Vec {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function clampLength(a: Vec, max: number): Vec {
  const l = len(a);
  return l > max ? scale(a, max / l) : a;
}

export const PHYSICS = {
  /** Slingshot charge needed for a release to launch (below this it just drops back). */
  LAUNCH_THRESHOLD: 0.12,
  /** Pull progress at which the dragged character starts "charging". */
  CHARGE_START: 0.08,
  /** Holding a pull this long earns the full hold bonus. */
  FULL_HOLD_SECONDS: 1.4,
  /** Tension multiplier at full charge (bounded). */
  MAX_TENSION_MULTIPLIER: 3,
  /** Absolute speed cap for anything the character does, px/s. */
  MAX_SPEED: 2600,
  /** Walking/running never exceeds this, px/s. */
  MAX_WALK_SPEED: 900,
} as const;

export interface SpringConfig {
  stiffness: number;
  /** Damping ratio: 1 = critically damped, < 1 bouncy. */
  dampingRatio: number;
}

/**
 * One semi-implicit Euler step of a damped spring pulling `pos` toward `target`
 * (unit mass). Stable for the small dt values we use (≤ 1/30 s).
 */
export function springStep(
  pos: Vec,
  vel: Vec,
  target: Vec,
  config: SpringConfig,
  dt: number,
): { pos: Vec; vel: Vec } {
  const k = config.stiffness;
  const c = 2 * Math.sqrt(k) * config.dampingRatio;
  const accel = sub(scale(sub(target, pos), k), scale(vel, c));
  const nextVel = clampLength(add(vel, scale(accel, dt)), PHYSICS.MAX_SPEED);
  return { pos: add(pos, scale(nextVel, dt)), vel: nextVel };
}

/** 1-D: move `current` toward `target` by at most `rate * dt`. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

/** Frame-rate independent exponential smoothing factor. */
export function smoothing(ratePerSecond: number, dt: number): number {
  return 1 - Math.exp(-ratePerSecond * dt);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Where the dragged character may be: within `maxDistance` of where it was grabbed
 * and inside the viewport bounds. Prevents flinging it off-screen or across the page.
 */
export function clampDrag(origin: Vec, desired: Vec, maxDistance: number, bounds: Bounds): Vec {
  const offset = clampLength(sub(desired, origin), maxDistance);
  const p = add(origin, offset);
  return { x: clamp(p.x, bounds.minX, bounds.maxX), y: clamp(p.y, bounds.minY, bounds.maxY) };
}

/**
 * How far the user has pulled the character *backwards*, 0..1: the increase in
 * distance to the destination since it was grabbed, relative to `maxPull`.
 * Dragging it toward the destination yields 0.
 */
export function pullProgress(origin: Vec, current: Vec, target: Vec, maxPull: number): number {
  if (maxPull <= 0) return 0;
  const back = dist(current, target) - dist(origin, target);
  return clamp(back / maxPull, 0, 1);
}

/**
 * Charge (0..1) eases toward the current pull, scaled up by how long it has been
 * held: farther *and* longer both build momentum, but neither alone exceeds 1.
 */
export function updateCharge(
  charge: number,
  pull: number,
  holdSeconds: number,
  dt: number,
): number {
  const holdFactor = 0.7 + 0.3 * clamp(holdSeconds / PHYSICS.FULL_HOLD_SECONDS, 0, 1);
  const target = clamp(pull * holdFactor, 0, 1);
  return clamp(charge + (target - charge) * smoothing(7, dt), 0, 1);
}

export function tensionMultiplier(
  charge: number,
  max: number = PHYSICS.MAX_TENSION_MULTIPLIER,
): number {
  const bounded = clamp(max, 1, PHYSICS.MAX_TENSION_MULTIPLIER);
  return 1 + (bounded - 1) * clamp(charge, 0, 1);
}

/**
 * Initial launch velocity toward the destination. Scales with charge and the
 * character's cruising speed, and is always bounded by PHYSICS.MAX_SPEED.
 */
export function launchVelocity(from: Vec, target: Vec, charge: number, cruiseSpeed: number): Vec {
  const dir = normalize(sub(target, from));
  const c = clamp(charge, 0, 1);
  const speed = clamp(
    cruiseSpeed * 1.5 + c * 1700 * tensionMultiplier(c) * 0.5,
    0,
    PHYSICS.MAX_SPEED,
  );
  return scale(dir, speed);
}

/** Spring used while launching: stiffer with more charge; bouncy unless reduced motion. */
export function launchSpring(charge: number, reducedMotion: boolean): SpringConfig {
  return {
    stiffness: 26 + 60 * clamp(charge, 0, 1),
    dampingRatio: reducedMotion ? 1 : 0.62,
  };
}

export interface PointerSample {
  x: number;
  y: number;
  t: number; // ms
}

/** Velocity (px/s) from recent pointer samples, using roughly the last 100 ms. */
export function velocityFromSamples(samples: readonly PointerSample[], windowMs = 100): Vec {
  if (samples.length < 2) return vec();
  const last = samples[samples.length - 1]!;
  let first = samples[0]!;
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i]!;
    if (last.t - first.t >= windowMs) break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return vec();
  return clampLength({ x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }, PHYSICS.MAX_SPEED);
}

/** Keeps a point inside bounds; reflects and damps velocity on contact ("boing"). */
export function bounceInside(
  pos: Vec,
  vel: Vec,
  bounds: Bounds,
  restitution = 0.35,
): { pos: Vec; vel: Vec } {
  const p = { ...pos };
  const v = { ...vel };
  if (p.x < bounds.minX) {
    p.x = bounds.minX;
    v.x = Math.abs(v.x) * restitution;
  } else if (p.x > bounds.maxX) {
    p.x = bounds.maxX;
    v.x = -Math.abs(v.x) * restitution;
  }
  if (p.y < bounds.minY) {
    p.y = bounds.minY;
    v.y = Math.abs(v.y) * restitution;
  } else if (p.y > bounds.maxY) {
    p.y = bounds.maxY;
    v.y = -Math.abs(v.y) * restitution;
  }
  return { pos: p, vel: v };
}
