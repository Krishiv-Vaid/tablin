import { describe, expect, it } from 'vitest';
import {
  blendPose,
  Blinker,
  computePose,
  neutralPose,
  type PoseContext,
} from '../../src/character/CharacterAnimations';
import { CHARACTER_STATES } from '../../src/character/CharacterStateMachine';

const ctx = (p: Partial<PoseContext>): PoseContext => ({
  state: 'idle',
  t: 0.5,
  time: 1,
  phase: 1,
  facing: 1,
  intensity: 1,
  reduced: false,
  charge: 0,
  velocity: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  blink: 1,
  mood: 'casual',
  appear: 1,
  ...p,
});

describe('animations', () => {
  it('every state yields a distinct-looking, finite pose', () => {
    for (const state of CHARACTER_STATES) {
      const pose = computePose(ctx({ state }));
      for (const v of Object.values(pose))
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
    expect(computePose(ctx({ state: 'sleeping' })).eyeShape).toBe('closed');
    expect(computePose(ctx({ state: 'sleeping' })).zzz).toBe(true);
    expect(computePose(ctx({ state: 'celebrating' })).eyeShape).toBe('happy');
    expect(computePose(ctx({ state: 'dragged' })).expression).toBe('surprised');
    expect(computePose(ctx({ state: 'frustrated' })).brow).toBe(1);
  });

  it('running leans forward more than walking, in the facing direction', () => {
    const walk = computePose(ctx({ state: 'walking' }));
    const run = computePose(ctx({ state: 'running' }));
    expect(run.lean).toBeGreaterThan(walk.lean);
    expect(computePose(ctx({ state: 'running', facing: -1 })).lean).toBeLessThan(0);
    expect(run.motion).toBe(1);
  });

  it('charging stretches with charge', () => {
    const low = computePose(ctx({ state: 'charging', charge: 0.1 }));
    const high = computePose(ctx({ state: 'charging', charge: 0.9 }));
    expect(high.scaleX).toBeGreaterThan(low.scaleX);
    expect(high.expression).toBe('strain');
  });

  it('reduced motion dampens movement amplitude', () => {
    const full = computePose(ctx({ state: 'running', phase: 1.2 }));
    const reduced = computePose(ctx({ state: 'running', phase: 1.2, reduced: true }));
    expect(Math.abs(reduced.bodyY)).toBeLessThan(Math.abs(full.bodyY));
    expect(reduced.motion).toBe(0);
  });

  it('blends poses smoothly', () => {
    const a = neutralPose();
    const b = { ...neutralPose(), lean: 10, expression: 'joy' as const };
    expect(blendPose(a, b, 0.5).lean).toBe(5);
    expect(blendPose(a, b, 0.4).expression).toBe('happy');
    expect(blendPose(a, b, 1)).toBe(b);
  });

  it('blinks occasionally', () => {
    const blinker = new Blinker(1);
    const values = Array.from({ length: 600 }, (_, i) => blinker.value(i / 60));
    expect(Math.min(...values)).toBeLessThan(0.2);
    expect(values.filter((v) => v === 1).length).toBeGreaterThan(500);
  });
});
