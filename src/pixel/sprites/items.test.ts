import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASES, SLOTS, type BaseId, type PotionId, type Slot } from '../../core/types';
import type { Pix } from '../pix';
import { MATERIALS, WEAPON_KINDS } from './gear';
import { MONSTERS, monsterPix } from './monsters';
import { CHEST_TINTS, bossPix, bossUrl, chestPix, chestUrl, itemIconPix, itemIconUrl, merchantPix, merchantUrl, potionIconPix, potionIconUrl } from './items';

const OUTLINE = '#140c1c';
const POTIONS: PotionId[] = ['insight', 'fortune', 'luck', 'fury', 'giant', 'phoenix'];
const ALL_BASES = SLOTS.flatMap((slot) => BASES[slot].map((base) => ({ slot, base: base as BaseId })));
const PROTO_KEYS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

function pixels(p: Pix): (string | null)[] {
  const out: (string | null)[] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) out.push(p.get(x, y));
  return out;
}
const dump = (p: Pix) => pixels(p).join(',');
const mask = (p: Pix) => pixels(p).map((c) => (c ? 1 : 0)).join('');
const filled = (p: Pix) => pixels(p).filter(Boolean).length;
const colors = (p: Pix) => new Set(pixels(p).filter(Boolean));

/** Fill pixels touching the canvas edge would lose their outline there. */
function edgeFill(p: Pix, outline: string): number {
  let n = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = p.get(x, y);
      if (c && c !== outline && (x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1)) n++;
    }
  return n;
}

describe('itemIconPix', () => {
  it('draws a non-empty square icon for every base in every material (weapons get an 18px canvas so outlines are never clipped)', () => {
    for (const palette of Object.values(MATERIALS))
      for (const { slot, base } of ALL_BASES) {
        const p = itemIconPix({ slot, base, palette });
        expect([p.w, p.h]).toEqual(slot === 'weapon' ? [18, 18] : [16, 16]);
        expect(filled(p)).toBeGreaterThan(30);
      }
  });

  it('gives every base its own silhouette', () => {
    const masks = ALL_BASES.map(({ slot, base }) => mask(itemIconPix({ slot, base, palette: MATERIALS.iron })));
    expect(new Set(masks).size).toBe(ALL_BASES.length);
  });

  it('recolors every base from the material palette', () => {
    for (const { slot, base } of ALL_BASES) {
      const iron = itemIconPix({ slot, base, palette: MATERIALS.iron });
      const gold = itemIconPix({ slot, base, palette: MATERIALS.gold });
      expect(mask(iron)).toBe(mask(gold));
      expect(dump(iron)).not.toBe(dump(gold));
      const pal = Object.values(MATERIALS.gold);
      expect([...colors(gold)].some((c) => pal.includes(c as string))).toBe(true);
    }
  });

  it('outlines new icons fully inside the frame', () => {
    for (const { slot, base } of ALL_BASES) {
      if ((WEAPON_KINDS as readonly string[]).includes(base)) continue;
      const p = itemIconPix({ slot, base, palette: MATERIALS.steel });
      expect(edgeFill(p, OUTLINE), base).toBe(0);
      expect(colors(p).has(OUTLINE)).toBe(true);
    }
  });

  it('falls back to the slot default for unknown bases', () => {
    const palette = MATERIALS.elven;
    expect(dump(itemIconPix({ slot: 'head', base: 'nope' as BaseId, palette }))).toBe(dump(itemIconPix({ slot: 'head', base: 'helm', palette })));
    expect(dump(itemIconPix({ slot: 'weapon', base: 'nope' as BaseId, palette }))).toBe(dump(itemIconPix({ slot: 'weapon', base: 'sword', palette })));
  });

  it('treats Object.prototype names in synced data as unknown instead of crashing', () => {
    const palette = MATERIALS.iron;
    const helm = dump(itemIconPix({ slot: 'head', base: 'helm', palette }));
    const sword = dump(itemIconPix({ slot: 'weapon', base: 'sword', palette }));
    for (const k of PROTO_KEYS) {
      expect(dump(itemIconPix({ slot: 'head', base: k as BaseId, palette })), k).toBe(helm);
      expect(dump(itemIconPix({ slot: k as Slot, base: k as BaseId, palette })), k).toBe(sword);
    }
  });

  it('is deterministic', () => {
    for (const { slot, base } of ALL_BASES) expect(dump(itemIconPix({ slot, base, palette: MATERIALS.glass }))).toBe(dump(itemIconPix({ slot, base, palette: MATERIALS.glass })));
  });
});

