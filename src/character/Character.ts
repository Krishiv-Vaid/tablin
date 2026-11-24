/**
 * Public facade of the character engine. Owns the DOM element, the animation
 * loop, pointer dragging and sounds. Browser-agnostic: no chrome.* APIs, so the
 * same engine can drive the content-script overlay, the popup preview, or a
 * future native/desktop companion's web view.
 */
import type { AnimationIntensity, CharacterColor } from '../shared/types';
import { INTENSITY_FACTOR } from './CharacterAnimations';
import {
  CharacterController,
  type ApproachParams,
  type ControllerEvents,
  type Frame,
  type Layout,
} from './CharacterController';
import { CharacterRenderer } from './CharacterRenderer';
import { CharacterSound } from './CharacterSound';
import type { CharacterState } from './CharacterStateMachine';
import { DragController } from './DragController';
import type { Vec } from './CharacterPhysics';

export interface CharacterOptions {
  color: CharacterColor;
  sizePx: number;
  intensity: AnimationIntensity;
  reducedMotion: boolean;
  slingshot: boolean;
  sound: boolean;
  name: string;
  /** 'stage' = positioned in a full-viewport layer; 'preview' = sits in its container. */
  mode: 'stage' | 'preview';
  interactive: boolean;
}

export interface CharacterEvents extends ControllerEvents {
  onFrame?(frame: Frame): void;
}

export class Character {
  readonly renderer: CharacterRenderer;
  readonly controller: CharacterController;
  private readonly sound: CharacterSound;
  private drag: DragController | null = null;
  private raf = 0;
  private lastTs = 0;
  private running = false;
  private readonly win: Window;

  constructor(
    private readonly doc: Document,
    private options: CharacterOptions,
    private readonly events: CharacterEvents = {},
  ) {
    this.win = doc.defaultView ?? window;
    this.renderer = new CharacterRenderer(doc, { color: options.color, sizePx: options.sizePx });
    this.renderer.element.classList.add(options.mode === 'stage' ? 'tb-stage' : 'tb-preview');
    this.renderer.setLabel(`${options.name}, your focus companion`);
    this.sound = new CharacterSound(options.sound);

    const layout: Layout =
      options.mode === 'preview'
        ? { width: options.sizePx, height: options.sizePx }
        : { width: this.win.innerWidth, height: this.win.innerHeight };

    this.controller = new CharacterController(
      {
        sizePx: options.sizePx,
        intensity: INTENSITY_FACTOR[options.intensity],
        reducedMotion: options.reducedMotion,
        slingshot: options.slingshot,
      },
      {
        ...events,
        onArrived: () => {
          this.sound.play('arrive');
          events.onArrived?.();
        },
        onLaunch: (charge, multiplier) => {
          this.sound.play('launch');
          events.onLaunch?.(charge, multiplier);
        },
        onDragStart: () => {
          this.sound.play('grab');
          events.onDragStart?.();
        },
        onLeft: () => {
          events.onLeft?.();
        },
      },
      layout,
    );

    if (options.interactive) {
      this.drag = new DragController(this.renderer.element, {
        canStart: () => this.controller.canGrab,
        onStart: (p, t) => {
          this.controller.beginDrag(p, t);
          this.renderer.element.classList.add('tb-grabbing');
        },
        onMove: (p, t) => this.controller.dragTo(p, t),
        onEnd: (p, t, cancelled) => {
          this.controller.endDrag(p, t, cancelled);
          this.renderer.element.classList.remove('tb-grabbing');
        },
      });
    }
  }

  get element(): HTMLDivElement {
    return this.renderer.element;
  }

  get state(): CharacterState {
    return this.controller.state;
  }

  mount(parent: Node): void {
    parent.appendChild(this.renderer.element);
    if (this.options.mode === 'preview') this.controller.showPreview('idle');
    this.start();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    this.raf = this.win.requestAnimationFrame(this.loop);
  }

  private stop(): void {
    this.running = false;
    this.win.cancelAnimationFrame(this.raf);
  }

  private loop = (ts: number): void => {
    if (!this.running) return;
    const dt = this.lastTs ? (ts - this.lastTs) / 1000 : 1 / 60;
    this.lastTs = ts;
    const frame = this.controller.update(dt);
    this.renderer.render(frame.pose, {
      charge: frame.charge,
      tensionLabel: frame.tensionLabel,
      facing: frame.facing,
    });
    if (this.options.mode === 'stage') this.renderer.setPosition(frame.pos.x, frame.pos.y);
    this.renderer.element.dataset.state = frame.state;
    this.renderer.element.dataset.mode = frame.mode;
    this.events.onFrame?.(frame);
    if (frame.mode === 'hidden' && this.options.mode === 'stage') {
      this.stop();
      return;
    }
    this.raf = this.win.requestAnimationFrame(this.loop);
  };

  /** Re-reads the viewport size (call on resize). */
  syncLayout(): void {
    if (this.options.mode === 'stage') {
      this.controller.setLayout({ width: this.win.innerWidth, height: this.win.innerHeight });
    }
  }

  enter(params: ApproachParams): void {
    this.syncLayout();
    this.controller.enter(params);
    this.sound.play('appear');
    this.start();
  }

  leave(): void {
    this.drag?.cancel();
    this.controller.leave();
    this.start();
  }

  hide(): void {
    this.drag?.cancel();
    this.controller.hide();
  }

  preview(state: CharacterState): void {
    this.controller.setPreviewState(state);
  }

  setParkedState(state: CharacterState): void {
    if (state === 'celebrating') this.sound.play('celebrate');
    this.controller.setParkedState(state);
  }

  resumeApproach(): void {
    this.controller.resumeApproach();
  }

  setLookTarget(point: Vec | null): void {
    this.controller.setLookTarget(point);
  }

  setColor(color: CharacterColor): void {
    this.options = { ...this.options, color };
    this.renderer.setColor(color);
  }

  setSize(sizePx: number): void {
    this.options = { ...this.options, sizePx };
    this.renderer.setSize(sizePx);
    this.controller.setConfig({ sizePx });
  }

  setIntensity(intensity: AnimationIntensity): void {
    this.controller.setConfig({ intensity: INTENSITY_FACTOR[intensity] });
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.controller.setConfig({ reducedMotion });
  }

  setSound(enabled: boolean): void {
    this.sound.setEnabled(enabled);
  }

  destroy(): void {
    this.stop();
    this.drag?.destroy();
    this.sound.destroy();
    this.renderer.element.remove();
  }
}

/** Pixel size for a size setting, scaled down a little on narrow viewports. */
export function sizeToPx(size: 'small' | 'medium' | 'large', viewportWidth: number): number {
  const base = size === 'small' ? 60 : size === 'large' ? 90 : 74;
  const factor = viewportWidth < 700 ? 0.85 : 1;
  return Math.round(Math.max(52, base * factor));
}
