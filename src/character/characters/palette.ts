import type { CharacterColor } from '../../shared/types';

export interface CharacterPalette {
  /** Main body fill. */
  body: string;
  /** Feet, arms, tuft: a slightly deeper tone of the body. */
  shade: string;
  /** Outline: dark enough to read on white and on dark pages. */
  outline: string;
  /** Soft belly highlight. */
  belly: string;
  cheek: string;
  /** UI accent derived from the body (popup highlights, tension ring). */
  accent: string;
}

/** Eyes, mouth and brows use one shared ink so the face reads on every color. */
export const INK = '#2A1D16';
export const EYE_WHITE = '#FFFFFF';

export const PALETTES: Record<CharacterColor, CharacterPalette> = {
  orange: {
    body: '#FF9F4A',
    shade: '#EE7F2C',
    outline: '#8A4316',
    belly: '#FFD5AE',
    cheek: '#FF6F61',
    accent: '#E8772A',
  },
  pink: {
    body: '#FF9EC4',
    shade: '#EF7BAA',
    outline: '#8C2F59',
    belly: '#FFD9E8',
    cheek: '#FF5C8A',
    accent: '#E0679A',
  },
  purple: {
    body: '#B9A0FF',
    shade: '#9A7EF0',
    outline: '#4B2E91',
    belly: '#E4DAFF',
    cheek: '#FF7FB5',
    accent: '#8367E0',
  },
  blue: {
    body: '#7CC4FF',
    shade: '#58A8EE',
    outline: '#1D4F8A',
    belly: '#D5EDFF',
    cheek: '#FF8FA8',
    accent: '#3E8FD8',
  },
  green: {
    body: '#8FDB8A',
    shade: '#6CC46A',
    outline: '#2D6B33',
    belly: '#DAF5D4',
    cheek: '#FF8F8F',
    accent: '#4EA94F',
  },
  yellow: {
    body: '#FFD45C',
    shade: '#F3BB2E',
    outline: '#8A6410',
    belly: '#FFF1C4',
    cheek: '#FF8A5C',
    accent: '#D79F12',
  },
  red: {
    body: '#FF7468',
    shade: '#EC5448',
    outline: '#8A1F18',
    belly: '#FFCBC4',
    cheek: '#FFC2BA',
    accent: '#DD4A3E',
  },
  // Unlockable (Getting Started achievement).
  pastel: {
    body: '#FFC6DC',
    shade: '#F5A3C3',
    outline: '#9B4470',
    belly: '#FFE8F1',
    cheek: '#FF7FA8',
    accent: '#D9709C',
  },
};

export function paletteFor(color: CharacterColor): CharacterPalette {
  return PALETTES[color] ?? PALETTES.orange;
}

export const COLOR_LABELS: Record<CharacterColor, string> = {
  orange: 'Tangerine',
  pink: 'Bubblegum',
  purple: 'Lavender',
  blue: 'Sky',
  green: 'Mint',
  yellow: 'Sunny',
  red: 'Cherry',
  pastel: 'Pastel Pink',
};
