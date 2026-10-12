// Tiny pixel-art toolkit: draw with fills, auto-outline + auto-shade, export to canvas/dataURL.

export type Color = string | null;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Shift lightness: amt < 0 darkens, > 0 lightens. Hue-shifts slightly like real pixel artists do. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) {
    const k = 1 + amt;
    // shadows drift toward blue/purple
    return rgbToHex(r * k * 0.95, g * k * 0.95, b * k + (1 - k) * 40);
  }
  // highlights drift toward warm yellow
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt * 0.8);
}

export function hueRotate(hex: string, deg: number, satMul = 1, lightMul = 1): string {
  const [r0, g0, b0] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r0) h = ((g0 - b0) / d) % 6;
    else if (max === g0) h = (b0 - r0) / d + 2;
    else h = (r0 - g0) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const s2 = Math.min(1, s * satMul);
  const l2 = Math.min(1, l * lightMul);
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

export class Pix {
  readonly w: number;
  readonly h: number;
  private px: Color[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  get(x: number, y: number): Color {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, c: Color): this {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.px[y * this.w + x] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  /** Paint ascii art. Chars not in the map (and '.') are skipped. */
  art(rows: string[], map: Record<string, Color>, ox = 0, oy = 0, flip = false): this {
    rows.forEach((row, j) => {
      const len = row.length;
      for (let i = 0; i < len; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ' || !(ch in map)) continue;
        const x = flip ? ox + (len - 1 - i) : ox + i;
        this.set(x, oy + j, map[ch]);
      }
    });
    return this;
  }

  /** Composite another Pix on top. */
  blit(src: Pix, ox = 0, oy = 0, flip = false): this {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c) this.set(flip ? ox + src.w - 1 - x : ox + x, oy + y, c);
      }
    return this;
  }

  /** Darken silhouette pixels on the right/bottom edges (light from top-left). */
  autoShade(amt = -0.22): this {
    const copy = this.px.slice();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = copy[y * this.w + x];
        if (!c) continue;
        const right = x + 1 < this.w ? copy[y * this.w + x + 1] : null;
        const below = y + 1 < this.h ? copy[(y + 1) * this.w + x] : null;
        if (!right || !below) this.px[y * this.w + x] = shade(c, amt);
      }
    return this;
  }

  /** Add a 1px outline around everything non-empty. */
  outline(c = '#140c1c', diagonal = false): this {
    const copy = this.px.slice();
    const filled = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && copy[y * this.w + x] !== null;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x]) continue;
        let n = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
        if (!n && diagonal)
          n = filled(x - 1, y - 1) || filled(x + 1, y - 1) || filled(x - 1, y + 1) || filled(x + 1, y + 1);
        if (n) this.px[y * this.w + x] = c;
      }
    return this;
  }

  map(fn: (c: string, x: number, y: number) => Color): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (c) this.px[y * this.w + x] = fn(c, x, y);
      }
    return this;
  }

  clone(): Pix {
    const p = new Pix(this.w, this.h);
    p.px = this.px.slice();
    return p;
  }

  /** Rotate 90° clockwise `times` times (stays crisp). */
  rot90(times = 1): Pix {
    let cur: Pix = this;
    for (let t = 0; t < ((times % 4) + 4) % 4; t++) {
      const n = new Pix(cur.h, cur.w);
      for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) n.set(cur.h - 1 - y, x, cur.get(x, y));
      cur = n;
    }
    return cur === this ? this.clone() : cur;
  }

  bounds(): { x: number; y: number; w: number; h: number } {
    let minX = this.w, minY = this.h, maxX = -1, maxY = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.px[y * this.w + x]) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    return maxX < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  toImageData(): ImageData {
    const img = new ImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c) continue;
      const [r, g, b] = hexToRgb(c);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    return img;
  }

  toCanvas(scale = 1): HTMLCanvasElement {
    const base = document.createElement('canvas');
    base.width = this.w;
    base.height = this.h;
    base.getContext('2d')!.putImageData(this.toImageData(), 0, 0);
    if (scale === 1) return base;
    const c = document.createElement('canvas');
    c.width = this.w * scale;
    c.height = this.h * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    return c;
  }

  /** Draw into a 2d context at integer position with integer scale. */
  drawTo(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, flip = false): void {
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) {
        const c = this.px[j * this.w + i];
        if (!c) continue;
        ctx.fillStyle = c;
        const dx = flip ? this.w - 1 - i : i;
        ctx.fillRect(Math.round(x + dx * scale), Math.round(y + j * scale), scale, scale);
      }
  }
}

const urlCache = new Map<string, string>();
const canvasCache = new Map<string, HTMLCanvasElement>();

/** Memoized dataURL for a sprite built by `make`. */
export function spriteUrl(key: string, make: () => Pix): string {
  let u = urlCache.get(key);
  if (!u) {
    u = make().toCanvas(1).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

/** Memoized 1x canvas for fast drawImage in the stage renderer. */
export function spriteCanvas(key: string, make: () => Pix): HTMLCanvasElement {
  let c = canvasCache.get(key);
  if (!c) {
    c = make().toCanvas(1);
    canvasCache.set(key, c);
  }
  return c;
}
