/**
 * The on-page experience: a closed shadow-root layer holding the character, a
 * stand-in for the tab's close button at the top-right, a status chip with a
 * cancel action, and a speech bubble for the cancel window / nudge / reminders.
 *
 * Browser chrome can't be drawn over from an extension, so the character walks
 * along the top edge of the *page* to this stand-in; the actual closing is done
 * by the background worker with chrome.tabs.remove after re-verification.
 */
import { CLOSE_CLICK_MS } from '../../shared/constants';
import type { ApproachPlan, CloseResult } from '../../shared/types';
import { Character, sizeToPx } from '../../character/Character';
import { STAGE } from '../../character/CharacterController';
import { paletteFor } from '../../character/characters/palette';
import { dist, type Vec } from '../../character/CharacterPhysics';
import characterCss from '../../character/character.css?inline';
import overlayCss from './overlay.css?inline';

export interface OverlayCallbacks {
  /** "Not now" / "Keep this tab" / Esc. */
  onSnooze(): void;
  onRequestClose(trigger: 'auto' | 'manual'): Promise<CloseResult>;
  /** The overlay finished leaving and removed itself. */
  onGone(): void;
}

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

function closeIcon(doc: Document): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M3 3 L11 11', 'M11 3 L3 11']) {
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
  }
  return svg;
}

