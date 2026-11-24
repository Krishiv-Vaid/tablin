/**
 * Procedural animation: turns (state, time, motion) into a Pose — a small set of
 * numbers the renderer applies to the SVG rig. Pure functions, no DOM.
 */
import type { Mood } from '../shared/types';
import type { CharacterState } from './CharacterStateMachine';
import { clamp, len, type Vec } from './CharacterPhysics';

export type EyeShape = 'open' | 'closed' | 'happy';
export type Expression =
  'neutral' | 'happy' | 'joy' | 'surprised' | 'determined' | 'strain' | 'sleepy' | 'tired';

export interface FootPose {
  x: number;
  y: number;
}

/** All offsets are in the 100×100 SVG coordinate space of the character. */
export interface Pose {
  /** Whole-character vertical offset (jumps). Negative = up. */
  lift: number;
  /** Body bob relative to the feet. */
  bodyY: number;
  scaleX: number;
  scaleY: number;
  /** Degrees; positive leans right. Pivots at the feet. */
  lean: number;
  footL: FootPose;
  footR: FootPose;
  /** Degrees raised from resting (0 = arm hanging, 180 = straight up). */
  armL: number;
  armR: number;
  eyeOpen: number;
  eyeShape: EyeShape;
  /** −1..1 pupil offset. */
  pupilX: number;
  pupilY: number;
  /** Face shift toward where it's looking, in SVG units. */
  faceX: number;
  /** 0..1 furrowed brows. */
  brow: number;
  expression: Expression;
  blush: number;
  /** 0..1 scale/opacity for entering/leaving. */
  appear: number;
  zzz: boolean;
  sweat: number;
  /** 0..1 speed lines. */
  motion: number;
  shiverX: number;
}

export function neutralPose(): Pose {
  return {
    lift: 0,
    bodyY: 0,
    scaleX: 1,
    scaleY: 1,
    lean: 0,
    footL: { x: 0, y: 0 },
    footR: { x: 0, y: 0 },
    armL: 8,
    armR: 8,
    eyeOpen: 1,
    eyeShape: 'open',
    pupilX: 0,
    pupilY: 0,
    faceX: 0,
    brow: 0,
    expression: 'happy',
    blush: 0.55,
    appear: 1,
    zzz: false,
    sweat: 0,
    motion: 0,
    shiverX: 0,
  };
}

export interface PoseContext {
  state: CharacterState;
  /** Seconds in the current state. */
  t: number;
  /** Global seconds (for breathing, etc.). */
  time: number;
  /** Gait phase in radians, advanced by distance travelled. */
  phase: number;
  facing: 1 | -1;
  /** Animation intensity multiplier (calm 0.6, normal 1, lively 1.35). */
  intensity: number;
  reduced: boolean;
  charge: number;
  velocity: Vec;
  look: Vec;
  /** 0..1 from the blink scheduler (1 = open). */
  blink: number;
  mood: Mood;
  appear: number;
}

const moodExpression = (mood: Mood): Expression =>
  mood === 'casual' ? 'happy' : mood === 'curious' ? 'neutral' : 'determined';

function gait(p: Pose, c: PoseContext, A: number, big: boolean): void {
  const s = Math.sin(c.phase);
  const cs = Math.cos(c.phase);
  const lift = big ? 8 : 5;
  const stride = big ? 6 : 4;
  p.footL = { x: cs * stride * A * c.facing, y: -Math.max(0, s) * lift * A };
  p.footR = { x: -cs * stride * A * c.facing, y: -Math.max(0, -s) * lift * A };
  p.bodyY = -Math.abs(s) * (big ? 6 : 3) * A;
  p.lean = (big ? 11 : 4) * c.facing * A;
  const swing = big ? 34 : 16;
  p.armL = (big ? 22 : 10) + swing * A * s;
  p.armR = (big ? 22 : 10) - swing * A * s;
  const contact = 1 - Math.abs(s);
  p.scaleY = 1 - (big ? 0.06 : 0.03) * A * contact;
  p.scaleX = 1 + (big ? 0.04 : 0.02) * A * contact;
  p.faceX = 4 * c.facing;
  p.pupilX = 0.6 * c.facing;
  p.motion = big && !c.reduced ? 1 : 0;
}

