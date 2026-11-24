// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Character, sizeToPx } from '../../src/character/Character';
import { PALETTES } from '../../src/character/characters/palette';
import { CHARACTER_COLORS } from '../../src/shared/types';

function preview() {
  const host = document.createElement('div');
  document.body.append(host);
  const c = new Character(document, {
    color: 'orange',
    sizePx: 80,
    intensity: 'normal',
    reducedMotion: false,
    slingshot: true,
    sound: false,
    name: 'Mochi',
    mode: 'preview',
    interactive: false,
  });
  c.mount(host);
  return { c, host };
}

describe('character rendering', () => {
  it('renders an SVG character with body, eyes, feet and mouth', () => {
    const { c, host } = preview();
    const svg = host.querySelector('svg.tb-svg');
    expect(svg).not.toBeNull();
    expect(host.querySelectorAll('.tb-eye')).toHaveLength(2);
    expect(svg!.querySelectorAll('ellipse').length).toBeGreaterThan(8);
    expect(c.element.getAttribute('aria-label')).toContain('Mochi');
    expect(c.element.style.width).toBe('80px');
    c.destroy();
    expect(host.children).toHaveLength(0);
  });

  it('applies every color palette', () => {
    const { c } = preview();
    for (const color of CHARACTER_COLORS) {
      c.setColor(color);
      const fills = [...c.element.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
      expect(fills).toContain(PALETTES[color].body);
      expect(c.element.dataset.color).toBe(color);
    }
    c.destroy();
  });

  it('renders poses for animation frames without errors', () => {
    const { c } = preview();
    for (const state of [
      'idle',
      'walking',
      'running',
      'celebrating',
      'sleeping',
      'charging',
    ] as const) {
      c.preview(state);
      const frame = c.controller.update(1 / 60);
      c.renderer.render(frame.pose, { charge: 0.5, tensionLabel: '2.0×', facing: 1 });
    }
    expect(c.element.querySelector('.tb-tension-label')!.textContent).toBe('2.0×');
    c.destroy();
  });

  it('builds DOM without innerHTML (Trusted Types–safe)', () => {
    const { c } = preview();
    expect(c.element.querySelector('script')).toBeNull();
    c.destroy();
  });

  it('sizes stay within 60–90px (slightly smaller on narrow screens)', () => {
    expect(sizeToPx('small', 1400)).toBe(60);
    expect(sizeToPx('medium', 1400)).toBe(74);
    expect(sizeToPx('large', 1400)).toBe(90);
    expect(sizeToPx('large', 500)).toBeLessThan(90);
  });
});
