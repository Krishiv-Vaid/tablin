import { describe, expect, it } from 'vitest';
import {
  bounceInside,
  clampDrag,
  dist,
  launchSpring,
  launchVelocity,
  len,
  PHYSICS,
  pullProgress,
  springStep,
  tensionMultiplier,
  updateCharge,
  velocityFromSamples,
} from '../../src/character/CharacterPhysics';

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

describe('physics', () => {
  it('spring converges on its target without exploding', () => {
    let s = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
    for (let i = 0; i < 600; i++)
      s = springStep(s.pos, s.vel, { x: 100, y: 50 }, { stiffness: 80, dampingRatio: 0.6 }, 1 / 60);
    expect(dist(s.pos, { x: 100, y: 50 })).toBeLessThan(0.5);
    expect(len(s.vel)).toBeLessThan(1);
  });

  it('underdamped launch spring overshoots a little; reduced motion does not', () => {
    const run = (dampingRatio: number) => {
      let s = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
      let maxX = 0;
      for (let i = 0; i < 400; i++) {
        s = springStep(s.pos, s.vel, { x: 100, y: 0 }, { stiffness: 60, dampingRatio }, 1 / 60);
        maxX = Math.max(maxX, s.pos.x);
      }
      return maxX;
    };
    expect(run(launchSpring(0.5, false).dampingRatio)).toBeGreaterThan(102);
    expect(run(launchSpring(0.5, true).dampingRatio)).toBeLessThanOrEqual(100.5);
  });

  it('caps velocity at MAX_SPEED', () => {
    const s = springStep(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1e7, y: 0 },
      { stiffness: 1000, dampingRatio: 0 },
      1 / 30,
    );
    expect(len(s.vel)).toBeLessThanOrEqual(PHYSICS.MAX_SPEED + 1e-6);
  });

  it('clamps drags to a maximum distance and the viewport', () => {
    const p = clampDrag({ x: 500, y: 100 }, { x: -900, y: 100 }, 300, bounds);
    expect(p).toEqual({ x: 200, y: 100 });
    const q = clampDrag({ x: 20, y: 20 }, { x: -50, y: -50 }, 300, bounds);
    expect(q).toEqual({ x: 0, y: 0 });
  });

  it('pull progress counts only movement away from the destination', () => {
    const origin = { x: 500, y: 40 };
    const target = { x: 900, y: 40 };
    expect(pullProgress(origin, { x: 400, y: 40 }, target, 200)).toBeCloseTo(0.5);
    expect(pullProgress(origin, { x: 200, y: 40 }, target, 200)).toBe(1);
    expect(pullProgress(origin, { x: 700, y: 40 }, target, 200)).toBe(0);
    expect(pullProgress(origin, { x: 500, y: 240 }, target, 200)).toBeGreaterThan(0.1);
    expect(pullProgress(origin, { x: 400, y: 40 }, target, 0)).toBe(0);
  });

  it('charge builds with distance and hold time, bounded to 1', () => {
    let quick = 0;
    for (let i = 0; i < 30; i++) quick = updateCharge(quick, 1, 0, 1 / 60);
    let held = 0;
    for (let i = 0; i < 180; i++) held = updateCharge(held, 1, i / 60, 1 / 60);
    let half = 0;
    for (let i = 0; i < 180; i++) half = updateCharge(half, 0.5, i / 60, 1 / 60);
    expect(quick).toBeLessThan(held);
    expect(held).toBeGreaterThan(0.95);
    expect(held).toBeLessThanOrEqual(1);
    expect(half).toBeLessThan(0.55);
    // Releasing tension lowers the charge.
    let back = held;
    for (let i = 0; i < 60; i++) back = updateCharge(back, 0, 2, 1 / 60);
    expect(back).toBeLessThan(0.1);
  });

  it('tension multiplier is bounded', () => {
    expect(tensionMultiplier(0)).toBe(1);
    expect(tensionMultiplier(1)).toBe(PHYSICS.MAX_TENSION_MULTIPLIER);
    expect(tensionMultiplier(5)).toBe(PHYSICS.MAX_TENSION_MULTIPLIER);
    expect(tensionMultiplier(1, 99)).toBe(PHYSICS.MAX_TENSION_MULTIPLIER);
  });

  it('launch velocity points at the target, grows with charge, and is capped', () => {
    const from = { x: 100, y: 100 };
    const target = { x: 900, y: 40 };
    const weak = launchVelocity(from, target, 0.2, 200);
    const strong = launchVelocity(from, target, 1, 200);
    expect(weak.x).toBeGreaterThan(0);
    expect(weak.y).toBeLessThan(0);
    expect(len(strong)).toBeGreaterThan(len(weak));
    expect(len(launchVelocity(from, target, 1, 99_999))).toBeLessThanOrEqual(PHYSICS.MAX_SPEED);
  });

  it('estimates pointer velocity from samples', () => {
    const v = velocityFromSamples([
      { x: 0, y: 0, t: 0 },
      { x: 50, y: 0, t: 50 },
      { x: 100, y: 0, t: 100 },
    ]);
    expect(v.x).toBeCloseTo(1000);
    expect(velocityFromSamples([{ x: 0, y: 0, t: 0 }])).toEqual({ x: 0, y: 0 });
  });

  it('bounces off viewport edges with damping', () => {
    const b = bounceInside({ x: 1010, y: 50 }, { x: 500, y: 0 }, bounds);
    expect(b.pos.x).toBe(1000);
    expect(b.vel.x).toBeLessThan(0);
    expect(Math.abs(b.vel.x)).toBeLessThan(500);
  });
});