/** Computes the pose for the current frame. */
export function computePose(c: PoseContext): Pose {
  const p = neutralPose();
  const A = c.intensity * (c.reduced ? 0.2 : 1);
  const front = c.facing === 1 ? 'armR' : 'armL';
  const back = c.facing === 1 ? 'armL' : 'armR';
  p.pupilX = clamp(c.look.x, -1, 1);
  p.pupilY = clamp(c.look.y, -1, 1);

  switch (c.state) {
    case 'idle': {
      const breath = Math.sin(c.time * 2.4);
      p.scaleY = 1 + 0.022 * A * breath;
      p.scaleX = 1 - 0.016 * A * breath;
      p.armL = 8 + 4 * A * Math.sin(c.time * 1.7);
      p.armR = 8 + 4 * A * Math.sin(c.time * 1.7 + 1.3);
      p.faceX = clamp(c.look.x, -1, 1) * 3;
      break;
    }
    case 'walking':
      gait(p, c, A, false);
      p.expression = moodExpression(c.mood);
      p.brow = c.mood === 'determined' ? 0.5 : 0;
      break;
    case 'running':
      gait(p, c, A, true);
      p.expression = 'determined';
      p.brow = 0.5;
      break;
    case 'frustrated':
      gait(p, c, A, true);
      p.expression = 'determined';
      p.brow = 1;
      p.blush = 1;
      p.shiverX = c.reduced ? 0 : Math.sin(c.time * 40) * 0.6;
      break;
    case 'approaching': {
      // Notices you: a startled hop, a look back, then turns toward the exit.
      const hop = Math.sin(clamp(c.t / 0.45, 0, 1) * Math.PI);
      p.lift = -hop * 9 * A;
      p.scaleY = 1 + 0.06 * hop * A;
      p.scaleX = 1 - 0.04 * hop * A;
      const turn = clamp((c.t - 0.35) / 0.3, 0, 1);
      p.faceX = (-4 + 8 * turn) * c.facing;
      p.pupilX = (-0.8 + 1.6 * turn) * c.facing;
      p.pupilY = -0.2;
      p.eyeOpen = 1.12;
      p.expression = c.t < 0.5 ? 'surprised' : moodExpression(c.mood);
      p.armL = 30 * hop + 8;
      p.armR = 30 * hop + 8;
      break;
    }
    case 'dragged': {
      const speed = len(c.velocity);
      const stretch = clamp(speed / 1500, 0, 0.18) * A;
      const sway = clamp(-c.velocity.x / 600, -1, 1);
      p.scaleY = 1 + stretch;
      p.scaleX = 1 - stretch * 0.7;
      p.lean = clamp(c.velocity.x / 40, -18, 18) * A;
      p.footL = { x: sway * 4 * A, y: 5 };
      p.footR = { x: sway * 4 * A, y: 5 };
      p.armL = 70 + 15 * Math.sin(c.time * 9) * A;
      p.armR = 70 + 15 * Math.sin(c.time * 9 + 1.6) * A;
      p.expression = 'surprised';
      p.eyeOpen = 1.1;
      if (speed > 60) {
        p.pupilX = clamp(c.velocity.x / speed, -1, 1) * 0.8;
        p.pupilY = clamp(c.velocity.y / speed, -1, 1) * 0.8;
      }
      break;
    }
    case 'charging': {
      // Stretches like an elastic band, straining back toward the exit.
      const ch = clamp(c.charge, 0, 1);
      p.scaleX = 1 + 0.22 * ch * A;
      p.scaleY = 1 - 0.12 * ch * A;
      p.lean = -14 * ch * c.facing * A;
      p.shiverX = c.reduced ? 0 : Math.sin(c.time * 70) * 1.2 * ch;
      p.footL = { x: -3 * c.facing * ch, y: 4 };
      p.footR = { x: -3 * c.facing * ch, y: 4 };
      p[front] = 85 + 10 * ch;
      p[back] = 55;
      p.expression = ch > 0.35 ? 'strain' : 'determined';
      p.brow = 0.4 + 0.6 * ch;
      p.eyeOpen = 0.8;
      p.sweat = ch > 0.7 ? ch : 0;
      p.faceX = 4 * c.facing;
      p.pupilX = 0.9 * c.facing;
      p.pupilY = -0.2;
      break;
    }
    case 'launching': {
      const sp = clamp(len(c.velocity) / 1500, 0, 1);
      p.lean = 16 * c.facing * A * Math.max(0.3, sp);
      p.scaleX = 1 + 0.18 * A * sp;
      p.scaleY = 1 - 0.1 * A * sp;
      p.armL = 40;
      p.armR = 40;
      p.footL = { x: -4 * c.facing, y: 3 };
      p.footR = { x: -4 * c.facing, y: 3 };
      p.motion = c.reduced ? 0 : 1;
      p.expression = 'joy';
      p.faceX = 4 * c.facing;
      p.pupilX = 0.8 * c.facing;
      break;
    }
    case 'celebrating': {
      const ph = (c.t % 0.6) / 0.6;
      const h = Math.sin(ph * Math.PI);
      p.lift = -h * 14 * A;
      p.scaleY = 1 + 0.08 * A * (h - 0.5);
      p.scaleX = 1 - 0.06 * A * (h - 0.5);
      p.footL = { x: 0, y: -h * 3 * A };
      p.footR = { x: 0, y: -h * 3 * A };
      p.armL = 150 + 20 * Math.sin(c.time * 12) * A;
      p.armR = 150 + 20 * Math.sin(c.time * 12 + Math.PI) * A;
      p.eyeShape = 'happy';
      p.expression = 'joy';
      p.blush = 0.9;
      break;
    }
    case 'sleeping': {
      const breath = Math.sin(c.time * 1.3);
      p.scaleY = 1 + 0.035 * A * breath;
      p.scaleX = 1 - 0.02 * A * breath;
      p.bodyY = 1.5;
      p.lean = 3;
      p.armL = 4;
      p.armR = 4;
      p.eyeShape = 'closed';
      p.expression = 'sleepy';
      p.zzz = true;
      p.blush = 0.7;
      break;
    }
    case 'tired': {
      const pant = Math.sin(c.time * 9);
      p.bodyY = 1 + pant * 1.2 * A;
      p.scaleY = 0.97 + 0.02 * pant * A;
      p.scaleX = 1.02;
      p.eyeOpen = 0.55;
      p.expression = 'tired';
      p.sweat = 1;
      p.armL = 2;
      p.armR = 2;
      p.lean = 2 * c.facing;
      p.pupilY = 0.3;
      break;
    }
    case 'reaching': {
      // Stands on tiptoe and reaches up toward the tab's close button.
      const k = clamp(c.t / 0.35, 0, 1);
      const press = c.t > 0.5 ? Math.sin((c.t - 0.5) * 12) * 6 * A : 0;
      p.scaleY = 1 + 0.1 * k * A;
      p.scaleX = 1 - 0.06 * k * A;
      p.bodyY = -4 * k * A;
      p.footL = { x: 0, y: -1 * k };
      p.footR = { x: 0, y: -1 * k };
      p[front] = 160 * k + press;
      p[back] = 20 + 20 * k;
      p.lean = 4 * c.facing * k;
      p.faceX = 3 * c.facing;
      p.pupilX = 0.8 * c.facing;
      p.pupilY = -0.9;
      p.expression = c.t < 0.6 ? 'determined' : 'happy';
      break;
    }
  }

  if (p.eyeShape === 'open') p.eyeOpen *= c.blink;
  p.appear = c.appear;
  return p;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Cross-fades two poses so state changes never snap. */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  if (k >= 1) return b;
  if (k <= 0) return a;
  const discrete = k < 0.5 ? a : b;
  return {
    lift: lerp(a.lift, b.lift, k),
    bodyY: lerp(a.bodyY, b.bodyY, k),
    scaleX: lerp(a.scaleX, b.scaleX, k),
    scaleY: lerp(a.scaleY, b.scaleY, k),
    lean: lerp(a.lean, b.lean, k),
    footL: { x: lerp(a.footL.x, b.footL.x, k), y: lerp(a.footL.y, b.footL.y, k) },
    footR: { x: lerp(a.footR.x, b.footR.x, k), y: lerp(a.footR.y, b.footR.y, k) },
    armL: lerp(a.armL, b.armL, k),
    armR: lerp(a.armR, b.armR, k),
    eyeOpen: lerp(a.eyeOpen, b.eyeOpen, k),
    eyeShape: discrete.eyeShape,
    pupilX: lerp(a.pupilX, b.pupilX, k),
    pupilY: lerp(a.pupilY, b.pupilY, k),
    faceX: lerp(a.faceX, b.faceX, k),
    brow: lerp(a.brow, b.brow, k),
    expression: discrete.expression,
    blush: lerp(a.blush, b.blush, k),
    appear: lerp(a.appear, b.appear, k),
    zzz: discrete.zzz,
    sweat: lerp(a.sweat, b.sweat, k),
    motion: lerp(a.motion, b.motion, k),
    shiverX: lerp(a.shiverX, b.shiverX, k),
  };
}

