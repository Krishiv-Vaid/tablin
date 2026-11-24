import { describe, expect, it, vi } from 'vitest';
import { CharacterController, type ApproachParams } from '../../src/character/CharacterController';

const params = (p: Partial<ApproachParams> = {}): ApproachParams => ({
  speedMultiplier: 1,
  speedSetting: 1,
  gait: 'walk',
  mood: 'casual',
  ...p,
});

function make(events = {}, config = {}) {
  return new CharacterController(
    { sizePx: 74, intensity: 1, reducedMotion: false, slingshot: true, ...config },
    events,
    { width: 1280, height: 800 },
  );
}

function step(c: CharacterController, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) c.update(1 / 60);
}

/** Time for the character to reach the exit from entering. */
function travelTime(p: ApproachParams): number {
  const c = make();
  c.enter(p);
  let t = 0;
  while (c.mode !== 'parked' && t < 60) {
    c.update(1 / 60);
    t += 1 / 60;
  }
  return t;
}

describe('character controller', () => {
  it('enters near the top-left, notices, then walks right along the top edge', () => {
    const c = make();
    c.enter(params());
    expect(c.state).toBe('approaching');
    expect(c.pos.y).toBeLessThan(80);
    const startX = c.pos.x;
    step(c, 1.2);
    expect(c.state).toBe('walking');
    step(c, 1);
    expect(c.pos.x).toBeGreaterThan(startX + 40);
    expect(c.facing).toBe(1);
  });

  it('runs when the plan says run, and frustrated mood uses the frustrated state', () => {
    const run = make();
    run.enter(params({ gait: 'run' }));
    step(run, 1.5);
    expect(run.state).toBe('running');
    const mad = make();
    mad.enter(params({ mood: 'frustrated', gait: 'run' }));
    step(mad, 1.5);
    expect(mad.state).toBe('frustrated');
  });

  it('reaches the exit, reaches up, then parks and reports arrival exactly once', () => {
    const onArrived = vi.fn();
    const c = make({ onArrived });
    c.enter(params());
    step(c, 30);
    expect(c.mode).toBe('parked');
    expect(c.state).toBe('reaching');
    expect(onArrived).toHaveBeenCalledTimes(1);
    expect(Math.abs(c.pos.x - c.target.x)).toBeLessThan(1);
  });

  it('a higher speed multiplier arrives sooner', () => {
    expect(travelTime(params({ speedMultiplier: 2.2, gait: 'run' }))).toBeLessThan(
      travelTime(params()) * 0.7,
    );
  });

  it('dragging backwards charges tension; releasing launches toward the exit', () => {
    const onLaunch = vi.fn();
    const onArrived = vi.fn();
    const c = make({ onLaunch, onArrived });
    c.enter(params());
    step(c, 3);
    const grab = { ...c.pos };
    expect(c.beginDrag(grab, 0)).toBe(true);
    expect(c.state).toBe('dragged');
    // Pull back (left & down) and hold.
    for (let i = 1; i <= 90; i++) {
      c.dragTo({ x: grab.x - i * 4, y: grab.y + i * 1.5 }, i * 16);
      c.update(1 / 60);
    }
    expect(c.state).toBe('charging');
    expect(c.currentCharge).toBeGreaterThan(0.5);
    const frame = c.update(1 / 60);
    expect(frame.tensionLabel).toMatch(/×$/);
    c.endDrag(c.pos, 2000, false);
    expect(c.mode).toBe('launching');
    expect(c.vel.x).toBeGreaterThan(500);
    expect(onLaunch).toHaveBeenCalledOnce();
    // It never "closes" anything itself — it just arrives at the exit.
    step(c, 6);
    expect(c.mode).toBe('parked');
    expect(onArrived).toHaveBeenCalledOnce();
  });

  it('a stronger pull launches faster', () => {
    const launch = (pull: number) => {
      const c = make();
      c.enter(params());
      step(c, 3);
      const g = { ...c.pos };
      c.beginDrag(g, 0);
      for (let i = 1; i <= 60; i++) {
        c.dragTo({ x: g.x - pull, y: g.y }, i * 16);
        c.update(1 / 60);
      }
      c.endDrag(c.pos, 1000, false);
      return Math.hypot(c.vel.x, c.vel.y);
    };
    expect(launch(260)).toBeGreaterThan(launch(80));
  });

  it('respects the maximum drag distance and viewport', () => {
    const c = make();
    c.enter(params());
    step(c, 3);
    const g = { ...c.pos };
    c.beginDrag(g, 0);
    for (let i = 0; i < 60; i++) {
      c.dragTo({ x: g.x - 5000, y: g.y + 5000 }, i * 16);
      c.update(1 / 60);
    }
    expect(Math.hypot(c.pos.x - g.x, c.pos.y - g.y)).toBeLessThanOrEqual(c.maxDrag + 1);
    expect(c.pos.x).toBeGreaterThanOrEqual(37);
  });

  it('a small pull or a cancelled drag drops back and keeps walking (no launch)', () => {
    const onLaunch = vi.fn();
    const c = make({ onLaunch });
    c.enter(params());
    step(c, 3);
    const g = { ...c.pos };
    c.beginDrag(g, 0);
    c.dragTo({ x: g.x, y: g.y + 200 }, 16);
    step(c, 1);
    c.endDrag(c.pos, 1000, true); // Escape
    expect(c.mode).toBe('falling');
    step(c, 2);
    expect(['moving', 'arriving', 'parked']).toContain(c.mode);
    expect(Math.abs(c.pos.y - c.trackY)).toBeLessThan(3);
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it('with slingshot disabled, dragging never charges or launches', () => {
    const c = make({}, { slingshot: false });
    c.enter(params());
    step(c, 3);
    const g = { ...c.pos };
    c.beginDrag(g, 0);
    for (let i = 0; i < 90; i++) {
      c.dragTo({ x: g.x - 300, y: g.y }, i * 16);
      c.update(1 / 60);
    }
    expect(c.currentCharge).toBe(0);
    c.endDrag(c.pos, 2000, false);
    expect(c.mode).toBe('falling');
  });

  it('gets tired after being dragged around repeatedly', () => {
    const c = make();
    c.enter(params());
    step(c, 2);
    const seen = new Set<string>();
    for (let n = 0; n < 3; n++) {
      const g = { ...c.pos };
      c.beginDrag(g, 0);
      c.dragTo({ x: g.x, y: g.y + 150 }, 16);
      step(c, 0.3);
      c.endDrag(c.pos, 400, true);
      for (let i = 0; i < 90; i++) seen.add(c.update(1 / 60).state);
    }
    expect(c.dragsThisAppearance).toBe(3);
    expect(seen.has('tired')).toBe(true);
    // ...and then gets back to work.
    step(c, 2);
    expect(['walking', 'reaching']).toContain(c.state);
  });

  it('can be grabbed at the exit and leaves cleanly', () => {
    const onLeft = vi.fn();
    const c = make({ onLeft });
    c.enter(params());
    step(c, 30);
    expect(c.beginDrag(c.pos, 0)).toBe(true);
    c.endDrag(c.pos, 10, true);
    c.leave();
    step(c, 1);
    expect(c.mode).toBe('hidden');
    expect(onLeft).toHaveBeenCalledOnce();
    expect(c.beginDrag(c.pos, 0)).toBe(false);
  });

  it('reduced motion still completes the approach', () => {
    const c = make({}, { reducedMotion: true });
    c.enter(params());
    step(c, 30);
    expect(c.mode).toBe('parked');
  });

  it('produces finite poses every frame in every state', () => {
    const c = make();
    c.enter(params({ gait: 'run' }));
    for (let i = 0; i < 600; i++) {
      const f = c.update(1 / 60);
      for (const v of [
        f.pos.x,
        f.pos.y,
        f.pose.scaleX,
        f.pose.scaleY,
        f.pose.lean,
        f.pose.bodyY,
        f.pose.armL,
      ]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
