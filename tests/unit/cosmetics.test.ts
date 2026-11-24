import { describe, expect, it } from 'vitest';
import {
  COSMETICS,
  effectiveColor,
  effectiveEquipped,
  emptyInventory,
  equip,
  isUnlocked,
  validateInventory,
} from '../../src/shared/cosmetics';
import { defaultSettings } from '../../src/shared/settings';
import { TablinStore } from '../../src/shared/storage';
import { MemoryArea } from './helpers';

const withUnlocked = (...ids: string[]) => ({
  ...emptyInventory(),
  unlocked: Object.fromEntries(ids.map((id) => [id, 1])),
});

describe('cosmetics & inventory', () => {
  it('base colors are always available; rewards start locked', () => {
    const inv = emptyInventory();
    for (const c of ['orange', 'pink', 'purple', 'blue', 'green', 'yellow', 'red']) {
      expect(isUnlocked(inv, `color:${c}`)).toBe(true);
    }
    expect(isUnlocked(inv, 'color:pastel')).toBe(false);
    expect(isUnlocked(inv, 'hat:party')).toBe(false);
    expect(isUnlocked(inv, 'hat:nonexistent')).toBe(false);
  });

  it('every cosmetic is purely visual and has a defined source', () => {
    for (const c of COSMETICS) expect(c.unlockedBy === null ? c.slot : c.unlockedBy).toBeTruthy();
  });

  it('refuses to equip locked items', () => {
    const r = equip(emptyInventory(), 'hat', 'hat:party');
    expect(r).toEqual({ ok: false, error: 'That item is still locked.' });
  });

  it('refuses items in the wrong slot', () => {
    expect(equip(withUnlocked('hat:party'), 'accessory', 'hat:party').ok).toBe(false);
  });

  it('equips and unequips unlocked items', () => {
    const on = equip(withUnlocked('hat:party'), 'hat', 'hat:party');
    if (!on.ok) throw new Error();
    expect(on.inventory.equipped.hat).toBe('hat:party');
    const off = equip(on.inventory, 'hat', null);
    if (!off.ok) throw new Error();
    expect(off.inventory.equipped.hat).toBeNull();
  });

  it('validation drops unknown ids and equipped items that are not unlocked', () => {
    const inv = validateInventory({
      unlocked: { 'hat:party': 5, 'hat:fake': 5, 'color:orange': 5 },
      equipped: { hat: 'hat:party', accessory: 'acc:star', effect: 'hat:party', celebration: 7 },
    });
    expect(inv.unlocked).toEqual({ 'hat:party': 5 });
    expect(inv.equipped).toEqual({
      hat: 'hat:party',
      accessory: null,
      effect: null,
      celebration: null,
    });
    expect(validateInventory('garbage')).toEqual(emptyInventory());
  });

  it('a locked color falls back to Tangerine; an unlocked one is shown', () => {
    const s = defaultSettings();
    s.character.color = 'pastel';
    expect(effectiveColor(s, emptyInventory())).toBe('orange');
    expect(effectiveColor(s, withUnlocked('color:pastel'))).toBe('pastel');
    s.character.color = 'purple';
    expect(effectiveColor(s, emptyInventory())).toBe('purple');
  });

  it('effective equipment re-checks unlocks', () => {
    const tampered = {
      ...emptyInventory(),
      equipped: { hat: 'hat:crown', accessory: null, effect: null, celebration: null },
    };
    expect(effectiveEquipped(tampered).hat).toBeNull();
  });

  it('inventory persists across a browser restart', async () => {
    const local = new MemoryArea();
    const store = new TablinStore(local, new MemoryArea());
    const r = equip(withUnlocked('acc:bowtie'), 'accessory', 'acc:bowtie');
    if (!r.ok) throw new Error();
    await store.setInventory(r.inventory);
    const after = new TablinStore(local, new MemoryArea());
    expect((await after.getInventory()).equipped.accessory).toBe('acc:bowtie');
  });
});
