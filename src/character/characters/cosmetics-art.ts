/**
 * Original SVG artwork for cosmetics, drawn in the character rig's 100×100
 * coordinate space (head top ≈ y 26, body centre ≈ (50, 58), feet ≈ y 92).
 * Built with createElementNS only — no innerHTML — like the rest of the rig.
 */

const NS = 'http://www.w3.org/2000/svg';
const LINE = '#3A2A20';
const GOLD = '#F5C542';
const GOLD_DARK = '#9A7414';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function group(doc: Document, id: string, attrs: Attrs = {}): SVGGElement {
  const g = doc.createElementNS(NS, 'g');
  g.setAttribute('data-cosmetic', id);
  for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, String(v));
  return g;
}

function star(cx: number, cy: number, r: number, inner = 0.45): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(`${(cx + Math.cos(rad) * rr).toFixed(2)},${(cy + Math.sin(rad) * rr).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const stroke = { stroke: LINE, 'stroke-width': 1.8, 'stroke-linejoin': 'round' };

const BUILDERS: Record<string, (doc: Document) => SVGGElement> = {
  'hat:party': (doc) => {
    const g = group(doc, 'hat:party', { transform: 'rotate(-12 50 30)' });
    el(doc, 'path', { d: 'M37 31 L63 31 L50 3 Z', fill: '#7FC8F8', ...stroke }, g);
    el(doc, 'path', { d: 'M41.4 21.5 L58.6 21.5 L56.2 16.4 L43.8 16.4 Z', fill: '#FFD166' }, g);
    el(doc, 'path', { d: 'M39.2 26.5 L60.8 26.5 L59.7 24.2 L40.3 24.2 Z', fill: '#FF8FB1' }, g);
    el(doc, 'path', { d: 'M37 31 L63 31 L50 3 Z', fill: 'none', ...stroke }, g);
    el(
      doc,
      'circle',
      { cx: 50, cy: 3.5, r: 3.6, fill: '#FF6F91', ...stroke, 'stroke-width': 1.4 },
      g,
    );
    return g;
  },
  'hat:grad': (doc) => {
    const g = group(doc, 'hat:grad');
    el(doc, 'path', { d: 'M37 24 L63 24 L63 31 Q50 35.5 37 31 Z', fill: '#3A3540', ...stroke }, g);
    el(doc, 'path', { d: 'M27 21 L50 12 L73 21 L50 30 Z', fill: '#2E2A31', ...stroke }, g);
    el(
      doc,
      'path',
      {
        d: 'M50 21 L67 23.5 L67 34',
        fill: 'none',
        stroke: '#F2C14E',
        'stroke-width': 1.8,
        'stroke-linecap': 'round',
      },
      g,
    );
    el(doc, 'path', { d: 'M65 33 L69 33 L68 39 L66 39 Z', fill: '#F2C14E' }, g);
    el(doc, 'circle', { cx: 50, cy: 21, r: 1.8, fill: '#F2C14E' }, g);
    return g;
  },
  'hat:crown': (doc) => {
    const g = group(doc, 'hat:crown');
    el(
      doc,
      'path',
      {
        d: 'M35 31 L34 15 L42.5 22 L50 11 L57.5 22 L66 15 L65 31 Q50 34 35 31 Z',
        fill: '#FFD34D',
        stroke: GOLD_DARK,
        'stroke-width': 1.8,
        'stroke-linejoin': 'round',
      },
      g,
    );
    el(doc, 'circle', { cx: 50, cy: 26, r: 2.4, fill: '#E5484D' }, g);
    el(doc, 'circle', { cx: 41, cy: 27, r: 1.7, fill: '#4F8FE8' }, g);
    el(doc, 'circle', { cx: 59, cy: 27, r: 1.7, fill: '#4F8FE8' }, g);
    for (const [x, y] of [
      [34, 15],
      [50, 11],
      [66, 15],
    ] as const) {
      el(
        doc,
        'circle',
        { cx: x, cy: y, r: 1.9, fill: '#FFF3C4', stroke: GOLD_DARK, 'stroke-width': 1 },
        g,
      );
    }
    return g;
  },
  'hat:nightcap': (doc) => {
    const g = group(doc, 'hat:nightcap');
    el(
      doc,
      'path',
      {
        d: 'M33 32 Q40 6 64 8 Q78 10 78 22 Q70 16 64 20 Q66 26 67 32 Z',
        fill: '#7C8BE0',
        ...stroke,
      },
      g,
    );
    el(
      doc,
      'path',
      { d: 'M32 30 Q50 24 68 30 L68 35 Q50 29 32 35 Z', fill: '#FFFFFF', ...stroke },
      g,
    );
    el(
      doc,
      'circle',
      { cx: 78, cy: 23, r: 4.2, fill: '#FFFFFF', ...stroke, 'stroke-width': 1.4 },
      g,
    );
    el(doc, 'path', { d: star(47, 18, 2.6), fill: '#FFE38A' }, g);
    return g;
  },
  'acc:star': (doc) => {
    const g = group(doc, 'acc:star');
    el(
      doc,
      'path',
      {
        d: star(70, 34, 6.5),
        fill: '#FFD34D',
        stroke: GOLD_DARK,
        'stroke-width': 1.4,
        'stroke-linejoin': 'round',
      },
      g,
    );
    el(doc, 'circle', { cx: 68.2, cy: 32.4, r: 1.1, fill: '#FFFBEA' }, g);
    return g;
  },
  'acc:bowtie': (doc) => {
    const g = group(doc, 'acc:bowtie');
    el(
      doc,
      'path',
      { d: 'M50 81 L40.5 76 Q38.5 81 40.5 86 Z', fill: '#E5484D', ...stroke, 'stroke-width': 1.5 },
      g,
    );
    el(
      doc,
      'path',
      { d: 'M50 81 L59.5 76 Q61.5 81 59.5 86 Z', fill: '#E5484D', ...stroke, 'stroke-width': 1.5 },
      g,
    );
    el(
      doc,
      'rect',
      {
        x: 47.6,
        y: 78.4,
        width: 4.8,
        height: 5.2,
        rx: 1.6,
        fill: '#C93A3F',
        ...stroke,
        'stroke-width': 1.3,
      },
      g,
    );
    return g;
  },
  'acc:headband': (doc) => {
    const g = group(doc, 'acc:headband');
    el(
      doc,
      'path',
      {
        d: 'M18.5 43 Q50 31 81.5 43 L80.8 48.6 Q50 37 19.2 48.6 Z',
        fill: '#E5484D',
        ...stroke,
        'stroke-width': 1.5,
      },
      g,
    );
    el(
      doc,
      'path',
      { d: 'M80 45 Q88 44 92 50 Q86 49 82 49 Z', fill: '#E5484D', ...stroke, 'stroke-width': 1.3 },
      g,
    );
    el(
      doc,
      'path',
      {
        d: 'M80 46.5 Q86 50 87 57 Q83 52 80.5 49.5 Z',
        fill: '#C93A3F',
        ...stroke,
        'stroke-width': 1.3,
      },
      g,
    );
    el(
      doc,
      'path',
      {
        d: 'M24 44.5 Q50 35 76 44.5',
        fill: 'none',
        stroke: '#FFFFFF',
        'stroke-width': 1,
        opacity: 0.6,
      },
      g,
    );
    return g;
  },
  'fx:golden': (doc) => {
    const g = group(doc, 'fx:golden', { class: 'tb-sparkles' });
    for (const [x, y, r, i] of [
      [14, 30, 4.2, 0],
      [88, 40, 3.4, 1],
      [82, 12, 3, 2],
    ] as const) {
      el(
        doc,
        'path',
        {
          d: star(x, y, r, 0.32),
          fill: GOLD,
          stroke: GOLD_DARK,
          'stroke-width': 0.6,
          class: `tb-sparkle tb-sparkle${i}`,
        },
        g,
      );
    }
    return g;
  },
  'cel:confetti': (doc) => {
    const g = group(doc, 'cel:confetti', { class: 'tb-confetti' });
    const colors = ['#FF6F91', '#FFD166', '#7FC8F8', '#8FDB8A', '#B9A0FF'];
    for (let i = 0; i < 14; i++) {
      const x = 8 + ((i * 37) % 84);
      const color = colors[i % colors.length]!;
      const attrs = {
        class: `tb-confetto tb-confetto${i % 7}`,
        fill: color,
        style: `--tb-dx:${((i % 5) - 2) * 6}px`,
      };
      if (i % 3 === 0) el(doc, 'circle', { cx: x, cy: 10, r: 1.8, ...attrs }, g);
      else el(doc, 'rect', { x, y: 8, width: 2.6, height: 4.4, rx: 0.6, ...attrs }, g);
    }
    return g;
  },
};

export const COSMETIC_ART_IDS = Object.keys(BUILDERS);

export function buildCosmetic(doc: Document, id: string): SVGGElement | null {
  return BUILDERS[id]?.(doc) ?? null;
}

export const GOLDEN = { fill: GOLD, outline: GOLD_DARK };
