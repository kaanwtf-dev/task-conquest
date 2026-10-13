// Renders the Questlog app icons (golden sword over a parchment checklist) from one pixel grid.
// Pure Node: a tiny PNG encoder on top of zlib. usage: node scripts/gen-icons.mjs [outDir=public]
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] ?? 'public');

// ---------------------------------------------------------------- palette

const C = {
  bg: '#1b1640',
  glow1: '#1f1a4b',
  glow2: '#241e57',
  star: '#3b3283',
  starHi: '#5a4fb0',
  frame: '#29225f',
  frameHi: '#352c78',
  frameLo: '#110d29',
  ink: '#120c1c',
  paper: '#f6e7c1',
  paperHi: '#fff6dc',
  paperMid: '#e9d29d',
  paperLo: '#c9a668',
  roll: '#d8b878',
  rollHi: '#f2dca4',
  rollLo: '#9c7442',
  rollEnd: '#7a5532',
  pen: '#7b5a3a',
  box: '#8a6542',
  check: '#62e35a',
  checkHi: '#b6ff8c',
  checkLo: '#249a3c',
  blade: '#ffd447',
  bladeHi: '#fff7cf',
  bladeLo: '#d99a1e',
  guard: '#f2b632',
  guardLo: '#b4741a',
  grip: '#7a3e2c',
  gripHi: '#a65a3c',
  gem: '#e8434f',
  gemHi: '#ffb0b4',
};

// ---------------------------------------------------------------- art

const A = 28; // art layer size; the drawn art's bounding box (26x26) is what gets centred

function layer() {
  return Array.from({ length: A }, () => Array(A).fill(null));
}

function set(g, x, y, c) {
  if (x >= 0 && y >= 0 && x < A && y < A) g[y][x] = c;
}

function rect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, c);
}

/** Cells left empty but 4-adjacent to the layer's pixels become outline. */
function outlined(g, color = C.ink) {
  const o = g.map((r) => r.slice());
  for (let y = 0; y < A; y++)
    for (let x = 0; x < A; x++) {
      if (g[y][x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx]);
      if (n) o[y][x] = color;
    }
  return o;
}

function over(dst, src) {
  for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) if (src[y][x]) dst[y][x] = src[y][x];
}

function parchment(x0, y0, w, h, rows) {
  const g = layer();
  const x1 = x0 + w - 1, y1 = y0 + h - 1;
  // sheet with a lit left edge and shaded right/bottom edges
  rect(g, x0, y0, x1, y1, C.paper);
  rect(g, x0, y0, x0, y1, C.paperHi);
  rect(g, x1 - 1, y0, x1, y1, C.paperMid);
  rect(g, x1, y0, x1, y1, C.paperLo);
  rect(g, x0, y1, x1, y1, C.paperMid);
  // rolls (top + bottom), wider than the sheet
  for (const ry of [y0 - 2, y1 + 1]) {
    rect(g, x0 - 1, ry, x1 + 1, ry + 1, C.roll);
    rect(g, x0 - 1, ry, x1 + 1, ry, C.rollHi);
    rect(g, x0 - 1, ry + 1, x1 + 1, ry + 1, C.rollLo);
    rect(g, x0 - 2, ry, x0 - 2, ry + 1, C.rollEnd);
    rect(g, x1 + 2, ry, x1 + 2, ry + 1, C.rollEnd);
  }
  // checklist rows: box + ink line
  for (let i = 0; i < rows; i++) {
    const by = y0 + 2 + i * 4;
    rect(g, x0 + 2, by, x0 + 4, by + 2, C.box);
    set(g, x0 + 3, by + 1, C.paperHi);
    rect(g, x0 + 6, by + 1, x1 - 2 - (i % 2), by + 1, C.pen);
  }
  return outlined(g);
}

