/**
 * Applies Poses to the SVG rig. Knows nothing about physics, browsers or Chrome.
 */
import type { CharacterColor } from '../shared/types';
import type { Pose } from './CharacterAnimations';
import { applyPalette, DESIGNS, MOUTHS, type Rig } from './characters/tablin';
import { paletteFor } from './characters/palette';

const r = (n: number) => Math.round(n * 100) / 100;
const TENSION_CIRCUMFERENCE = 2 * Math.PI * 56;

export interface RenderExtras {
  /** 0..1 slingshot charge; draws the tension ring. */
  charge: number;
  /** e.g. "2.4×" — shown while charging. */
  tensionLabel: string | null;
  facing: 1 | -1;
}

export class CharacterRenderer {
  readonly element: HTMLDivElement;
  readonly rig: Rig;
  private readonly label: HTMLDivElement;
  private sizePx: number;
  private lastExpression = '';

  constructor(doc: Document, options: { design?: string; color: CharacterColor; sizePx: number }) {
    const design = DESIGNS[options.design ?? 'tablin'] ?? DESIGNS.tablin!;
    this.rig = design.build(doc);
    this.element = doc.createElement('div');
    this.element.className = 'tb-character';
    this.element.setAttribute('role', 'img');
    this.element.appendChild(this.rig.svg);
    this.label = doc.createElement('div');
    this.label.className = 'tb-tension-label';
    this.element.appendChild(this.label);
    this.sizePx = options.sizePx;
    this.setSize(options.sizePx);
    this.setColor(options.color);
  }

  get size(): number {
    return this.sizePx;
  }

  setColor(color: CharacterColor): void {
    const palette = paletteFor(color);
    applyPalette(this.rig, palette);
    this.element.style.setProperty('--tb-accent', palette.accent);
    this.element.style.setProperty('--tb-outline', palette.outline);
    this.element.dataset.color = color;
  }

  setSize(px: number): void {
    this.sizePx = px;
    this.element.style.width = `${px}px`;
    this.element.style.height = `${px}px`;
  }

  setLabel(text: string): void {
    this.element.setAttribute('aria-label', text);
  }

  /** Positions the character's centre at (x, y) in its container (stage mode). */
  setPosition(x: number, y: number): void {
    const half = this.sizePx / 2;
    this.element.style.transform = `translate3d(${r(x - half)}px, ${r(y - half)}px, 0)`;
  }

  render(pose: Pose, extras: RenderExtras): void {
    const { rig } = this;
    const appear = Math.max(0, Math.min(1, pose.appear));
    this.element.style.opacity = String(r(Math.min(1, appear * 1.4)));

    // Whole character: jump lift, shiver, lean around the feet, enter/leave scale.
    rig.whole.setAttribute(
      'transform',
      `translate(${r(pose.shiverX)} ${r(pose.lift)}) rotate(${r(pose.lean)} 50 92) ` +
        `translate(50 92) scale(${r(appear)}) translate(-50 -92)`,
    );
    rig.body.setAttribute(
      'transform',
      `translate(0 ${r(pose.bodyY)}) translate(50 92) scale(${r(pose.scaleX)} ${r(pose.scaleY)}) translate(-50 -92)`,
    );
    rig.footL.setAttribute('transform', `translate(${r(pose.footL.x)} ${r(pose.footL.y)})`);
    rig.footR.setAttribute('transform', `translate(${r(pose.footR.x)} ${r(pose.footR.y)})`);
    rig.armL.setAttribute('transform', `rotate(${r(pose.armL)} 19 60)`);
    rig.armR.setAttribute('transform', `rotate(${r(-pose.armR)} 81 60)`);

    // Shadow shrinks as the character leaves the ground.
    const air = Math.min(1, Math.abs(Math.min(0, pose.lift)) / 20);
    rig.shadow.setAttribute('rx', String(r(26 * (1 - air * 0.4) * appear)));
    rig.shadow.setAttribute('opacity', String(r(0.18 * (1 - air * 0.5) * appear)));

    // Face
    rig.face.setAttribute('transform', `translate(${r(pose.faceX)} 0)`);
    for (const eye of rig.eyes) {
      const open = pose.eyeShape === 'open';
      eye.open.style.display = open ? '' : 'none';
      eye.closed.style.display = pose.eyeShape === 'closed' ? '' : 'none';
      eye.happy.style.display = pose.eyeShape === 'happy' ? '' : 'none';
      if (open) {
        const k = Math.max(0.08, Math.min(1.15, pose.eyeOpen));
        eye.open.setAttribute(
          'transform',
          `translate(0 ${eye.cy}) scale(1 ${r(k)}) translate(0 ${-eye.cy})`,
        );
        eye.pupil.setAttribute(
          'transform',
          `translate(${r(pose.pupilX * 2.6)} ${r(pose.pupilY * 2.8)})`,
        );
      }
    }
    rig.brows.setAttribute('opacity', String(r(pose.brow)));
    rig.brows.setAttribute('transform', `translate(0 ${r(pose.brow * 2)})`);
    rig.cheeks.setAttribute('opacity', String(r(0.25 + pose.blush * 0.5)));

    if (pose.expression !== this.lastExpression) {
      const mouth = MOUTHS[pose.expression] ?? MOUTHS.happy!;
      rig.mouthStroke.setAttribute('d', mouth.stroke ?? '');
      rig.mouthFill.setAttribute('d', mouth.fill ?? '');
      this.lastExpression = pose.expression;
    }

    rig.sweat.setAttribute('opacity', String(r(pose.sweat)));
    rig.zzz.style.display = pose.zzz ? '' : 'none';
    rig.motion.setAttribute('opacity', String(r(pose.motion)));
    rig.motion.setAttribute('transform', extras.facing === 1 ? '' : 'translate(100 0) scale(-1 1)');

    // Slingshot tension ring
    const charge = Math.max(0, Math.min(1, extras.charge));
    rig.tension.setAttribute(
      'stroke-dasharray',
      `${r(TENSION_CIRCUMFERENCE * charge)} ${r(TENSION_CIRCUMFERENCE)}`,
    );
    const ringVisible = charge > 0.01;
    rig.tension.style.opacity = ringVisible ? '1' : '0';
    rig.tensionTrack.style.opacity = ringVisible ? '0.18' : '0';
    this.element.classList.toggle('tb-charging', ringVisible);
    this.label.textContent = extras.tensionLabel ?? '';
    this.label.style.opacity = extras.tensionLabel ? '1' : '0';
  }
}
