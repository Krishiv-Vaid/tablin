/**
 * The character's brain: movement modes, physics integration, drag/slingshot,
 * and pose selection. Headless — it produces Frames; Character.ts renders them.
 * Driven by update(dt) so it can be tested deterministically without a browser.
 */
import type { Gait, Mood } from '../shared/types';
import {
  approach,
  bounceInside,
  clamp,
  clampDrag,
  dist,
  launchSpring,
  launchVelocity,
  len,
  PHYSICS,
  pullProgress,
  smoothing,
  springStep,
  sub,
  tensionMultiplier,
  updateCharge,
  vec,
  velocityFromSamples,
  type Bounds,
  type PointerSample,
  type SpringConfig,
  type Vec,
} from './CharacterPhysics';
import { CharacterStateMachine, type CharacterState } from './CharacterStateMachine';
import {
  Blinker,
  blendPose,
  computePose,
  LookAround,
  neutralPose,
  type Pose,
} from './CharacterAnimations';

export type ControllerMode =
  | 'hidden'
  | 'preview'
  | 'entering'
  | 'moving'
  | 'dragging'
  | 'launching'
  | 'falling'
  | 'resting'
  | 'arriving'
  | 'parked'
  | 'leaving';

export interface Layout {
  width: number;
  height: number;
}

/** Shared with the overlay so the exit button and the character's destination line up. */
export const STAGE = {
  TOP_MARGIN: 12,
  EXIT_RIGHT: 14,
  EXIT_TOP: 10,
  EXIT_SIZE: 36,
} as const;

export interface ControllerConfig {
  sizePx: number;
  intensity: number;
  reducedMotion: boolean;
  slingshot: boolean;
}

export interface ApproachParams {
  speedMultiplier: number;
  /** User's base speed setting (0.5–2). */
  speedSetting: number;
  gait: Gait;
  mood: Mood;
}

export interface ControllerEvents {
  onStateChange?(state: CharacterState): void;
  onArrived?(): void;
  onDragStart?(): void;
  onLaunch?(charge: number, multiplier: number): void;
  onDrop?(): void;
  onLeft?(): void;
}

export interface Frame {
  pos: Vec;
  pose: Pose;
  charge: number;
  tensionLabel: string | null;
  facing: 1 | -1;
  state: CharacterState;
  mode: ControllerMode;
}

const DEFAULT_PARAMS: ApproachParams = {
  speedMultiplier: 1,
  speedSetting: 1,
  gait: 'walk',
  mood: 'casual',
};
const BLEND_SECONDS = 0.18;
const RUN_SPEED = 300;

export class CharacterController {
  mode: ControllerMode = 'hidden';
  pos: Vec = vec();
  vel: Vec = vec();
  facing: 1 | -1 = 1;

  private readonly sm: CharacterStateMachine;
  private time = 0;
  private modeTime = 0;
  private layout: Layout;
  private params: ApproachParams = DEFAULT_PARAMS;
  private speed = 0;
  private phase = 0;
  private appear = 0;

  private charge = 0;
  private holdSeconds = 0;
  private dragOrigin: Vec = vec();
  private grabOffset: Vec = vec();
  private desired: Vec = vec();
  private samples: PointerSample[] = [];
  private dragCount = 0;
  private tiredShown = false;
  private launchCfg: SpringConfig = { stiffness: 40, dampingRatio: 0.62 };
  private launchCharge = 0;
  private lastLaunchMultiplier = 1;

  private readonly blinker = new Blinker(3);
  private readonly look = new LookAround(11);
  private lookOverride: Vec | null = null;
  private poseFrom: Pose = neutralPose();
  private lastPose: Pose = neutralPose();
  private blendStart = -1;

  constructor(
    private config: ControllerConfig,
    private readonly events: ControllerEvents = {},
    layout: Layout = { width: 1280, height: 800 },
  ) {
    this.layout = layout;
    this.sm = new CharacterStateMachine('idle', 0, ({ to }) => {
      this.poseFrom = this.lastPose;
      this.blendStart = this.time;
      this.events.onStateChange?.(to);
    });
  }

  // ---------------------------------------------------------------------------
  // Geometry

  get state(): CharacterState {
    return this.sm.state;
  }

  get currentCharge(): number {
    return this.charge;
  }

  get dragsThisAppearance(): number {
    return this.dragCount;
  }

  get trackY(): number {
    return STAGE.TOP_MARGIN + this.config.sizePx / 2 + 2;
  }

  get target(): Vec {
    const x = this.layout.width - STAGE.EXIT_RIGHT - STAGE.EXIT_SIZE - this.config.sizePx * 0.42;
    return { x: Math.max(this.config.sizePx, x), y: this.trackY };
  }

