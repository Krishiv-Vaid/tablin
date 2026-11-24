import {
  CHARACTER_COLORS,
  type CharacterColor,
  type CosmeticSlot,
  type Equipped,
  type Inventory,
  type Settings,
} from './types';

/**
 * Cosmetic catalog. Everything here is purely visual; nothing gates
 * functionality. Base colors are always available; the rest are earned
 * through achievements (see achievements.ts), never bought or randomised.
 */
export interface Cosmetic {
  id: string;
  name: string;
  slot: CosmeticSlot;
  description: string;
  /** Achievement that unlocks it, or null if always available. */
  unlockedBy: string | null;
}

const BASE_COLOR_NAMES: Record<(typeof CHARACTER_COLORS)[number], string> = {
  orange: 'Tangerine',
  pink: 'Bubblegum',
  purple: 'Lavender',
  blue: 'Sky',
  green: 'Mint',
  yellow: 'Sunny',
  red: 'Cherry',
};

export const COSMETICS: readonly Cosmetic[] = [
  ...CHARACTER_COLORS.map((c): Cosmetic => ({
    id: `color:${c}`,
    name: BASE_COLOR_NAMES[c],
    slot: 'color',
    description: 'A classic Tablin color.',
    unlockedBy: null,
  })),
  {
    id: 'color:pastel',
    name: 'Pastel Pink',
    slot: 'color',
    description: 'A soft, dreamy pink.',
    unlockedBy: 'getting-started',
  },
  {
    id: 'hat:party',
    name: 'Party Hat',
    slot: 'hat',
    description: 'A tiny striped party hat.',
    unlockedBy: 'first-focus',
  },
  {
    id: 'hat:grad',
    name: 'Graduation Cap',
    slot: 'hat',
    description: 'Ten sessions of study, officially.',
    unlockedBy: 'dedicated',
  },
  {
    id: 'hat:crown',
    name: 'Little Crown',
    slot: 'hat',
    description: 'Royalty, after a week-long streak.',
    unlockedBy: 'week-warrior',
  },
  {
    id: 'hat:nightcap',
    name: 'Night Cap',
    slot: 'hat',
    description: 'For the deep-work dreamers.',
    unlockedBy: 'deep-work',
  },
  {
    id: 'acc:star',
    name: 'Star Clip',
    slot: 'accessory',
    description: 'A little star tucked on the tuft.',
    unlockedBy: 'three-days',
  },
  {
    id: 'acc:bowtie',
    name: 'Bow Tie',
    slot: 'accessory',
    description: 'Dressed for a full hour of focus.',
    unlockedBy: 'one-hour',
  },
  {
    id: 'acc:headband',
    name: 'Determined Headband',
    slot: 'accessory',
    description: 'Fifty rescues. Game face on.',
    unlockedBy: 'protector',
  },
  {
    id: 'fx:golden',
    name: 'Golden Accent',
    slot: 'effect',
    description: 'Gilded tuft, feet and a little sparkle.',
    unlockedBy: 'ten-hours',
  },
  {
    id: 'cel:confetti',
    name: 'Confetti Party',
    slot: 'celebration',
    description: 'Celebrations come with confetti.',
    unlockedBy: 'focus-machine',
  },
];

export const COSMETICS_BY_ID: ReadonlyMap<string, Cosmetic> = new Map(
  COSMETICS.map((c) => [c.id, c]),
);

export const EMPTY_EQUIPPED: Equipped = {
  hat: null,
  accessory: null,
  effect: null,
  celebration: null,
};

export function emptyInventory(): Inventory {
  return { unlocked: {}, equipped: { ...EMPTY_EQUIPPED } };
}

export function isUnlocked(inventory: Inventory, id: string): boolean {
  const item = COSMETICS_BY_ID.get(id);
  if (!item) return false;
  return item.unlockedBy === null || inventory.unlocked[id] !== undefined;
}

const EQUIP_SLOTS = ['hat', 'accessory', 'effect', 'celebration'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export function isEquipSlot(value: unknown): value is EquipSlot {
  return typeof value === 'string' && (EQUIP_SLOTS as readonly string[]).includes(value);
}

/** Validates stored inventory: unknown ids dropped, equipped items must be unlocked and in the right slot. */
export function validateInventory(raw: unknown): Inventory {
  const inv = emptyInventory();
  if (typeof raw !== 'object' || raw === null) return inv;
  const r = raw as Record<string, unknown>;
  if (typeof r.unlocked === 'object' && r.unlocked !== null) {
    for (const [id, at] of Object.entries(r.unlocked as Record<string, unknown>)) {
      const item = COSMETICS_BY_ID.get(id);
      if (item && item.unlockedBy !== null && typeof at === 'number' && Number.isFinite(at)) {
        inv.unlocked[id] = at;
      }
    }
  }
  if (typeof r.equipped === 'object' && r.equipped !== null) {
    const e = r.equipped as Record<string, unknown>;
    for (const slot of EQUIP_SLOTS) {
      const id = e[slot];
      if (typeof id === 'string' && COSMETICS_BY_ID.get(id)?.slot === slot && isUnlocked(inv, id)) {
        inv.equipped[slot] = id;
      }
    }
  }
  return inv;
}

export type EquipResult = { ok: true; inventory: Inventory } | { ok: false; error: string };

/** Equip (or unequip with id = null). Locked or mismatched items are refused. */
export function equip(inventory: Inventory, slot: EquipSlot, id: string | null): EquipResult {
  if (id === null) {
    return {
      ok: true,
      inventory: { ...inventory, equipped: { ...inventory.equipped, [slot]: null } },
    };
  }
  const item = COSMETICS_BY_ID.get(id);
  if (!item || item.slot !== slot) return { ok: false, error: 'That item does not go there.' };
  if (!isUnlocked(inventory, id)) return { ok: false, error: 'That item is still locked.' };
  return { ok: true, inventory: { ...inventory, equipped: { ...inventory.equipped, [slot]: id } } };
}

/** Body color actually shown: locked unlockable colors fall back to Tangerine. */
export function effectiveColor(
  settings: Pick<Settings, 'character'>,
  inventory: Inventory,
): CharacterColor {
  const color = settings.character.color;
  return isUnlocked(inventory, `color:${color}`) ? color : 'orange';
}

/** Equipped cosmetics, re-checked against the inventory. */
export function effectiveEquipped(inventory: Inventory): Equipped {
  return validateInventory(inventory).equipped;
}
