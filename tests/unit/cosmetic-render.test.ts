// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Character } from '../../src/character/Character';
import { CharacterController } from '../../src/character/CharacterController';
import { COSMETIC_ART_IDS } from '../../src/character/characters/cosmetics-art';
import { COSMETICS } from '../../src/shared/cosmetics';
import type { Equipped } from '../../src/shared/types';

function make(cosmetics: Partial<Equipped> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const c = new Character(document, {
    color: 'orange',
    sizePx: 80,
    intensity: 'normal',
    reducedMotion: false,
    slingshot: true,
    sound: false,
    name: 'Tablin',
    mode: 'preview',
    interactive: false,
    cosmetics,
  });
  c.mount(host);
  return c;
}

describe('cosmetics on the existing renderer', () => {
  it('every non-color cosmetic has artwork', () => {
    for (const c of COSMETICS.filter((x) => x.slot !== 'color'))
      expect(COSMETIC_ART_IDS).toContain(c.id);
  });

  it('the base character is unchanged when nothing is equipped', () => {
    const c = make();
    expect(c.renderer.rig.hatSlot.childElementCount).toBe(0);
    expect(c.renderer.rig.accessorySlot.childElementCount).toBe(0);
    expect(c.renderer.rig.tuft.style.display).toBe('');
    c.destroy();
  });

  it('hats and accessories are attached inside the body group, so they move with every animation', () => {
    const c = make({ hat: 'hat:party', accessory: 'acc:bowtie' });
    const body = c.renderer.rig.body;
    const hat = c.element.querySelector('[data-cosmetic="hat:party"]')!;
    const bow = c.element.querySelector('[data-cosmetic="acc:bowtie"]')!;
    expect(body.contains(hat)).toBe(true);
    expect(body.contains(bow)).toBe(true);
    expect(c.renderer.rig.tuft.style.display).toBe('none');
    // Drive real frames in many states: the hat stays attached and inherits the body transform.
    for (const state of [
      'walking',
      'running',
      'dragged',
      'charging',
      'launching',
      'celebrating',
      'sleeping',
    ] as const) {
      c.preview(state);
      const f = c.controller.update(1 / 60);
      c.renderer.render(f.pose, { charge: 0.4, tensionLabel: null, facing: 1, state });
      expect(body.contains(hat)).toBe(true);
      expect(body.getAttribute('transform')).toContain('scale(');
    }
    c.destroy();
  });

  it('swapping and removing cosmetics replaces layers cleanly', () => {
    const c = make({ hat: 'hat:party' });
    c.setCosmetics({ hat: 'hat:crown' });
    expect(c.element.querySelectorAll('[data-cosmetic^="hat:"]')).toHaveLength(1);
    expect(c.element.querySelector('[data-cosmetic="hat:crown"]')).not.toBeNull();
    c.setCosmetics({});
    expect(c.element.querySelectorAll('[data-cosmetic]')).toHaveLength(0);
    expect(c.renderer.rig.tuft.style.display).toBe('');
    c.destroy();
  });

  it('golden accent gilds feet/arms/tuft but keeps the body color, and survives color changes', () => {
    const c = make({ effect: 'fx:golden' });
    const fills = () => c.renderer.rig.paint.shade.map((n) => n.getAttribute('fill'));
    expect(new Set(fills())).toEqual(new Set(['#F5C542']));
    c.setColor('blue');
    expect(new Set(fills())).toEqual(new Set(['#F5C542']));
    expect(c.renderer.rig.paint.body[0]!.getAttribute('fill')).toBe('#7CC4FF');
    c.setCosmetics({});
    expect(fills()).not.toContain('#F5C542');
    c.destroy();
  });

  it('the confetti celebration only shows while celebrating', () => {
    const c = make({ celebration: 'cel:confetti' });
    const slot = c.renderer.rig.celebrationSlot;
    const f = c.controller.update(1 / 60);
    c.renderer.render(f.pose, { charge: 0, tensionLabel: null, facing: 1, state: 'walking' });
    expect(slot.style.display).toBe('none');
    c.renderer.render(f.pose, { charge: 0, tensionLabel: null, facing: 1, state: 'celebrating' });
    expect(slot.style.display).toBe('');
    c.destroy();
  });

  it('cosmetics never change movement physics', () => {
    const run = () => {
      const ctl = new CharacterController(
        { sizePx: 74, intensity: 1, reducedMotion: false, slingshot: true },
        {},
        { width: 1280, height: 800 },
      );
      ctl.enter({ speedMultiplier: 1, speedSetting: 1, gait: 'walk', mood: 'casual' });
      for (let i = 0; i < 180; i++) ctl.update(1 / 60);
      return { ...ctl.pos };
    };
    const a = run();
    make({ hat: 'hat:grad', accessory: 'acc:headband', effect: 'fx:golden' }).destroy();
    expect(run()).toEqual(a);
  });

  it('pastel pink renders with its own palette', () => {
    const c = make();
    c.setColor('pastel');
    expect(c.renderer.rig.paint.body[0]!.getAttribute('fill')).toBe('#FFC6DC');
    c.destroy();
  });
});