export function prefersReducedMotion(
  pref: ApproachPlan['behavior']['reducedMotion'],
  win: Window,
): boolean {
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const REFUSAL_COPY: Partial<Record<Extract<CloseResult, { ok: false }>['reason'], string>> = {
  pinned: 'This tab is pinned, so {name} will leave it alone.',
  audible: "Something's playing here, so {name} won't close it.",
  'unsaved-input': "You've typed something here. {name} won't risk closing it.",
};

type Phase = 'approach' | 'countdown' | 'nudge' | 'notice' | 'leaving';

export class Overlay {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly layer: HTMLDivElement;
  private readonly exit: HTMLDivElement;
  private readonly exitHint: HTMLSpanElement;
  private readonly chip: HTMLDivElement;
  private readonly chipText: HTMLSpanElement;
  private readonly bubble: HTMLDivElement;
  private readonly live: HTMLDivElement;
  private character: Character;
  private plan: ApproachPlan;
  private phase: Phase = 'approach';
  private countdownRaf = 0;
  private clickTimer: ReturnType<typeof setTimeout> | undefined;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;
  private charPos: Vec = { x: 0, y: 0 };
  private readonly win: Window;

  constructor(
    private readonly doc: Document,
    plan: ApproachPlan,
    private readonly callbacks: OverlayCallbacks,
  ) {
    this.win = doc.defaultView ?? window;
    this.plan = plan;
    this.host = doc.createElement('tablin-overlay');
    this.host.setAttribute('data-tablin', '');
    for (const [prop, value] of [
      ['position', 'fixed'],
      ['inset', '0'],
      ['z-index', '2147483647'],
      ['pointer-events', 'none'],
      ['display', 'block'],
      ['contain', 'strict'],
    ]) {
      this.host.style.setProperty(prop!, value!, 'important');
    }
    this.root = this.host.attachShadow({ mode: 'closed' });
    this.adoptStyles(`${characterCss}\n${overlayCss}`);

    this.layer = h(doc, 'div', { class: 'tb-layer' });
    this.exitHint = h(doc, 'span', { class: 'tb-exit-hint', text: 'this tab' });
    this.exit = h(doc, 'div', { class: 'tb-exit', attrs: { 'aria-hidden': 'true' } }, [
      closeIcon(doc),
      this.exitHint,
    ]);
    this.chipText = h(doc, 'span', { class: 'tb-chip-text' });
    const notNow = h(doc, 'button', {
      class: 'tb-btn tb-ghost tb-small',
      text: 'Not now',
      attrs: { type: 'button' },
    });
    notNow.addEventListener('click', () => this.snooze());
    this.chip = h(doc, 'div', { class: 'tb-chip', attrs: { role: 'status' } }, [
      h(doc, 'span', { class: 'tb-dot' }),
      this.chipText,
      notNow,
    ]);
    this.bubble = h(doc, 'div', {
      class: 'tb-bubble',
      attrs: { role: 'dialog', 'aria-live': 'polite' },
    });
    this.live = h(doc, 'div', { class: 'tb-sr', attrs: { 'aria-live': 'assertive' } });
    this.layer.append(this.exit, this.chip, this.bubble, this.live);
    this.root.append(this.layer);

    this.character = this.createCharacter(plan);
    this.applyAccent(plan);
    this.layout();
  }

  private adoptStyles(css: string): void {
    // Constructable stylesheets aren't subject to the page's style-src CSP.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      this.root.adoptedStyleSheets = [sheet];
    } catch {
      const style = this.doc.createElement('style');
      style.textContent = css;
      this.root.append(style);
    }
  }

  private createCharacter(plan: ApproachPlan): Character {
    const c = plan.character;
    return new Character(
      this.doc,
      {
        color: c.color,
        sizePx: sizeToPx(c.size, this.win.innerWidth),
        intensity: c.intensity,
        reducedMotion: prefersReducedMotion(plan.behavior.reducedMotion, this.win),
        slingshot: plan.behavior.slingshotEnabled,
        sound: plan.behavior.soundEnabled,
        name: c.name,
        mode: 'stage',
        interactive: true,
        cosmetics: plan.cosmetics,
      },
      {
        onArrived: () => this.arrived(),
        onDragStart: () => this.interrupted(),
        onLeft: () => this.gone(),
        onFrame: (frame) => {
          this.charPos = frame.pos;
        },
      },
    );
  }

  private applyAccent(plan: ApproachPlan): void {
    this.layer.style.setProperty('--tb-accent', paletteFor(plan.character.color).accent);
  }

  private layout(): void {
    const size = sizeToPx(this.plan.character.size, this.win.innerWidth);
    Object.assign(this.exit.style, {
      top: `${STAGE.EXIT_TOP}px`,
      right: `${STAGE.EXIT_RIGHT}px`,
      width: `${STAGE.EXIT_SIZE}px`,
      height: `${STAGE.EXIT_SIZE}px`,
    });
    const below = STAGE.TOP_MARGIN + size + 22;
    Object.assign(this.chip.style, { top: `${below}px`, right: `${STAGE.EXIT_RIGHT}px` });
    Object.assign(this.bubble.style, { top: `${below}px`, right: `${STAGE.EXIT_RIGHT}px` });
    this.bubble.style.setProperty(
      '--tb-tail-right',
      `${Math.round(STAGE.EXIT_SIZE + size * 0.42 - 6)}px`,
    );
  }

  // ---------------------------------------------------------------------------

  mount(): void {
    (this.doc.documentElement ?? this.doc.body).appendChild(this.host);
    this.character.mount(this.layer);
    this.win.addEventListener('resize', this.onResize, { passive: true });
    this.win.addEventListener('pointermove', this.onPointer, { passive: true });
    this.win.addEventListener('keydown', this.onKey, true);
    this.start();
  }

  private start(): void {
    const p = this.plan;
    this.phase = 'approach';
    this.character.enter({
      speedMultiplier: p.speedMultiplier,
      speedSetting: p.behavior.speed,
      gait: p.gait,
      mood: p.mood,
    });
    this.exit.classList.add('tb-on', 'tb-pulse');
    this.exitHint.classList.add('tb-show');
    const name = p.character.name;
    this.chipText.textContent =
      p.message ?? (p.autoClose ? `${name} is heading to close this tab` : `${name} wants a word`);
    this.chip.classList.add('tb-on');
    this.announce(`${name} appeared. Press Escape or choose Not now to cancel.`);
  }

  /** Replace the plan (settings changed while visible). */
  update(plan: ApproachPlan): void {
    this.plan = plan;
    this.character.setColor(plan.character.color);
    this.character.setCosmetics(plan.cosmetics);
    this.character.setSound(plan.behavior.soundEnabled);
    this.character.setIntensity(plan.character.intensity);
    this.applyAccent(plan);
  }

  private announce(text: string): void {
    this.live.textContent = text;
  }

  private arrived(): void {
    if (this.phase === 'leaving') return;
    this.chip.classList.remove('tb-on');
    this.exitHint.classList.remove('tb-show');
    this.exit.classList.remove('tb-pulse');
    this.exit.classList.add('tb-pressed');
    if (!this.plan.autoClose) this.showNudge();
    else if (this.plan.closeTimerSeconds > 0)
      this.startCountdown(this.plan.closeTimerSeconds * 1000);
    else this.clickClose();
  }

  /** The user grabbed the character: abandon any countdown; it will try again on arrival. */
  private interrupted(): void {
    if (this.phase === 'leaving') return;
    this.stopTimers();
    clearTimeout(this.sleepTimer);
    this.exit.classList.remove('tb-pressed');
    this.exit.classList.add('tb-pulse');
    this.hideBubble();
    this.phase = 'approach';
  }

  private stopTimers(): void {
    cancelAnimationFrame(this.countdownRaf);
    clearTimeout(this.clickTimer);
    clearTimeout(this.sleepTimer);
  }

  /** Close timer set to 0: the character presses the X as soon as it gets there. */
  private clickClose(): void {
    this.phase = 'countdown';
    this.announce('Closing this tab.');
    this.clickTimer = setTimeout(() => {
      if (this.phase === 'countdown') void this.requestClose('auto');
    }, CLOSE_CLICK_MS);
  }

  private startCountdown(windowMs: number): void {
    this.phase = 'countdown';
    const name = this.plan.character.name;
    const title = h(this.doc, 'p', { class: 'tb-title' });
    const bar = h(this.doc, 'div');
    const keep = h(this.doc, 'button', {
      class: 'tb-btn',
      text: 'Keep this tab',
      attrs: { type: 'button' },
    });
    keep.addEventListener('click', () => this.snooze());
    this.showBubble([
      title,
      h(this.doc, 'p', { class: 'tb-body', text: `${name} caught you on ${this.plan.siteName}.` }),
      h(this.doc, 'div', { class: 'tb-progress' }, [bar]),
      h(this.doc, 'div', { class: 'tb-actions' }, [
        h(this.doc, 'span', { class: 'tb-kbd', text: 'Esc to cancel' }),
        keep,
      ]),
    ]);
    keep.focus({ preventScroll: true });
    this.announce(
      `Closing this tab in ${Math.ceil(windowMs / 1000)} seconds. Press Escape to keep it.`,
    );

    const startedAt = performance.now();
    const tick = (now: number) => {
      if (this.phase !== 'countdown') return;
      const left = Math.max(0, windowMs - (now - startedAt));
      title.textContent = `Closing this tab in ${Math.ceil(left / 1000)}…`;
      bar.style.transform = `scaleX(${left / windowMs})`;
      if (left <= 0) {
        void this.requestClose('auto');
        return;
      }
      this.countdownRaf = requestAnimationFrame(tick);
    };
    this.countdownRaf = requestAnimationFrame(tick);
  }

  private showNudge(): void {
    this.phase = 'nudge';
    const name = this.plan.character.name;
    const close = h(this.doc, 'button', {
      class: 'tb-btn',
      text: 'Close tab',
      attrs: { type: 'button' },
    });
    const later = h(this.doc, 'button', {
      class: 'tb-btn tb-ghost',
      text: '5 more minutes',
      attrs: { type: 'button' },
    });
    close.addEventListener('click', () => {
      this.character.setParkedState('celebrating');
      setTimeout(() => void this.requestClose('manual'), 650);
    });
    later.addEventListener('click', () => this.snooze());
    this.showBubble([
      h(this.doc, 'p', { class: 'tb-title', text: `${name} thinks it's time to focus.` }),
      h(this.doc, 'p', {
        class: 'tb-body',
        text: `You opened ${this.plan.siteName}. Want ${name} to close it for you?`,
      }),
      h(this.doc, 'div', { class: 'tb-actions' }, [later, close]),
    ]);
    this.character.setParkedState('idle');
    this.announce(`${name} thinks it's time to focus. Close tab, or 5 more minutes.`);
    // If ignored, Tablin dozes off in the corner instead of nagging.
    this.sleepTimer = setTimeout(() => {
      if (this.phase === 'nudge') this.character.setParkedState('sleeping');
    }, 20_000);
  }

  private async requestClose(trigger: 'auto' | 'manual'): Promise<void> {
    this.stopTimers();
    let result: CloseResult;
    try {
      result = await this.callbacks.onRequestClose(trigger);
    } catch {
      result = { ok: false, reason: 'not-tracked' };
    }
    if (result.ok) return; // The tab is closing.
    if (result.reason === 'too-soon' && this.phase === 'countdown') {
      // Arrived faster than the worker's minimum on-screen time (e.g. a quick slingshot
      // with a 0 s close timer): keep the hand on the X and press again shortly.
      this.clickTimer = setTimeout(() => {
        if (this.phase === 'countdown') void this.requestClose(trigger);
      }, 400);
      return;
    }
    if (result.reason === 'auto-close-off') {
      this.showNudge();
      return;
    }
    const copy = REFUSAL_COPY[result.reason];
    if (!copy) {
      // Tab switched, URL changed, paused… quietly bow out.
      this.dismiss();
      return;
    }
    this.phase = 'notice';
    const ok = h(this.doc, 'button', {
      class: 'tb-btn',
      text: 'Got it',
      attrs: { type: 'button' },
    });
    ok.addEventListener('click', () => this.snooze());
    this.showBubble([
      h(this.doc, 'p', { class: 'tb-title', text: 'Leaving this one open' }),
      h(this.doc, 'p', {
        class: 'tb-body',
        text: copy.replace('{name}', this.plan.character.name),
      }),
      h(this.doc, 'div', { class: 'tb-actions' }, [ok]),
    ]);
    this.character.setParkedState('idle');
  }

  private showBubble(children: Node[]): void {
    this.bubble.replaceChildren(...children);
    this.bubble.classList.add('tb-on');
  }

  private hideBubble(): void {
    this.bubble.classList.remove('tb-on');
  }

  /** User cancelled: tell the worker, wave goodbye. */
  snooze(): void {
    if (this.phase === 'leaving') return;
    this.callbacks.onSnooze();
    this.dismiss();
  }

  /** Leave without closing anything. */
  dismiss(): void {
    if (this.phase === 'leaving') return;
    this.phase = 'leaving';
    this.stopTimers();
    this.hideBubble();
    this.chip.classList.remove('tb-on');
    this.exit.classList.remove('tb-on', 'tb-pulse', 'tb-pressed');
    this.character.leave();
  }

  private gone(): void {
    this.destroy();
    this.callbacks.onGone();
  }

  get leaving(): boolean {
    return this.phase === 'leaving';
  }

  private onResize = (): void => {
    this.layout();
    this.character.syncLayout();
  };

  private onPointer = (e: PointerEvent): void => {
    const p = { x: e.clientX, y: e.clientY };
    this.character.setLookTarget(dist(p, this.charPos) < 280 ? p : null);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this.phase === 'leaving') return;
    // While dragging, Escape only cancels the drag (handled by DragController).
    if (this.character.controller.mode === 'dragging') return;
    e.stopPropagation();
    this.snooze();
  };

  destroy(): void {
    this.stopTimers();
    this.win.removeEventListener('resize', this.onResize);
    this.win.removeEventListener('pointermove', this.onPointer);
    this.win.removeEventListener('keydown', this.onKey, true);
    this.character.destroy();
    this.host.remove();
  }
}