/** Bold check mark ticking the first row, overflowing its box like a stamp. */
function checkMark(ox, oy) {
  const g = layer(); // spine vertex lands at (ox + 3, oy + 6)
  const spine = [];
  for (let i = 0; i <= 3; i++) spine.push([ox + i, oy + 3 + i]);
  for (let j = 1; j <= 5; j++) spine.push([ox + 3 + j, oy + 6 - j]);
  for (const [x, y] of spine) set(g, x, y - 1, C.checkHi);
  for (const [x, y] of spine) set(g, x, y + 1, C.checkLo);
  for (const [x, y] of spine) set(g, x, y, C.check);
  return outlined(g);
}

// Hand-placed 45° sword, tip top-right. W/Y/D blade (lit edge, face, shadow edge), G/g guard,
// H/h grip wrap, R/r pommel gem. The outline is added automatically.
const SWORD = [
  '....................Y.',
  '..................WY..',
  '.................WYD..',
  '................WYD...',
  '...............WYD....',
  '..............WYD.....',
  '.............WYD......',
  '............WYD.......',
  '.....gG....WYD........',
  '......gG..WYD.........',
  '.......gGWYD..........',
  '........gGD...........',
  '.......hHgG...........',
  '......hH..gG..........',
  '.....hH....gG.........',
  '....hH......gg........',
  '...rR.................',
  '..RRR.................',
  '..RR..................',
];
const SWORD_COLORS = {
  W: C.bladeHi, Y: C.blade, D: C.bladeLo, G: C.guard, g: C.guardLo, H: C.gripHi, h: C.grip, R: C.gem, r: C.gemHi,
};

function sword(ox, oy) {
  const g = layer();
  SWORD.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && set(g, ox + x, oy + y, SWORD_COLORS[ch])));
  return outlined(g);
}

// parchment: [x, y, w, h, rows] of the sheet; check / sword: top-left offsets
const LAYOUT = { parchment: [4, 3, 12, 14, 3], check: [4, 2], sword: [4, 6] };

function art() {
  const g = layer();
  over(g, parchment(...LAYOUT.parchment));
  over(g, checkMark(...LAYOUT.check));
  over(g, sword(...LAYOUT.sword));
  return g;
}

/** Bounding box of the opaque art cells. */
function bbox(a) {
  let x0 = A, y0 = A, x1 = -1, y1 = -1;
  for (let y = 0; y < A; y++)
    for (let x = 0; x < A; x++)
      if (a[y][x]) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------------------------------------------------------------- composition

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];

/**
 * Background of G x G cells: flat bg, a stepped glow and a few stars, optionally inside a
 * bevelled window frame with pixel-rounded corners (transparent or bg-filled outside them).
 */
function background(G, { frame, transparentCorners }) {
  const g = Array.from({ length: G }, () => Array(G).fill(C.bg));
  const c = (G - 1) / 2;
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const r = Math.hypot(x - c, y - c) / G;
      if (r < 0.44) g[y][x] = C.glow1;
      if (r < 0.34) g[y][x] = C.glow2;
    }
  // stars at fixed fractions so every size shows the same sky
  for (const [fx, fy, big] of [[0.14, 0.84, 1], [0.88, 0.7, 0], [0.86, 0.12, 1], [0.1, 0.18, 0]]) {
    const x = Math.round(fx * (G - 1));
    const y = Math.round(fy * (G - 1));
    g[y][x] = big ? C.starHi : C.star;
    if (big && G >= 32) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g[y + dy][x + dx] = C.star;
  }
  if (!frame) return g;
  const edge = (x, y) => Math.min(x, y, G - 1 - x, G - 1 - y);
  const corner = (x, y) => Math.min(x, G - 1 - x) + Math.min(y, G - 1 - y); // 0 at the very corner
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const e = edge(x, y);
      const k = corner(x, y);
      if (k <= 1) g[y][x] = transparentCorners ? null : C.bg;
      else if (e === 0 || k === 2) g[y][x] = x === 0 || y === 0 || (k === 2 && x + y < G) ? C.frameHi : C.frame;
      else if (e === 1 || k === 3) g[y][x] = C.frameLo;
    }
  return g;
}