describe('potionIconPix', () => {
  it('gives each potion a distinct silhouette', () => {
    const masks = POTIONS.map((id) => mask(potionIconPix(id, 1)));
    expect(new Set(masks).size).toBe(POTIONS.length);
  });

  it('adds ribbon + sparkles at tier 5 and more at tier 10+', () => {
    for (const id of POTIONS) {
      const t1 = potionIconPix(id, 1);
      const t5 = potionIconPix(id, 5);
      const t12 = potionIconPix(id, 12);
      expect(dump(t5)).not.toBe(dump(t1));
      expect(filled(t5)).toBeGreaterThan(filled(t1));
      expect(filled(t12)).toBeGreaterThan(filled(t5));
      expect(colors(t5).has('#ffffff')).toBe(true);
    }
  });

  it('never breaks on huge or invalid tiers', () => {
    for (const id of POTIONS) {
      const t12 = dump(potionIconPix(id, 12));
      expect(dump(potionIconPix(id, 1e6))).toBe(t12);
      expect(dump(potionIconPix(id, Infinity))).toBe(t12);
      for (const t of [0, -3, NaN, -Infinity]) expect(dump(potionIconPix(id, t))).toBe(dump(potionIconPix(id, 1)));
    }
    expect(filled(potionIconPix('bogus' as PotionId, 3))).toBeGreaterThan(30);
    expect(dump(potionIconPix('bogus' as PotionId, 7))).toBe(dump(potionIconPix('insight', 7)));
    for (const k of PROTO_KEYS) expect(dump(potionIconPix(k as PotionId, 7)), k).toBe(dump(potionIconPix('insight', 7)));
  });

  it('switches look exactly at tiers 5 and 10', () => {
    for (const id of POTIONS) {
      expect(dump(potionIconPix(id, 4.99))).toBe(dump(potionIconPix(id, 1)));
      expect(dump(potionIconPix(id, 9.99))).toBe(dump(potionIconPix(id, 5)));
      expect(dump(potionIconPix(id, 10))).toBe(dump(potionIconPix(id, 12)));
      expect(dump(potionIconPix(id, 10))).not.toBe(dump(potionIconPix(id, 9)));
    }
  });

  it('draws the phoenix as a feather, not a corked bottle', () => {
    expect(colors(potionIconPix('phoenix', 1)).has('#c08a5a')).toBe(false);
    for (const id of POTIONS.filter((p) => p !== 'phoenix')) expect(colors(potionIconPix(id, 1)).has('#c08a5a')).toBe(true);
  });
});

describe('chestPix', () => {
  it('tints chests by rarity, open and closed', () => {
    const closed = CHEST_TINTS.map((_, r) => dump(chestPix(r, false)));
    const open = CHEST_TINTS.map((_, r) => dump(chestPix(r, true)));
    expect(new Set(closed).size).toBe(CHEST_TINTS.length);
    expect(new Set(open).size).toBe(CHEST_TINTS.length);
    CHEST_TINTS.forEach((tint, r) => {
      expect(colors(chestPix(r, false)).has(tint)).toBe(true);
      expect(mask(chestPix(r, true))).not.toBe(mask(chestPix(r, false)));
    });
  });

  it('clamps out-of-range rarities', () => {
    expect(dump(chestPix(-4, false))).toBe(dump(chestPix(0, false)));
    expect(dump(chestPix(99, true))).toBe(dump(chestPix(6, true)));
    expect(dump(chestPix(2.7, false))).toBe(dump(chestPix(2, false)));
    expect(dump(chestPix(NaN, false))).toBe(dump(chestPix(0, false)));
    expect(dump(chestPix(Infinity, false))).toBe(dump(chestPix(6, false)));
    expect(dump(chestPix(-Infinity, true))).toBe(dump(chestPix(0, true)));
  });

  it('keeps the vertical bands straight past the lock', () => {
    for (const open of [false, true])
      for (let r = 0; r < CHEST_TINTS.length; r++) {
        const p = chestPix(r, open);
        const tint = CHEST_TINTS[r];
        for (let y = 0; y < 16; y++) {
          const cols: number[] = [];
          for (let x = 0; x < 16; x++) if (p.get(x, y) === tint) cols.push(x);
          // rows that are not a horizontal band show the two straps only (x=1 is the open rim's corner)
          const straps = cols.filter((x) => x !== 1);
          if (straps.length > 0 && cols.length <= 3) expect(straps, `r${r} open=${open} y${y}`).toEqual([5, 10]);
        }
      }
  });

  it('draws the open chest body without a notch on the right edge', () => {
    const p = chestPix(2, true);
    for (let y = 5; y <= 14; y++) {
      expect(p.get(14, y), `y${y}`).not.toBeNull();
      expect(p.get(14, y), `y${y}`).not.toBe(OUTLINE);
      expect(p.get(15, y), `y${y}`).toBe(OUTLINE);
    }
  });
});

