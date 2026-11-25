/**
 * "Tablin" — the original mascot: a small round creature with a leafy tuft,
 * stubby arms and tiny feet. Drawn entirely with SVG primitives (no images, no
 * innerHTML, so it works on pages that enforce Trusted Types).
 *
 * The rig is drawn in a 100×100 box; feet rest on y≈92, the body centre is ~(50,58).
 */
import { EYE_WHITE, INK, type CharacterPalette } from './palette';

const NS = 'http://www.w3.org/2000/svg';

export interface EyeRig {
  group: SVGGElement;
  open: SVGGElement;
  pupil: SVGGElement;
  closed: SVGPathElement;
  happy: SVGPathElement;
  cx: number;
  cy: number;
}

export interface Rig {
  svg: SVGSVGElement;
  shadow: SVGEllipseElement;
  motion: SVGGElement;
  whole: SVGGElement;
  footL: SVGGElement;
  footR: SVGGElement;
  body: SVGGElement;
  armL: SVGGElement;
  armR: SVGGElement;
  face: SVGGElement;
  eyes: [EyeRig, EyeRig];
  brows: SVGGElement;
  cheeks: SVGGElement;
  mouthStroke: SVGPathElement;
  mouthFill: SVGPathElement;
  sweat: SVGPathElement;
  zzz: SVGGElement;
  tension: SVGCircleElement;
  /** The leafy tuft (hidden while a hat covers it). */
  tuft: SVGPathElement;
  /** Cosmetic layers. Hat/accessory live inside `body`, so they inherit every bob, squash and lean. */
  hatSlot: SVGGElement;
  accessorySlot: SVGGElement;
  effectSlot: SVGGElement;
  celebrationSlot: SVGGElement;
  tensionTrack: SVGCircleElement;
  /** Elements recoloured when the palette changes. */
  paint: {
    body: SVGElement[];
    shade: SVGElement[];
    outline: SVGElement[];
    belly: SVGElement[];
    cheek: SVGElement[];
  };
}

export interface CharacterDesign {
  id: string;
  name: string;
  build(doc: Document): Rig;
}

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

export const BODY_PATH =
  'M50 26 C71 26 85 39 85 59 C85 78 71 90 50 90 C29 90 15 78 15 59 C15 39 29 26 50 26 Z';

function buildEye(doc: Document, parent: SVGGElement, cx: number, cy: number): EyeRig {
  const group = el(doc, 'g', { class: 'tb-eye' }, parent);
  const open = el(doc, 'g', {}, group);
  el(
    doc,
    'ellipse',
    { cx, cy, rx: 7.4, ry: 8.6, fill: EYE_WHITE, stroke: INK, 'stroke-width': 1.6 },
    open,
  );
  const pupil = el(doc, 'g', {}, open);
  el(doc, 'circle', { cx, cy: cy + 0.6, r: 4.6, fill: INK }, pupil);
  el(doc, 'circle', { cx: cx + 1.7, cy: cy - 1.4, r: 1.6, fill: EYE_WHITE }, pupil);
  const closed = el(
    doc,
    'path',
    {
      d: `M${cx - 6.5} ${cy} Q${cx} ${cy + 5} ${cx + 6.5} ${cy}`,
      fill: 'none',
      stroke: INK,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
    },
    group,
  );
  const happy = el(
    doc,
    'path',
    {
      d: `M${cx - 6.5} ${cy + 2} Q${cx} ${cy - 6} ${cx + 6.5} ${cy + 2}`,
      fill: 'none',
      stroke: INK,
      'stroke-width': 2.6,
      'stroke-linecap': 'round',
    },
    group,
  );
  return { group, open, pupil, closed, happy, cx, cy };
}

