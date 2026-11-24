/**
 * Pointer handling for grabbing the character. Only the character element
 * listens for pointerdown; pointer capture keeps the drag smooth even when the
 * cursor outruns it, and is always released on up/cancel/Escape so the page is
 * never left with a stuck pointer.
 */
import type { Vec } from './CharacterPhysics';

export interface DragHandlers {
  canStart(): boolean;
  onStart(point: Vec, time: number): void;
  onMove(point: Vec, time: number): void;
  /** cancelled = Escape, pointercancel or lost capture: no launch. */
  onEnd(point: Vec, time: number, cancelled: boolean): void;
}

export class DragController {
  private pointerId: number | null = null;
  private last: Vec = { x: 0, y: 0 };
  private readonly win: Window;

  constructor(
    private readonly target: HTMLElement,
    private readonly handlers: DragHandlers,
  ) {
    this.win = target.ownerDocument.defaultView ?? window;
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onCancel);
    target.addEventListener('lostpointercapture', this.onLost);
    // Only the character itself opts out of touch scrolling.
    target.style.touchAction = 'none';
  }

  get dragging(): boolean {
    return this.pointerId !== null;
  }

  private point(e: PointerEvent): Vec {
    return { x: e.clientX, y: e.clientY };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null || e.button !== 0 || !this.handlers.canStart()) return;
    e.preventDefault();
    e.stopPropagation();
    this.pointerId = e.pointerId;
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic events; dragging still works via move events.
    }
    this.last = this.point(e);
    this.win.addEventListener('keydown', this.onKey, true);
    this.handlers.onStart(this.last, e.timeStamp);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.last = this.point(e);
    this.handlers.onMove(this.last, e.timeStamp);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.finish(this.point(e), e.timeStamp, false);
  };

  private onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.finish(this.last, e.timeStamp, true);
  };

  private onLost = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    // Lost capture without a pointerup (e.g. the window lost focus): release safely.
    this.finish(this.last, e.timeStamp, true);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this.pointerId === null) return;
    e.preventDefault();
    e.stopPropagation();
    this.finish(this.last, e.timeStamp, true);
  };

  /** Ends any drag in progress (e.g. when the character is dismissed). */
  cancel(): void {
    if (this.pointerId !== null) this.finish(this.last, performance.now(), true);
  }

  private finish(point: Vec, time: number, cancelled: boolean): void {
    const id = this.pointerId;
    this.pointerId = null;
    this.win.removeEventListener('keydown', this.onKey, true);
    if (id !== null) {
      try {
        if (this.target.hasPointerCapture(id)) this.target.releasePointerCapture(id);
      } catch {
        // already released
      }
    }
    this.handlers.onEnd(point, time, cancelled);
  }

  destroy(): void {
    this.cancel();
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onCancel);
    this.target.removeEventListener('lostpointercapture', this.onLost);
  }
}