describe('bossPix', () => {
  it('doubles every archetype to 40x40 with a gold crown and heavy outline', () => {
    for (const m of MONSTERS) {
      const p = bossPix(m.id, 0);
      expect([p.w, p.h]).toEqual([40, 40]);
      const cs = colors(p);
      expect(cs.has('#f2c94c'), m.id).toBe(true);
      expect(cs.has('#07040b'), m.id).toBe(true);
      // the crown's base must rest on the body, not float
      let baseY = -1;
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (p.get(x, y) === '#b8862b') baseY = Math.max(baseY, y);
      expect(baseY, m.id).toBeGreaterThan(3);
      let seated = false;
      for (let x = 0; x < 40; x++) {
        const below = p.get(x, baseY + 1);
        if (p.get(x, baseY) === '#b8862b' && below && below !== '#07040b') seated = true;
      }
      expect(seated, m.id).toBe(true);
      expect(filled(p), m.id).toBeGreaterThan(filled(monsterPix(m.id)) * 3);
    }
  });

  it('palette-swaps by hue and survives huge or invalid hues', () => {
    const base = dump(bossPix('goblin', 0));
    expect(dump(bossPix('goblin', 140))).not.toBe(base);
    expect(dump(bossPix('goblin', 360))).toBe(base);
    expect(dump(bossPix('goblin', -220))).toBe(dump(bossPix('goblin', 140)));
    expect(dump(bossPix('goblin', 1e6))).toBe(dump(bossPix('goblin', 1e6 % 360)));
    expect(dump(bossPix('goblin', NaN))).toBe(base);
    expect(dump(bossPix('goblin', Infinity))).toBe(base);
  });

  it('falls back to the first archetype for unknown ids', () => {
    expect(dump(bossPix('no-such-monster', 30))).toBe(dump(bossPix(MONSTERS[0].id, 30)));
    for (const k of PROTO_KEYS) expect(dump(bossPix(k, 30)), k).toBe(dump(bossPix(MONSTERS[0].id, 30)));
  });

  it('outlines the bottom edge too when the archetype has headroom', () => {
    for (const m of MONSTERS) {
      if (m.art.length >= 20) continue;
      const p = bossPix(m.id, 0);
      const bottom: (string | null)[] = [];
      for (let x = 0; x < 40; x++) bottom.push(p.get(x, 39));
      expect(bottom.filter((c) => c && c !== '#07040b'), m.id).toEqual([]);
      expect(bottom.includes('#07040b'), m.id).toBe(true);
    }
  });

  it('only uses valid colors for any hue', () => {
    for (const m of MONSTERS)
      for (const hue of [0, 1, 359.6, -1e9, 1e300]) for (const c of colors(bossPix(m.id, hue))) expect(c, `${m.id} ${hue}`).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('merchantPix', () => {
  it('draws a 40x40 shopkeeper with apron and coin pouch', () => {
    const p = merchantPix();
    expect([p.w, p.h]).toEqual([40, 40]);
    const cs = colors(p);
    expect(cs.has('#e8dcc0')).toBe(true);
    expect(cs.has('#c8904a')).toBe(true);
    expect(cs.has('#f2c94c')).toBe(true);
    expect(dump(merchantPix())).toBe(dump(p));
  });
});

describe('cached url helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('share cache entries between visually identical inputs', () => {
    // minimal canvas stub: every rendered sprite gets a unique data url
    let n = 0;
    vi.stubGlobal('ImageData', class {
      data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    });
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {}, drawImage() {} }), toDataURL: () => `data:test/${++n}` }),
    });
    expect(potionIconUrl('luck', 12)).toBe(potionIconUrl('luck', 1e6));
    expect(potionIconUrl('luck', 1)).toBe(potionIconUrl('luck', 4));
    expect(potionIconUrl('luck', 1)).not.toBe(potionIconUrl('luck', 5));
    expect(chestUrl(42, true)).toBe(chestUrl(6, true));
    expect(chestUrl(6, true)).not.toBe(chestUrl(6, false));
    expect(bossUrl('goblin', 365)).toBe(bossUrl('goblin', 5));
    expect(bossUrl('who', 0)).toBe(bossUrl(MONSTERS[0].id, 0));
    expect(bossUrl('constructor', 0)).toBe(bossUrl(MONSTERS[0].id, 0));
    expect(potionIconUrl('__proto__' as PotionId, 3)).toBe(potionIconUrl('insight', 3));
    expect(merchantUrl()).toBe(merchantUrl());
    const a = itemIconUrl({ slot: 'head', base: 'helm', palette: MATERIALS.iron });
    expect(itemIconUrl({ slot: 'head', base: 'helm', palette: { ...MATERIALS.iron } })).toBe(a);
    expect(itemIconUrl({ slot: 'head', base: 'helm', palette: MATERIALS.gold })).not.toBe(a);
  });
});