/**
 * Renders the icon at `size` px: `unit` px per background cell, `scale` px per art cell.
 * The art's bounding box is centred on whole art cells so pixels stay on one grid.
 */
function render(size, { unit, scale, frame = true, transparentCorners = true }) {
  const G = size / unit;
  if (!Number.isInteger(G)) throw new Error(`unit ${unit} does not divide ${size}`);
  const bg = background(G, { frame, transparentCorners });
  const a = art();
  const b = bbox(a);
  const offX = (Math.round((size / scale - b.w) / 2) - b.x0) * scale;
  const offY = (Math.round((size / scale - b.h) / 2) - b.y0) * scale;
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ax = Math.floor((x - offX) / scale);
      const ay = Math.floor((y - offY) / scale);
      const c = a[ay]?.[ax] || bg[Math.floor(y / unit)][Math.floor(x / unit)];
      if (c) px.set(hex(c), (y * size + x) * 4);
    }
  return { size, px };
}

/** Largest art scale whose opaque art pixels all sit inside the maskable safe circle (r = 40%). */
function maskableScale(size) {
  const r = size * 0.4 - 2;
  const a = art();
  const b = bbox(a);
  for (let k = Math.floor(size / A); k > 0; k--) {
    const offX = (Math.round((size / k - b.w) / 2) - b.x0) * k;
    const offY = (Math.round((size / k - b.h) / 2) - b.y0) * k;
    let ok = true;
    for (let y = 0; y < A && ok; y++)
      for (let x = 0; x < A && ok; x++) {
        if (!a[y][x]) continue;
        for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]])
          if (Math.hypot(offX + cx * k - size / 2, offY + cy * k - size / 2) > r) ok = false;
      }
    if (ok) return k;
  }
  return 1;
}

// ---------------------------------------------------------------- PNG + SVG encoders

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none (flat pixel art deflates well as-is)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** SVG from a cell grid: one path per colour, one subpath per horizontal run. */
function toSvg(grid) {
  const n = grid.length;
  const runs = new Map();
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      const c = grid[y][x];
      let e = x + 1;
      while (e < n && grid[y][e] === c) e++;
      if (c) runs.set(c, (runs.get(c) ?? '') + `M${x} ${y}h${e - x}v1h-${e - x}z`);
      x = e;
    }
  }
  const paths = [...runs].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${paths}</svg>\n`;
}

/** Cell grid of a render whose art and background share one unit (for the SVG). */
function cells(r, unit) {
  const n = r.size / unit;
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => {
      const i = (y * unit * r.size + x * unit) * 4;
      if (r.px[i + 3] === 0) return null;
      return '#' + [r.px[i], r.px[i + 1], r.px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    }),
  );
}

// ---------------------------------------------------------------- outputs

const outputs = [
  // 26-cell art on a 32-cell window: exact integer upscales of the favicon
  { file: 'favicon-32.png', size: 32, unit: 1, scale: 1 },
  { file: 'favicon-64.png', size: 64, unit: 2, scale: 2 },
  { file: 'icon-192.png', size: 192, unit: 6, scale: 6 },
  { file: 'icon-512.png', size: 512, unit: 16, scale: 16 },
  // iOS masks its own rounded corners and shows transparency as black: full bleed, roomier padding
  { file: 'apple-touch-icon.png', size: 180, unit: 5, scale: 5, transparentCorners: false },
  // maskable: no frame (it would be cropped), art inside the 80% safe circle
  { file: 'icon-maskable-512.png', size: 512, unit: 8, scale: maskableScale(512), frame: false, transparentCorners: false },
];

mkdirSync(OUT, { recursive: true });
for (const o of outputs) {
  const r = render(o.size, o);
  writeFileSync(join(OUT, o.file), encodePng(o.size, o.size, r.px));
  console.log(`${o.file.padEnd(24)} ${o.size}px  art x${o.scale}`);
}
writeFileSync(join(OUT, 'favicon.svg'), toSvg(cells(render(32, outputs[0]), 1)));
console.log('favicon.svg');