export const INTENSITY_FACTOR = { calm: 0.6, normal: 1, lively: 1.35 } as const;

/** Blink scheduler: returns eye openness 0..1 for a given time. Deterministic per seed. */
export class Blinker {
  private nextAt: number;
  private startedAt = -1;
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed;
    this.nextAt = 1.5 + this.random() * 2;
  }

  private random(): number {
    // Mulberry32: tiny deterministic PRNG so tests are stable.
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  value(time: number): number {
    const duration = 0.14;
    if (this.startedAt < 0 && time >= this.nextAt) this.startedAt = time;
    if (this.startedAt >= 0) {
      const k = (time - this.startedAt) / duration;
      if (k >= 1) {
        this.startedAt = -1;
        // Occasionally double-blink.
        this.nextAt = time + (this.random() < 0.18 ? 0.22 : 2.4 + this.random() * 3.2);
        return 1;
      }
      return 1 - Math.sin(k * Math.PI);
    }
    return 1;
  }
}

/** Idle "look around" target that wanders occasionally. */
export class LookAround {
  private target: Vec = { x: 0, y: 0 };
  private current: Vec = { x: 0, y: 0 };
  private nextAt = 2;
  private seed: number;

  constructor(seed = 7) {
    this.seed = seed;
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  value(time: number, dt: number, override: Vec | null): Vec {
    if (override) {
      this.target = override;
    } else if (time >= this.nextAt) {
      const r = this.random();
      this.target =
        r < 0.4 ? { x: 0, y: 0 } : { x: this.random() * 2 - 1, y: this.random() * 0.8 - 0.4 };
      this.nextAt = time + 1.2 + this.random() * 2.8;
    }
    const k = 1 - Math.exp(-dt * 10);
    this.current = {
      x: this.current.x + (this.target.x - this.current.x) * k,
      y: this.current.y + (this.target.y - this.current.y) * k,
    };
    return this.current;
  }
}
