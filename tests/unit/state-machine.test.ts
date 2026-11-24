import { describe, expect, it } from 'vitest';
import {
  canTransition,
  CharacterStateMachine,
  CHARACTER_STATES,
} from '../../src/character/CharacterStateMachine';

describe('character state machine', () => {
  it('has all ten required states (plus helpers)', () => {
    for (const s of [
      'idle',
      'walking',
      'running',
      'approaching',
      'dragged',
      'charging',
      'launching',
      'celebrating',
      'sleeping',
      'frustrated',
    ]) {
      expect(CHARACTER_STATES).toContain(s);
    }
  });

  it('allows the slingshot path dragged → charging → launching → reaching', () => {
    const sm = new CharacterStateMachine('walking');
    expect(sm.transition('dragged', 1)).toBe(true);
    expect(sm.transition('charging', 2)).toBe(true);
    expect(sm.transition('launching', 3)).toBe(true);
    expect(sm.transition('reaching', 4)).toBe(true);
  });

  it('rejects nonsensical transitions', () => {
    expect(canTransition('sleeping', 'launching')).toBe(false);
    expect(canTransition('walking', 'launching')).toBe(false);
    expect(canTransition('idle', 'charging')).toBe(false);
    const sm = new CharacterStateMachine('sleeping');
    expect(sm.transition('launching', 1)).toBe(false);
    expect(sm.state).toBe('sleeping');
  });

  it('idle is always reachable', () => {
    for (const s of CHARACTER_STATES) expect(canTransition(s, 'idle')).toBe(true);
  });

  it('tracks elapsed time and notifies on change', () => {
    const changes: string[] = [];
    const sm = new CharacterStateMachine('idle', 0, (c) => changes.push(`${c.from}>${c.to}`));
    sm.transition('walking', 1000);
    expect(sm.elapsed(2500)).toBe(1.5);
    expect(sm.previousState).toBe('idle');
    sm.transition('walking', 3000); // no-op
    expect(changes).toEqual(['idle>walking']);
  });
});
