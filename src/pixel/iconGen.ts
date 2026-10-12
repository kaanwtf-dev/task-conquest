// Real-time pixel icon generator: item text -> emoji -> 16x16 retro-palette pixel art.
// Unknown words fall back to a procedurally generated "quest item" sprite seeded by the text.
import { hashStr, Rng } from '../core/rng';
import { Pix, hexToRgb, hueRotate, shade } from './pix';
import { matchKeyword } from './keywords';

// DawnBringer 32 palette: gives every icon a cohesive 8/16-bit look.
const DB32 = [
  '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
  '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
  '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
  '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30',
];
const DB32_RGB = DB32.map(hexToRgb);

function nearest(r: number, g: number, b: number): string {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < DB32_RGB.length; i++) {
    const [pr, pg, pb] = DB32_RGB[i];
    // weighted distance (human eye is greener)
    const d = (r - pr) ** 2 * 0.3 + (g - pg) ** 2 * 0.59 + (b - pb) ** 2 * 0.11;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return DB32[best];
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

/** Rasterize an emoji big, box-downsample to `inner` px, snap to palette, add outline. */
export function pixelizeEmoji(emoji: string, inner = 14): Pix | null {
  if (typeof document === 'undefined') return null;
  const big = 96;
  const c = document.createElement('canvas');
  c.width = big;
  c.height = big;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(big * 0.82)}px ${EMOJI_FONT}`;
  ctx.fillText(emoji, big / 2, big / 2 + big * 0.06);
  const src = ctx.getImageData(0, 0, big, big).data;

  // find content bounds so every icon fills its cell
  let minX = big, minY = big, maxX = -1, maxY = -1;
  for (let y = 0; y < big; y++)
    for (let x = 0; x < big; x++)
      if (src[(y * big + x) * 4 + 3] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const side = Math.max(bw, bh);
  const ox = minX - (side - bw) / 2;
  const oy = minY - (side - bh) / 2;
  const cell = side / inner;

  const size = inner + 2;
  const p = new Pix(size, size);
  let colorful = 0;
  for (let j = 0; j < inner; j++)
    for (let i = 0; i < inner; i++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(ox + i * cell), x1 = Math.floor(ox + (i + 1) * cell);
      const y0 = Math.floor(oy + j * cell), y1 = Math.floor(oy + (j + 1) * cell);
      for (let y = Math.max(0, y0); y < Math.min(big, Math.max(y1, y0 + 1)); y++)
        for (let x = Math.max(0, x0); x < Math.min(big, Math.max(x1, x0 + 1)); x++) {
          const k = (y * big + x) * 4;
          const al = src[k + 3] / 255;
          r += src[k] * al;
          g += src[k + 1] * al;
          b += src[k + 2] * al;
          a += al;
          n++;
        }
      if (n === 0 || a / n < 0.45) continue;
      const col = nearest(r / a, g / a, b / a);
      if (Math.abs(r / a - g / a) + Math.abs(g / a - b / a) > 30) colorful++;
      p.set(i + 1, j + 1, col);
    }
  // monochrome fallback fonts (tofu / outline glyphs) aren't worth showing
  if (colorful < 3) return null;
  return p.outline('#222034');
}

// ---------- procedural fallback items ----------
const PROC_ART: Record<string, string[]> = {
  potion: [
    '.....cc.....',
    '.....kk.....',
    '....hkkh....',
    '....a..a....',
    '...aLaaaa...',
    '..aLaaaaaa..',
    '..aLaaaaaa..',
    '..aaaaaaaa..',
    '..aaaaaaDa..',
    '...aaaaDa...',
    '....aaaa....',
  ],
  scroll: [
    '..hhhhhhhh..',
    '.hLLLLLLLLh.',
    '..LaaaaaaL..',
    '..LLLLLLLL..',
    '..LaaaaaL...',
    '..LLLLLLLL..',
    '..LaaaaaaL..',
    '..LLLLLLLL..',
    '.hLLLLLLLLh.',
    '..hhhhhhhh..',
  ],
  gem: [
    '...LLLLLL...',
    '..LaaaaaaD..',
    '.LaLaaaaaaD.',
    'LLLLLLLLLLDD',
    '.aaLaaaaaDD.',
    '..aaLaaaDD..',
    '...aaLaDD...',
    '....aaDD....',
    '.....aD.....',
  ],
  pouch: [
    '....hhhh....',
    '.....kk.....',
    '....aaaa....',
    '...aLaaaa...',
    '..aLaaaaaa..',
    '.aLaaaaaaaa.',
    '.aaaaaaaaDa.',
    '.aaaaaaaDaa.',
    '..aaaaaaaa..',
  ],
  crate: [
    'hhhhhhhhhhhh',
    'haaaaaaaaaah',
    'haLaaaaaaDah',
    'haaLaaaaDaah',
    'haaaLaaDaaah',
    'haaaaLDaaaah',
    'haaaaDLaaaah',
    'haaaDaaLaaah',
    'haaDaaaaLaah',
    'hhhhhhhhhhhh',
  ],
  orb: [
    '....aaaa....',
    '..aaLLaaaa..',
    '.aaLLaaaaaa.',
    '.aLaaaaaaaa.',
    'aaaaaaaaaaaa',
    'aaaaaaaaaaDa',
    '.aaaaaaaaDa.',
    '.aaaaaaaDDa.',
    '..aaaaDDaa..',
    '....aaaa....',
    '...hhhhhh...',
  ],
  rune: [
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    'aaaaLLLaaaaa',
    'aaaaLaLaaaaa',
    'aaaLLaLLaaaa',
    'aaaaaLaaaaaa',
    'aaaaaLaaaaDa',
    'aaaaLLLaaaDa',
    '.aaaaaaaaDD.',
    '..aaaaaaDD..',
  ],
};
const PROC_KINDS = Object.keys(PROC_ART);

export function proceduralItem(text: string): Pix {
  const h = hashStr(text.toLowerCase().trim());
  const rng = new Rng(h);
  const kind = PROC_KINDS[h % PROC_KINDS.length];
  const base = hueRotate('#d95763', rng.int(0, 359), 1, rng.pick([0.8, 1, 1.15]));
  const art = PROC_ART[kind];
  const p = new Pix(16, 16);
  const ox = Math.floor((16 - art[0].length) / 2);
  const oy = Math.floor((16 - art.length) / 2);
  p.art(art, { a: base, L: shade(base, 0.45), D: shade(base, -0.3), h: '#8f563b', k: '#d9a066', c: '#eec39a' }, ox, oy);
  return p.outline('#222034');
}

const iconCache = new Map<string, string>();

/** Icon dataURL for a task/item title (or an explicit emoji / icon key). Cached. */
export function iconFor(text: string, explicit?: string): string {
  const key = explicit ? `x:${explicit}` : `t:${text.toLowerCase().trim()}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  let pix: Pix | null = null;
  const emoji = explicit || matchKeyword(text) || firstEmoji(text);
  if (emoji) pix = pixelizeEmoji(emoji);
  if (!pix) pix = proceduralItem(text || '?');
  const url = pix.toCanvas(1).toDataURL();
  iconCache.set(key, url);
  return url;
}

const EMOJI_RE = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/u;
export function firstEmoji(text: string): string | null {
  const m = text.match(EMOJI_RE);
  return m ? m[0] : null;
}
