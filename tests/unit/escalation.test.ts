import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  currentCount,
  effectiveDelayMs,
  escalationProgress,
  levelForCount,
  periodKey,
  speedMultiplierForLevel,
} from '../../src/background/escalation-manager';
import { defaultSettings } from '../../src/shared/settings';
import type { BehaviorSettings } from '../../src/shared/types';

const behavior = (patch: Partial<BehaviorSettings> = {}) => ({
  ...defaultSettings().behavior,
  ...patch,
});

describe('escalation', () => {
  it('levels go 1..5 and stay capped', () => {
    expect([0, 1, 2, 3, 4, 5, 10, 999].map(levelForCount)).toEqual([1, 2, 3, 4, 5, 5, 5, 5]);
    expect(levelForCount(-3)).toBe(1);
  });

  it('speed starts at 1× and reaches exactly the configured max at level 5', () => {
    const b = behavior({ maxSpeedMultiplier: 2.5, escalationCurve: 'linear' });
    expect(speedMultiplierForLevel(1, b)).toBe(1);
    expect(speedMultiplierForLevel(5, b)).toBe(2.5);
    expect(speedMultiplierForLevel(50, b)).toBe(2.5);
  });

  it('is monotonic for every curve', () => {
    for (const curve of ['gentle', 'linear', 'steep'] as const) {
      const values = [1, 2, 3, 4, 5].map((l) =>
        speedMultiplierForLevel(l, behavior({ escalationCurve: curve })),
      );
      for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('curves differ in shape: steep ramps early, gentle late', () => {
    expect(escalationProgress(2, 'steep')).toBeGreaterThan(escalationProgress(2, 'linear'));
    expect(escalationProgress(2, 'gentle')).toBeLessThan(escalationProgress(2, 'linear'));
    expect(escalationProgress(5, 'gentle')).toBe(1);
  });

  it('never exceeds the hard 3× cap even with corrupted settings', () => {
    expect(speedMultiplierForLevel(5, behavior({ maxSpeedMultiplier: 50 }))).toBe(3);
  });

  it('disabled escalation is always 1× and keeps the base delay', () => {
    const b = behavior({ escalationEnabled: false });
    expect(speedMultiplierForLevel(5, b)).toBe(1);
    expect(effectiveDelayMs(12_000, 5, false)).toBe(12_000);
  });

  it('notices sooner at higher levels but never below the floor', () => {
    expect(effectiveDelayMs(12_000, 1, true)).toBe(12_000);
    expect(effectiveDelayMs(12_000, 2, true)).toBeLessThan(12_000);
    expect(effectiveDelayMs(12_000, 5, true)).toBe(6_000);
    expect(effectiveDelayMs(5_000, 5, true)).toBe(4_000);
    expect(effectiveDelayMs(3_000, 5, true)).toBe(3_000);
  });

  it('period keys reset daily or per session', () => {
    const t = new Date(2026, 10, 24, 23, 0).getTime();
    expect(periodKey('daily', t, 's1')).toBe('day:2026-11-24');
    expect(periodKey('daily', t + 2 * 3600_000, 's1')).toBe('day:2026-11-25');
    expect(periodKey('session', t, 's1')).toBe('session:s1');
    expect(currentCount({ count: 4, periodKey: 'day:2026-11-24' }, 'day:2026-11-24')).toBe(4);
    expect(currentCount({ count: 4, periodKey: 'day:2026-11-23' }, 'day:2026-11-24')).toBe(0);
  });

  it('plans escalate: walk → run → message → frustrated', () => {
    const s = defaultSettings();
    const plans = [1, 2, 3, 4, 5].map((l) => buildPlan(l, s, 'YouTube'));
    expect(plans[0]).toMatchObject({
      gait: 'walk',
      mood: 'casual',
      message: null,
      speedMultiplier: 1,
    });
    expect(plans[1]!.mood).toBe('curious');
    expect(plans[2]).toMatchObject({ gait: 'run', mood: 'determined' });
    expect(plans[3]!.message).toContain('YouTube again');
    expect(plans[4]).toMatchObject({
      mood: 'frustrated',
      speedMultiplier: s.behavior.maxSpeedMultiplier,
    });
    expect(plans[0]!.autoClose).toBe(false);
    expect(plans[0]!.closeTimerSeconds).toBe(0);
    expect(buildPlan(1, { ...s, closeTimerSeconds: 4 }, 'YouTube').closeTimerSeconds).toBe(4);
  });
});
