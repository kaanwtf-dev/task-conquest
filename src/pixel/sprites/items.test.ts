import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASES, SLOTS, type BaseId, type PotionId } from '../../core/types';
import type { Pix } from '../pix';
import { MATERIALS, WEAPON_KINDS } from './gear';
import { MONSTERS, monsterPix } from './monsters';
import { CHEST_TINTS, bossPix, bossUrl, chestPix, chestUrl, itemIconPix, itemIconUrl, merchantPix, merchantUrl, potionIconPix, potionIconUrl } from './items';

const OUTLINE = '#140c1c';
const POTIONS: PotionId[] = ['insight', 'fortune', 'luck', 'fury', 'giant', 'phoenix'];
const ALL_BASES = SLOTS.flatMap((slot) => BASES[slot].map((base) => ({ slot, base: base as BaseId })));

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
  it('draws a non-empty 16x16 icon for every base in every material', () => {
    for (const palette of Object.values(MATERIALS))
      for (const { slot, base } of ALL_BASES) {
        const p = itemIconPix({ slot, base, palette });
        expect([p.w, p.h]).toEqual([16, 16]);
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
    expect(merchantUrl()).toBe(merchantUrl());
    const a = itemIconUrl({ slot: 'head', base: 'helm', palette: MATERIALS.iron });
    expect(itemIconUrl({ slot: 'head', base: 'helm', palette: { ...MATERIALS.iron } })).toBe(a);
    expect(itemIconUrl({ slot: 'head', base: 'helm', palette: MATERIALS.gold })).not.toBe(a);
  });
});
