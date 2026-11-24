/**
 * The character's behavioural states and the transitions allowed between them.
 * Pose blending (see CharacterAnimations) smooths every accepted transition.
 */

export const CHARACTER_STATES = [
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
  'tired',
  'reaching',
] as const;

export type CharacterState = (typeof CHARACTER_STATES)[number];

const MOVING: CharacterState[] = ['walking', 'running', 'frustrated'];

/** Allowed transitions. `idle` is always reachable as a safe fallback. */
const TRANSITIONS: Record<CharacterState, readonly CharacterState[]> = {
  idle: ['approaching', ...MOVING, 'dragged', 'celebrating', 'sleeping', 'tired', 'reaching'],
  approaching: [...MOVING, 'dragged', 'reaching'],
  walking: ['running', 'frustrated', 'dragged', 'reaching', 'tired', 'celebrating'],
  running: ['walking', 'frustrated', 'dragged', 'reaching', 'tired', 'celebrating'],
  frustrated: ['walking', 'running', 'dragged', 'reaching', 'tired'],
  dragged: ['charging', ...MOVING, 'tired', 'reaching', 'celebrating'],
  charging: ['launching', 'dragged', ...MOVING],
  launching: ['reaching', 'celebrating', 'dragged', ...MOVING],
  reaching: ['celebrating', 'sleeping', 'dragged', ...MOVING],
  celebrating: ['reaching', 'sleeping', 'dragged', ...MOVING],
  sleeping: ['approaching', 'celebrating', 'dragged', 'reaching'],
  tired: [...MOVING, 'dragged', 'reaching'],
};

export function canTransition(from: CharacterState, to: CharacterState): boolean {
  return from === to || to === 'idle' || TRANSITIONS[from].includes(to);
}

export interface StateChange {
  from: CharacterState;
  to: CharacterState;
  at: number;
}

export class CharacterStateMachine {
  private current: CharacterState;
  private previous: CharacterState;
  private enteredAt: number;

  constructor(
    initial: CharacterState = 'idle',
    now = 0,
    private readonly onChange?: (change: StateChange) => void,
  ) {
    this.current = initial;
    this.previous = initial;
    this.enteredAt = now;
  }

  get state(): CharacterState {
    return this.current;
  }

  get previousState(): CharacterState {
    return this.previous;
  }

  /** Seconds spent in the current state. */
  elapsed(now: number): number {
    return Math.max(0, (now - this.enteredAt) / 1000);
  }

  /** Attempts a transition. Returns false (and changes nothing) if it isn't allowed. */
  transition(to: CharacterState, now: number): boolean {
    if (to === this.current) return true;
    if (!canTransition(this.current, to)) return false;
    const from = this.current;
    this.previous = from;
    this.current = to;
    this.enteredAt = now;
    this.onChange?.({ from, to, at: now });
    return true;
  }

  /** Unconditional reset (e.g. when the character is re-mounted). */
  reset(to: CharacterState, now: number): void {
    this.previous = this.current;
    this.current = to;
    this.enteredAt = now;
  }

  is(...states: CharacterState[]): boolean {
    return states.includes(this.current);
  }
}
