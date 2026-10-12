// Zone themes: UI palette + procedurally painted pixel backdrops.
import { Rng } from '../core/rng';
import { shade } from './pix';

export type ThemeId = 'tavern' | 'forest' | 'beach' | 'dungeon' | 'snow' | 'desert' | 'castle' | 'volcano';

export interface ThemeUi {
  winTop: string;
  winBot: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
  page: string;
  page2: string;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  unlockLevel: number;
  ui: ThemeUi;
  monsters: string[];
  paint: (g: Painter, w: number, h: number, rng: Rng) => void;
  animate?: (g: Painter, w: number, h: number, t: number) => void;
}

export class Painter {
  constructor(public ctx: CanvasRenderingContext2D) {}
  r(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  p(x: number, y: number, c: string) {
    this.r(x, y, 1, 1, c);
  }
  /** Horizontal 8-bit style banded gradient. */
  bands(y0: number, y1: number, w: number, colors: string[]) {
    const n = colors.length;
    const hh = (y1 - y0) / n;
    colors.forEach((c, i) => this.r(0, y0 + Math.floor(i * hh), w, Math.ceil(hh) + 1, c));
  }
  /** Dithered seam between two bands (classic checkerboard). */
  dither(y: number, w: number, c: string, rows = 1) {
    for (let j = 0; j < rows; j++) for (let x = (j % 2); x < w; x += 2) this.p(x, y + j, c);
  }
  /** Ridge line filled to bottom; heights from a smooth random walk. */
  ridge(w: number, base: number, amp: number, step: number, c: string, rng: Rng, bottom: number, jag = false) {
    let y = base + rng.int(-amp, amp) / 2;
    for (let x = 0; x < w; x += step) {
      y += jag ? rng.int(-amp, amp) : rng.int(-1, 1);
      y = Math.max(base - amp, Math.min(base + amp, y));
      this.r(x, y, step, bottom - y, c);
    }
  }
  pine(x: number, y: number, s: number, c: string, trunk = '#4a2e1c') {
    for (let i = 0; i < s; i++) this.r(x - Math.floor(i / 2), y + i, 1 + Math.floor(i / 2) * 2, 1, i % 3 === 2 ? shade(c, -0.15) : c);
    this.r(x, y + s, 1, 2, trunk);
  }
  roundTree(x: number, y: number, r: number, c: string, trunk = '#5a3a22') {
    this.r(x - 1, y + r - 1, 2, r + 2, trunk);
    for (let j = -r; j <= r; j++) {
      const hw = Math.round(Math.sqrt(r * r - j * j));
      this.r(x - hw, y + j, hw * 2, 1, j < -r / 3 ? shade(c, 0.15) : j > r / 2 ? shade(c, -0.18) : c);
    }
  }
  cloud(x: number, y: number, s: number, c = '#ffffff') {
    this.r(x, y + 2, s * 4, 2, c);
    this.r(x + s, y, s * 2, 4, c);
    this.r(x + 1, y + 1, s, 3, c);
    this.r(x, y + 4, s * 4, 1, shade(c, -0.12));
  }
}

const sky = (g: Painter, w: number, h: number, cols: string[]) => g.bands(0, h, w, cols);

export const THEMES: ThemeDef[] = [
  {
    id: 'tavern',
    name: 'Tavern',
    unlockLevel: 1,
    ui: { winTop: '#6b4426', winBot: '#3a2212', border: '#f0c878', accent: '#ffb84a', text: '#fff2d8', muted: '#d8b88a', page: '#24150c', page2: '#2e1c10' },
    monsters: ['rat', 'goblin', 'slime', 'bat'],
    paint(g, w, h, rng) {
      const floorY = Math.round(h * 0.72);
      // plank wall
      for (let x = 0; x < w; x += 6) {
        g.r(x, 0, 6, floorY, rng.chance(0.5) ? '#7a4a2a' : '#6e4226');
        g.r(x + 5, 0, 1, floorY, '#4a2a16');
        if (rng.chance(0.4)) g.p(x + 2, rng.int(4, floorY - 4), '#5a3420');
      }
      g.r(0, 4, w, 2, '#4a2a16');
      g.r(0, floorY - 10, w, 2, '#4a2a16');
      // window with night sky
      const wx = Math.round(w * 0.62);
      g.r(wx, 9, 16, 14, '#2a2050');
      g.r(wx, 9, 16, 4, '#3a2e6a');
      g.p(wx + 3, 12, '#ffffff');
      g.p(wx + 11, 16, '#ffe8a0');
      g.r(wx + 10, 12, 3, 3, '#f8f0c0');
      g.r(wx + 7, 9, 2, 14, '#5a3420');
      g.r(wx, 15, 16, 1, '#5a3420');
      g.r(wx - 1, 8, 18, 1, '#4a2a16');
      g.r(wx - 1, 23, 18, 2, '#4a2a16');
      // shelf with bottles
      const sx = Math.round(w * 0.12);
      g.r(sx, 18, 26, 2, '#4a2a16');
      const bottleCols = ['#3aa86a', '#c84a3a', '#4a6ad0', '#e0b040', '#9a4ab0'];
      for (let i = 0; i < 5; i++) {
        const bx = sx + 2 + i * 5;
        const bc = bottleCols[i % bottleCols.length];
        g.r(bx, 12, 3, 6, bc);
        g.r(bx + 1, 10, 1, 2, bc);
        g.p(bx, 13, shade(bc, 0.4));
      }
      // floor
      g.r(0, floorY, w, h - floorY, '#5a3820');
      for (let y = floorY + 3; y < h; y += 4) g.r(0, y, w, 1, '#4a2c18');
      for (let y = floorY; y < h; y += 4) for (let x = rng.int(0, 10); x < w; x += rng.int(10, 18)) g.r(x, y, 1, 3, '#4a2c18');
      // barrel
      const bx = w - 16;
      g.r(bx, floorY - 12, 12, 14, '#8a5430');
      g.r(bx - 1, floorY - 9, 14, 8, '#8a5430');
      g.r(bx - 1, floorY - 10, 14, 1, '#4a4a52');
      g.r(bx - 1, floorY - 2, 14, 1, '#4a4a52');
      g.r(bx + 2, floorY - 12, 1, 14, '#a06a40');
    },
    animate(g, w, _h, t) {
      // hanging lantern flicker
      const lx = Math.round(w * 0.42);
      g.r(lx, 0, 1, 7, '#2a1a10');
      g.r(lx - 2, 7, 5, 5, '#3a2a1a');
      const f = Math.sin(t / 120) > 0.2 ? '#ffd860' : '#ffb040';
      g.r(lx - 1, 8, 3, 3, f);
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    unlockLevel: 1,
    ui: { winTop: '#2f6b3c', winBot: '#163a20', border: '#e8f0c8', accent: '#a8e05a', text: '#f4ffe8', muted: '#b8d8a8', page: '#0f2414', page2: '#142e1a' },
    monsters: ['wolf', 'mushroom', 'goblin', 'slime'],
    paint(g, w, h, rng) {
      const groundY = Math.round(h * 0.7);
      sky(g, w, groundY, ['#6ec0f0', '#86ccf4', '#a0d8f8', '#bce4f8']);
      g.cloud(Math.round(w * 0.1), 6, 3);
      g.cloud(Math.round(w * 0.6), 12, 2);
      g.ridge(w, groundY - 18, 4, 4, '#5a9ab0', rng, groundY);
      for (let x = -2; x < w; x += rng.int(5, 8)) g.pine(x, groundY - 20 + rng.int(-2, 2), rng.int(14, 18), '#2e6a4a');
      for (let x = 4; x < w; x += rng.int(12, 20)) g.roundTree(x, groundY - 10 + rng.int(-1, 2), rng.int(5, 7), '#3a8a3a');
      g.r(0, groundY, w, h - groundY, '#5aa83a');
      g.dither(groundY, w, '#3a8a2a');
      g.r(0, groundY + 6, w, h - groundY - 6, '#4a9a32');
      for (let i = 0; i < w / 4; i++) g.p(rng.int(0, w), rng.int(groundY + 1, h - 1), rng.chance(0.15) ? rng.pick(['#ffe860', '#ff8ab0', '#ffffff']) : '#6cc04a');
    },
  },
  {
    id: 'beach',
    name: 'Beach',
    unlockLevel: 1,
    ui: { winTop: '#1a8aa0', winBot: '#0c4a5e', border: '#fff0c8', accent: '#ffd860', text: '#f4feff', muted: '#a8e0e8', page: '#082a36', page2: '#0c3442' },
    monsters: ['crab', 'slime', 'bat'],
    paint(g, w, h, rng) {
      const seaY = Math.round(h * 0.45);
      const sandY = Math.round(h * 0.68);
      sky(g, w, seaY, ['#4ab4f0', '#64c2f4', '#80d0f8', '#a0dcf8']);
      g.r(Math.round(w * 0.78), 5, 8, 8, '#fff4a0');
      g.r(Math.round(w * 0.78) + 1, 4, 6, 10, '#fff4a0');
      g.r(Math.round(w * 0.78) - 1, 6, 10, 6, '#ffe860');
      g.cloud(Math.round(w * 0.2), 8, 2);
      g.bands(seaY, sandY, w, ['#1a7ac0', '#2a90d0', '#38a8d8']);
      g.r(0, sandY, w, h - sandY, '#f0d890');
      g.dither(sandY, w, '#ffffff');
      g.r(0, sandY + 2, w, 1, '#e0c478');
      for (let i = 0; i < w / 6; i++) g.p(rng.int(0, w), rng.int(sandY + 3, h - 1), rng.chance(0.2) ? '#f08ab0' : '#d8bc70');
      // palm
      const px = Math.round(w * 0.08);
      for (let i = 0; i < 18; i++) g.r(px + Math.round(i * 0.25), sandY - i, 2, 1, i % 3 ? '#9a6a3a' : '#7a4a22');
      const top = sandY - 18;
      const fx = px + 4;
      for (const [dx, dy] of [[-6, 2], [-4, 1], [-2, 0], [0, 0], [2, 0], [4, 1], [6, 2], [-5, 3], [5, 3], [7, 4], [-7, 4]])
        g.r(fx + dx, top + dy, 2, 1, '#3a9a3a');
      g.r(fx - 1, top + 1, 2, 2, '#6a4a22');
    },
    animate(g, w, h, t) {
      const seaY = Math.round(h * 0.45);
      const sandY = Math.round(h * 0.68);
      const off = Math.floor(t / 300) % 8;
      for (let x = -8 + off; x < w; x += 8) {
        g.r(x, seaY + 3, 3, 1, '#a8e0f8');
        g.r(x + 4, seaY + 8, 2, 1, '#a8e0f8');
      }
      const surf = Math.floor(t / 500) % 2;
      for (let x = surf; x < w; x += 2) g.p(x, sandY - 1, '#e8f8ff');
    },
  },
  {
    id: 'dungeon',
    name: 'Dungeon',
    unlockLevel: 1,
    ui: { winTop: '#4a4a62', winBot: '#20202e', border: '#c8c8d8', accent: '#ff9a3a', text: '#f0f0ff', muted: '#a8a8c0', page: '#121218', page2: '#1a1a24' },
    monsters: ['skeleton', 'bat', 'rat', 'ghost', 'slime'],
    paint(g, w, h, rng) {
      const floorY = Math.round(h * 0.72);
      g.r(0, 0, w, floorY, '#3a3a4a');
      for (let y = 0; y < floorY; y += 5) {
        const off = (y / 5) % 2 ? 0 : 5;
        g.r(0, y + 4, w, 1, '#24242e');
        for (let x = -off; x < w; x += 10) {
          g.r(x + 9, y, 1, 4, '#24242e');
          if (rng.chance(0.25)) g.r(x + 1, y, 8, 4, rng.chance(0.5) ? '#424254' : '#34343f');
          g.r(x, y, 9, 1, '#4a4a5c');
        }
      }
      g.r(0, floorY, w, h - floorY, '#2a2a34');
      for (let x = 0; x < w; x += 8) g.r(x, floorY, 1, h - floorY, '#1e1e26');
      g.r(0, floorY, w, 1, '#4a4a5c');
      // chains
      const cx = Math.round(w * 0.3);
      for (let y = 0; y < 14; y += 2) g.r(cx, y, 1, 1, '#7a7a8a');
    },
    animate(g, w, _h, t) {
      for (const tx of [Math.round(w * 0.18), Math.round(w * 0.8)]) {
        g.r(tx, 14, 2, 6, '#5a3a22');
        g.r(tx - 1, 13, 4, 1, '#4a4a52');
        const k = Math.floor(t / 110) % 3;
        g.r(tx - 1, 9 + (k === 1 ? 1 : 0), 4, 4 - (k === 1 ? 1 : 0), '#ff8a2a');
        g.r(tx, 8 + k % 2, 2, 3, '#ffd860');
        g.p(tx + (k === 2 ? 1 : 0), 7, '#fff4c0');
      }
    },
  },
  {
    id: 'snow',
    name: 'Snowpeak',
    unlockLevel: 5,
    ui: { winTop: '#4a7ab8', winBot: '#22406e', border: '#ffffff', accent: '#9ae0ff', text: '#ffffff', muted: '#c8dcf0', page: '#0e1c30', page2: '#13243c' },
    monsters: ['wolf', 'ghost', 'slime'],
    paint(g, w, h, rng) {
      const groundY = Math.round(h * 0.7);
      sky(g, w, groundY, ['#8ab0e0', '#a0c0e8', '#b8d0f0', '#d0e0f8']);
      g.ridge(w, groundY - 20, 8, 3, '#e8f0ff', rng, groundY, true);
      g.ridge(w, groundY - 10, 4, 4, '#9ab0d0', rng, groundY);
      for (let x = 0; x < w; x += rng.int(6, 10)) {
        g.pine(x, groundY - 14 + rng.int(-2, 2), 13, '#2e5a5a');
        g.r(x, groundY - 13, 1, 1, '#ffffff');
      }
      g.r(0, groundY, w, h - groundY, '#f0f6ff');
      g.r(0, groundY + 4, w, 1, '#c8d8f0');
    },
    animate(g, w, h, t) {
      for (let i = 0; i < 14; i++) {
        const x = (i * 37 + Math.floor(t / 60)) % w;
        const y = (i * 23 + Math.floor(t / 40)) % h;
        g.p(x, y, '#ffffff');
      }
    },
  },
  {
    id: 'desert',
    name: 'Desert',
    unlockLevel: 10,
    ui: { winTop: '#c07a3a', winBot: '#6e3e18', border: '#fff0c0', accent: '#ffe060', text: '#fff8e8', muted: '#f0d0a0', page: '#2a1608', page2: '#341c0c' },
    monsters: ['crab', 'skeleton', 'rat'],
    paint(g, w, h, rng) {
      const groundY = Math.round(h * 0.68);
      sky(g, w, groundY, ['#f0a050', '#f4b868', '#f8cc88', '#fae0a8']);
      g.r(Math.round(w * 0.25), 6, 10, 10, '#fff0b0');
      g.ridge(w, groundY - 8, 4, 6, '#d89a50', rng, groundY);
      g.r(0, groundY, w, h - groundY, '#e8b860');
      g.dither(groundY, w, '#f0c878');
      for (let i = 0; i < w / 6; i++) g.p(rng.int(0, w), rng.int(groundY + 2, h), '#c89a48');
      const cx = Math.round(w * 0.8);
      g.r(cx, groundY - 16, 3, 16, '#3a8a3a');
      g.r(cx - 4, groundY - 11, 2, 6, '#3a8a3a');
      g.r(cx - 3, groundY - 6, 3, 2, '#3a8a3a');
      g.r(cx + 5, groundY - 13, 2, 5, '#3a8a3a');
      g.r(cx + 3, groundY - 9, 3, 2, '#3a8a3a');
    },
  },
  {
    id: 'castle',
    name: 'Castle',
    unlockLevel: 20,
    ui: { winTop: '#6a2a5a', winBot: '#30102a', border: '#f0d070', accent: '#ff7ab0', text: '#fff0fa', muted: '#e0b0d0', page: '#1a0814', page2: '#220c1c' },
    monsters: ['skeleton', 'ghost', 'bat', 'goblin'],
    paint(g, w, h, rng) {
      const floorY = Math.round(h * 0.72);
      g.r(0, 0, w, floorY, '#5a5068');
      for (let y = 0; y < floorY; y += 6) for (let x = ((y / 6) % 2) * 6; x < w; x += 12) g.r(x, y, 11, 5, rng.chance(0.3) ? '#625874' : '#564c64');
      for (const bx of [Math.round(w * 0.2), Math.round(w * 0.75)]) {
        g.r(bx, 0, 10, floorY - 6, '#a02a3a');
        g.r(bx + 3, 4, 4, 4, '#f0d070');
        g.r(bx, floorY - 6, 2, 3, '#a02a3a');
        g.r(bx + 4, floorY - 6, 2, 3, '#a02a3a');
        g.r(bx + 8, floorY - 6, 2, 3, '#a02a3a');
      }
      g.r(0, floorY, w, h - floorY, '#8a2a3a');
      g.r(0, floorY, w, 1, '#f0d070');
    },
  },
  {
    id: 'volcano',
    name: 'Volcano',
    unlockLevel: 30,
    ui: { winTop: '#8a2a1a', winBot: '#3a0e08', border: '#ffd060', accent: '#ff8a2a', text: '#fff0e0', muted: '#f0b090', page: '#1a0604', page2: '#240a06' },
    monsters: ['slime', 'bat', 'skeleton'],
    paint(g, w, h, rng) {
      const groundY = Math.round(h * 0.72);
      sky(g, w, groundY, ['#2a0a0a', '#4a1210', '#6a1e14', '#8a2e18']);
      g.ridge(w, groundY - 16, 10, 3, '#3a1a14', rng, groundY, true);
      g.r(0, groundY, w, h - groundY, '#2a1410');
      for (let x = 0; x < w; x += rng.int(8, 14)) g.r(x, groundY + rng.int(2, 6), rng.int(3, 7), 1, '#ff6a1a');
    },
    animate(g, w, h, t) {
      for (let i = 0; i < 8; i++) {
        const x = (i * 29 + Math.floor(t / 90)) % w;
        const y = h - ((i * 17 + Math.floor(t / 50)) % h);
        g.p(x, y, i % 2 ? '#ffd060' : '#ff6a1a');
      }
    },
  },
];

export const THEME_BY_ID: Record<ThemeId, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, ThemeDef>;

const sceneCache = new Map<string, HTMLCanvasElement>();

/** Static (non-animated) backdrop for a theme at a given low-res size. */
export function sceneCanvas(id: ThemeId, w: number, h: number, seed = 7): HTMLCanvasElement {
  const key = `${id}:${w}x${h}:${seed}`;
  let c = sceneCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = new Painter(c.getContext('2d')!);
    THEME_BY_ID[id].paint(g, w, h, new Rng(seed + id));
    sceneCache.set(key, c);
  }
  return c;
}

export function sceneUrl(id: ThemeId, w: number, h: number, seed = 7): string {
  return sceneCanvas(id, w, h, seed).toDataURL();
}

/** Ground line (y) where characters stand in a scene of height h. */
export function groundLine(id: ThemeId, h: number): number {
  const r = id === 'beach' ? 0.68 : id === 'desert' ? 0.68 : id === 'forest' || id === 'snow' ? 0.7 : 0.72;
  return Math.round(h * r);
}