  get start(): Vec {
    return { x: Math.max(this.config.sizePx * 0.8, this.layout.width * 0.06), y: this.trackY };
  }

  get bounds(): Bounds {
    const h = this.config.sizePx / 2;
    return {
      minX: h,
      minY: h + 2,
      maxX: Math.max(h, this.layout.width - h),
      maxY: Math.max(h + 2, this.layout.height - h),
    };
  }

  /** How far back counts as a full pull, and the hard drag radius. */
  get maxPull(): number {
    return clamp(Math.min(this.layout.width, this.layout.height) * 0.32, 120, 300);
  }

  get maxDrag(): number {
    return this.maxPull * 1.3;
  }

  /** Base walking speed: crosses most viewports in ~9 s at 1×. */
  get baseSpeed(): number {
    return clamp(this.layout.width / 9, 80, 220) * this.params.speedSetting;
  }

  get cruiseSpeed(): number {
    return Math.min(PHYSICS.MAX_WALK_SPEED, this.baseSpeed * this.params.speedMultiplier);
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    if (this.mode === 'parked') this.pos = this.target;
    const b = this.bounds;
    this.pos = { x: clamp(this.pos.x, b.minX, b.maxX), y: clamp(this.pos.y, b.minY, b.maxY) };
  }

  setConfig(config: Partial<ControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setLookTarget(point: Vec | null): void {
    if (!point) {
      this.lookOverride = null;
      return;
    }
    const d = sub(point, this.pos);
    const l = len(d);
    this.lookOverride =
      l < 1 ? { x: 0, y: 0 } : { x: d.x / Math.max(l, 120), y: d.y / Math.max(l, 120) };
  }

  // ---------------------------------------------------------------------------
  // Commands

  private setMode(mode: ControllerMode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  private movingState(): CharacterState {
    if (this.params.mood === 'frustrated') return 'frustrated';
    if (this.params.gait === 'run' || this.speed > RUN_SPEED) return 'running';
    return 'walking';
  }

  /** Pop in at the left of the top edge, notice the page, then head for the exit. */
  enter(params: ApproachParams): void {
    this.params = { ...params };
    this.pos = this.start;
    this.vel = vec();
    this.speed = 0;
    this.appear = 0;
    this.charge = 0;
    this.dragCount = 0;
    this.tiredShown = false;
    this.facing = 1;
    this.sm.reset('approaching', this.nowMs);
    this.blendStart = -1;
    this.setMode('entering');
  }

  /** Static preview (popup/settings): stays put and animates in place. */
  showPreview(state: CharacterState = 'idle'): void {
    this.pos = { x: this.layout.width / 2, y: this.layout.height / 2 };
    this.appear = 1;
    this.sm.reset(state, this.nowMs);
    this.blendStart = -1;
    this.setMode('preview');
  }

  setPreviewState(state: CharacterState): void {
    if (this.mode !== 'preview') return;
    if (!this.sm.transition(state, this.nowMs)) this.sm.reset(state, this.nowMs);
  }

  /** At the exit: choose what to do while waiting (reaching, idle, sleeping, celebrating). */
  setParkedState(state: CharacterState): void {
    if (this.mode !== 'parked') return;
    this.sm.transition(state, this.nowMs);
  }

  /** Leave the exit and walk back to it again (e.g. after the user grabbed it there). */
  resumeApproach(): void {
    if (this.mode === 'parked') {
      this.launchCharge = 0;
      this.setMode('arriving');
      this.sm.transition('reaching', this.nowMs);
    }
  }

  leave(): void {
    if (this.mode === 'hidden') return;
    this.setMode('leaving');
  }

  hide(): void {
    this.setMode('hidden');
    this.appear = 0;
  }

  get canGrab(): boolean {
    return ['entering', 'moving', 'launching', 'falling', 'resting', 'arriving', 'parked'].includes(
      this.mode,
    );
  }

  beginDrag(point: Vec, timeMs: number): boolean {
    if (!this.canGrab) return false;
    this.dragOrigin = { ...this.pos };
    this.grabOffset = sub(this.pos, point);
    this.desired = { ...this.pos };
    this.samples = [{ ...point, t: timeMs }];
    this.charge = 0;
    this.holdSeconds = 0;
    this.vel = vec();
    this.appear = 1;
    this.dragCount += 1;
    this.setMode('dragging');
    this.sm.transition('dragged', this.nowMs);
    this.events.onDragStart?.();
    return true;
  }

  dragTo(point: Vec, timeMs: number): void {
    if (this.mode !== 'dragging') return;
    const wanted = { x: point.x + this.grabOffset.x, y: point.y + this.grabOffset.y };
    this.desired = clampDrag(this.dragOrigin, wanted, this.maxDrag, this.bounds);
    this.samples.push({ ...point, t: timeMs });
    if (this.samples.length > 12) this.samples.shift();
  }

  endDrag(_point: Vec, _timeMs: number, cancelled: boolean): void {
    if (this.mode !== 'dragging') return;
    const target = this.target;
    const canLaunch =
      this.config.slingshot && !cancelled && this.charge >= PHYSICS.LAUNCH_THRESHOLD;
    if (canLaunch) {
      this.launchCharge = this.charge;
      this.lastLaunchMultiplier = tensionMultiplier(this.charge);
      this.vel = launchVelocity(this.pos, target, this.charge, this.cruiseSpeed);
      this.launchCfg = launchSpring(this.charge, this.config.reducedMotion);
      this.setMode('launching');
      this.sm.transition('launching', this.nowMs);
      this.events.onLaunch?.(this.charge, this.lastLaunchMultiplier);
      return;
    }
    this.launchCharge = 0;
    this.charge = 0;
    this.sm.transition('dragged', this.nowMs);
    if (dist(this.pos, target) < 30) {
      this.setMode('arriving');
      this.sm.transition('reaching', this.nowMs);
      return;
    }
    this.vel = cancelled ? vec() : velocityFromSamples(this.samples);
    this.vel = { x: this.vel.x * 0.3, y: this.vel.y * 0.3 };
    this.setMode('falling');
  }

  // ---------------------------------------------------------------------------
  // Simulation

  update(dtSeconds: number): Frame {
    const dt = clamp(dtSeconds, 0, 1 / 20);
    this.time += dt;
    this.modeTime += dt;
    const target = this.target;

    switch (this.mode) {
      case 'hidden':
        break;

      case 'preview':
        if (this.sm.is('walking', 'running', 'frustrated')) {
          this.phase += dt * (this.sm.is('walking') ? 7 : 12);
        }
        // Show the elastic stretch breathing in and out.
        this.charge = this.sm.is('charging') ? 0.55 + 0.35 * Math.sin(this.time * 2.2) : 0;
        break;

      case 'entering': {
        this.appear = approach(this.appear, 1, this.config.reducedMotion ? 5 : 3.2, dt);
        this.facing = 1;
        if (this.modeTime >= (this.config.reducedMotion ? 0.35 : 0.95)) {
          this.setMode('moving');
          this.sm.transition(this.movingState(), this.nowMs);
        }
        break;
      }

      case 'moving': {
        // Urgency builds: start at ~55% of cruise speed and ramp up over 2.5 s.
        const urgency = 0.55 + 0.45 * clamp(this.modeTime / 2.5, 0, 1);
        const cruise = this.cruiseSpeed * urgency;
        this.speed = approach(this.speed, cruise, Math.max(160, this.cruiseSpeed * 1.4), dt);
        const dx = target.x - this.pos.x;
        const dir = dx >= 0 ? 1 : -1;
        this.facing = dir;
        const step = Math.min(Math.abs(dx), this.speed * dt);
        this.pos = {
          x: this.pos.x + dir * step,
          y: this.pos.y + (this.trackY - this.pos.y) * smoothing(10, dt),
        };
        this.vel = { x: dir * this.speed, y: 0 };
        const stride = this.config.sizePx * (this.sm.is('walking') ? 0.55 : 0.85);
        this.phase += (step / stride) * Math.PI * 2;
        const next = this.movingState();
        if (next !== this.sm.state) this.sm.transition(next, this.nowMs);
        if (Math.abs(dx) < 1.5) {
          this.setMode('arriving');
          this.sm.transition('reaching', this.nowMs);
        }
        break;
      }

      case 'dragging': {
        const followed = springStep(
          this.pos,
          this.vel,
          this.desired,
          { stiffness: 700, dampingRatio: 0.82 },
          dt,
        );
        const b = this.bounds;
        this.pos = {
          x: clamp(followed.pos.x, b.minX, b.maxX),
          y: clamp(followed.pos.y, b.minY, b.maxY),
        };
        this.vel = followed.vel;
        const pull = pullProgress(this.dragOrigin, this.pos, target, this.maxPull);
        if (pull > 0.1) this.holdSeconds += dt;
        else if (pull < 0.05) this.holdSeconds = 0;
        this.charge = this.config.slingshot
          ? updateCharge(this.charge, pull, this.holdSeconds, dt)
          : 0;
        this.facing = target.x >= this.pos.x ? 1 : -1;
        const wanted: CharacterState = this.charge > PHYSICS.CHARGE_START ? 'charging' : 'dragged';
        if (wanted !== this.sm.state) this.sm.transition(wanted, this.nowMs);
        break;
      }

      case 'launching': {
        const stepped = springStep(this.pos, this.vel, target, this.launchCfg, dt);
        const bounced = bounceInside(stepped.pos, stepped.vel, this.bounds);
        this.pos = bounced.pos;
        this.vel = bounced.vel;
        this.charge = approach(this.charge, 0, 2.5, dt);
        if (Math.abs(this.vel.x) > 30) this.facing = this.vel.x > 0 ? 1 : -1;
        if ((dist(this.pos, target) < 6 && len(this.vel) < 80) || this.modeTime > 4) {
          this.vel = vec();
          this.charge = 0;
          this.setMode('arriving');
          this.sm.transition(this.launchCharge > 0.45 ? 'celebrating' : 'reaching', this.nowMs);
        }
        break;
      }

      case 'falling': {
        const stepped = springStep(
          this.pos,
          this.vel,
          { x: this.pos.x, y: this.trackY },
          { stiffness: 140, dampingRatio: 0.6 },
          dt,
        );
        const bounced = bounceInside(stepped.pos, stepped.vel, this.bounds);
        this.pos = bounced.pos;
        this.vel = bounced.vel;
        if (Math.abs(this.pos.y - this.trackY) < 2 && len(this.vel) < 40) {
          this.pos = { x: this.pos.x, y: this.trackY };
          this.vel = vec();
          this.events.onDrop?.();
          if (this.dragCount >= 3 && !this.tiredShown) {
            this.tiredShown = true;
            this.setMode('resting');
            this.sm.transition('tired', this.nowMs);
          } else {
            this.speed = this.cruiseSpeed * 0.4;
            this.setMode('moving');
            this.sm.transition(this.movingState(), this.nowMs);
          }
        }
        break;
      }

      case 'resting':
        if (this.modeTime >= 1.6) {
          this.speed = 0;
          this.setMode('moving');
          this.sm.transition(this.movingState(), this.nowMs);
        }
        break;

      case 'arriving': {
        this.pos = {
          x: this.pos.x + (target.x - this.pos.x) * smoothing(14, dt),
          y: this.pos.y + (target.y - this.pos.y) * smoothing(14, dt),
        };
        this.facing = 1;
        if (this.sm.is('celebrating') && this.modeTime > 0.65)
          this.sm.transition('reaching', this.nowMs);
        if (this.sm.is('reaching') && this.modeTime >= (this.launchCharge > 0.45 ? 1.4 : 0.75)) {
          this.pos = { ...target };
          this.setMode('parked');
          this.events.onArrived?.();
        }
        break;
      }

      case 'parked':
        this.pos = this.target;
        break;

      case 'leaving':
        this.appear = approach(this.appear, 0, this.config.reducedMotion ? 6 : 4, dt);
        if (this.appear <= 0) {
          this.setMode('hidden');
          this.events.onLeft?.();
        }
        break;
    }

    if (this.mode !== 'entering' && this.mode !== 'leaving' && this.mode !== 'hidden') {
      this.appear = approach(this.appear, 1, 5, dt);
    }

    return this.frame(dt);
  }

  private frame(dt: number): Frame {
    const look = this.look.value(this.time, dt, this.lookOverride);
    const computed = computePose({
      state: this.sm.state,
      t: this.sm.elapsed(this.nowMs),
      time: this.time,
      phase: this.phase,
      facing: this.facing,
      intensity: this.config.intensity,
      reduced: this.config.reducedMotion,
      charge: this.charge,
      velocity: this.vel,
      look,
      blink: this.blinker.value(this.time),
      mood: this.params.mood,
      appear: this.appear,
    });
    let pose = computed;
    if (this.blendStart >= 0) {
      const k = clamp((this.time - this.blendStart) / BLEND_SECONDS, 0, 1);
      pose = blendPose(this.poseFrom, computed, 1 - Math.pow(1 - k, 2));
      if (k >= 1) this.blendStart = -1;
    }
    this.lastPose = pose;
    const charging = this.mode === 'dragging' && this.charge > PHYSICS.CHARGE_START;
    return {
      pos: { ...this.pos },
      pose,
      charge: this.mode === 'dragging' || this.mode === 'launching' ? this.charge : 0,
      tensionLabel: charging ? `${tensionMultiplier(this.charge).toFixed(1)}×` : null,
      facing: this.facing,
      state: this.sm.state,
      mode: this.mode,
    };
  }

  /** The controller's own clock in ms (advanced only by update()). */
  private get nowMs(): number {
    return this.time * 1000;
  }
}