function buildRig(doc: Document): Rig {
  const svg = el(doc, 'svg', {
    viewBox: '0 0 100 100',
    class: 'tb-svg',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const paint: Rig['paint'] = { body: [], shade: [], outline: [], belly: [], cheek: [] };

  const tensionTrack = el(
    doc,
    'circle',
    {
      cx: 50,
      cy: 60,
      r: 56,
      class: 'tb-tension-track',
      fill: 'none',
      'stroke-width': 3,
    },
    svg,
  );
  const tension = el(
    doc,
    'circle',
    {
      cx: 50,
      cy: 60,
      r: 56,
      class: 'tb-tension',
      fill: 'none',
      'stroke-width': 4,
      'stroke-linecap': 'round',
      transform: 'rotate(-90 50 60)',
    },
    svg,
  );
  paint.outline.push(tensionTrack, tension);

  const shadow = el(doc, 'ellipse', { cx: 50, cy: 94, rx: 26, ry: 3.6, class: 'tb-shadow' }, svg);

  const motion = el(
    doc,
    'g',
    { class: 'tb-motion', 'stroke-linecap': 'round', 'stroke-width': 3 },
    svg,
  );
  for (const [y, w] of [
    [48, 12],
    [60, 16],
    [72, 10],
  ] as const) {
    paint.outline.push(el(doc, 'line', { x1: 4, y1: y, x2: 4 + w, y2: y, opacity: 0.45 }, motion));
  }

  const whole = el(doc, 'g', { class: 'tb-whole' }, svg);

  const footL = el(doc, 'g', {}, whole);
  const footR = el(doc, 'g', {}, whole);
  for (const [g, cx] of [
    [footL, 37],
    [footR, 63],
  ] as const) {
    const foot = el(doc, 'ellipse', { cx, cy: 90.5, rx: 9.2, ry: 5.4, 'stroke-width': 2.2 }, g);
    paint.shade.push(foot);
    paint.outline.push(foot);
  }

  const body = el(doc, 'g', { class: 'tb-body' }, whole);

  const armL = el(doc, 'g', {}, body);
  const armR = el(doc, 'g', {}, body);
  const armLShape = el(
    doc,
    'ellipse',
    {
      cx: 15.5,
      cy: 67,
      rx: 5.2,
      ry: 8.8,
      'stroke-width': 2.2,
      transform: 'rotate(14 19 60)',
    },
    armL,
  );
  const armRShape = el(
    doc,
    'ellipse',
    {
      cx: 84.5,
      cy: 67,
      rx: 5.2,
      ry: 8.8,
      'stroke-width': 2.2,
      transform: 'rotate(-14 81 60)',
    },
    armR,
  );
  paint.shade.push(armLShape, armRShape);
  paint.outline.push(armLShape, armRShape);

  const tuft = el(
    doc,
    'path',
    {
      d: 'M49 28 C47 20 51 13 59 12 C57 17 56 22 53 28 Z',
      'stroke-width': 2.2,
      'stroke-linejoin': 'round',
    },
    body,
  );
  paint.shade.push(tuft);
  paint.outline.push(tuft);

  const bodyShape = el(doc, 'path', { d: BODY_PATH, 'stroke-width': 2.6 }, body);
  paint.body.push(bodyShape);
  paint.outline.push(bodyShape);

  const belly = el(doc, 'ellipse', { cx: 50, cy: 74, rx: 19, ry: 11.5, opacity: 0.55 }, body);
  paint.belly.push(belly);
  // A soft sheen on the upper-left gives the body some volume.
  el(
    doc,
    'ellipse',
    {
      cx: 32,
      cy: 41,
      rx: 6.5,
      ry: 4,
      fill: '#FFFFFF',
      opacity: 0.35,
      transform: 'rotate(-32 32 41)',
    },
    body,
  );

  const face = el(doc, 'g', { class: 'tb-face' }, body);
  const cheeks = el(doc, 'g', {}, face);
  for (const cx of [28.5, 71.5]) {
    paint.cheek.push(el(doc, 'ellipse', { cx, cy: 66, rx: 5.6, ry: 3.3 }, cheeks));
  }
  const eyes: [EyeRig, EyeRig] = [buildEye(doc, face, 39, 54), buildEye(doc, face, 61, 54)];

  const brows = el(
    doc,
    'g',
    {
      stroke: INK,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      fill: 'none',
    },
    face,
  );
  el(doc, 'path', { d: 'M32.5 42.5 L44 46' }, brows);
  el(doc, 'path', { d: 'M67.5 42.5 L56 46' }, brows);

  const mouthFill = el(doc, 'path', { fill: INK }, face);
  const mouthStroke = el(
    doc,
    'path',
    {
      fill: 'none',
      stroke: INK,
      'stroke-width': 2.3,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    face,
  );

  const sweat = el(
    doc,
    'path',
    {
      d: 'M82 30 C85.5 35.5 86.5 39 83.5 41.5 C80 42 78.5 38.5 82 30 Z',
      fill: '#8FD3FF',
      stroke: '#2C6FA8',
      'stroke-width': 1.2,
    },
    body,
  );

  // Cosmetic slots (empty by default, so the base character is unchanged).
  const accessorySlot = el(doc, 'g', { class: 'tb-slot-accessory' }, body);
  const hatSlot = el(doc, 'g', { class: 'tb-slot-hat' }, body);
  const effectSlot = el(doc, 'g', { class: 'tb-slot-effect' }, whole);
  const celebrationSlot = el(doc, 'g', { class: 'tb-slot-celebration' }, whole);

  const zzz = el(doc, 'g', { class: 'tb-zzz', fill: INK }, whole);
  const letters: [string, number, number, number][] = [
    ['z', 74, 30, 10],
    ['z', 82, 19, 13],
    ['Z', 91, 6, 17],
  ];
  letters.forEach(([ch, x, y, size], i) => {
    const t = el(doc, 'text', { x, y, 'font-size': size, class: `tb-z tb-z${i}` }, zzz);
    t.textContent = ch;
  });

  return {
    svg,
    shadow,
    motion,
    whole,
    footL,
    footR,
    body,
    armL,
    armR,
    face,
    eyes,
    brows,
    cheeks,
    mouthStroke,
    mouthFill,
    sweat,
    zzz,
    tension,
    tensionTrack,
    tuft,
    hatSlot,
    accessorySlot,
    effectSlot,
    celebrationSlot,
    paint,
  };
}

export const TABLIN_DESIGN: CharacterDesign = { id: 'tablin', name: 'Tablin', build: buildRig };

/** Mouth paths per expression, centred around (50, 70). */
export const MOUTHS: Record<string, { stroke?: string; fill?: string }> = {
  happy: { stroke: 'M44 68 Q50 74.5 56 68' },
  neutral: { stroke: 'M45.5 70 Q50 71.8 54.5 70' },
  joy: { fill: 'M42.5 66.5 Q50 79 57.5 66.5 Q50 69 42.5 66.5 Z' },
  surprised: {
    fill: 'M50 65.2 C53 65.2 54 67.8 54 69.8 C54 72.2 52.2 73.6 50 73.6 C47.8 73.6 46 72.2 46 69.8 C46 67.8 47 65.2 50 65.2 Z',
  },
  determined: { stroke: 'M45 70.8 Q50 68.6 55 70.8' },
  strain: { stroke: 'M43.5 70 L46.8 67.8 L50 70 L53.2 67.8 L56.5 70' },
  sleepy: { stroke: 'M47 70 Q50 71.6 53 70' },
  tired: { fill: 'M45.5 67.5 Q50 76 54.5 67.5 Q50 69.5 45.5 67.5 Z' },
};

export function applyPalette(rig: Rig, palette: CharacterPalette): void {
  for (const n of rig.paint.body) n.setAttribute('fill', palette.body);
  for (const n of rig.paint.shade) n.setAttribute('fill', palette.shade);
  for (const n of rig.paint.outline) n.setAttribute('stroke', palette.outline);
  for (const n of rig.paint.belly) n.setAttribute('fill', palette.belly);
  for (const n of rig.paint.cheek) n.setAttribute('fill', palette.cheek);
}

/** Registry of available designs (one today; ready for more). */
export const DESIGNS: Record<string, CharacterDesign> = { tablin: TABLIN_DESIGN };
