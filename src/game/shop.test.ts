import { describe, expect, it } from 'vitest';
import type { Hero } from '../core/types';
import { HAIR_COLORS, OUTFIT_COLORS } from '../pixel/sprites/hero';
import { THEMES } from '../pixel/themes';
import { sellPrice } from './loot';
import { POTION_IDS, potionTier } from './potions';
import { xpToNext } from './progression';
import { BAG_MAX, BAG_STEP, DYES, SHOP_GEAR_MARKUP, SHOP_GEAR_OFFERS, bagUpgradePrice, dailyStock, dyeKey, permanentOffers, themeUnlockPrice } from './shop';

const hero = (over: Partial<Pick<Hero, 'bagSize' | 'owned' | 'xp'>> = {}) => ({ bagSize: 24, owned: [], xp: {}, ...over });
const xpForLevel = (level: number) => {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpToNext(l);
  return t;
};

describe('dailyStock', () => {
  it('is stable for a date and differs across dates', () => {
    const a = dailyStock('2026-10-12', 14, 10, 1000);
    expect(dailyStock('2026-10-12', 14, 10, 1000)).toEqual(a);
    const b = dailyStock('2026-10-13', 14, 10, 1000);
    const names = (o: typeof a) => o.filter((x) => x.kind === 'item').map((x) => x.item!.name).join('|');
    expect(names(b)).not.toBe(names(a));
    // same level bracket, same stock
    expect(dailyStock('2026-10-12', 12, 10, 1000)).toEqual(a);
  });

  it('offers min-Uncommon gear at 4x sell price and every potion at the hero tier', () => {
    const stock = dailyStock('2026-01-01', 23, 0, 0);
    const gear = stock.filter((o) => o.kind === 'item');
    expect(gear).toHaveLength(SHOP_GEAR_OFFERS);
    expect(new Set(gear.map((g) => g.item!.slot)).size).toBe(SHOP_GEAR_OFFERS);
    for (const g of gear) {
      expect(g.item!.rarity).toBeGreaterThanOrEqual(1);
      expect(g.item!.source).toBe('shop');
      expect(g.price).toBe(sellPrice(g.item!) * SHOP_GEAR_MARKUP);
      expect(g.label.length).toBeGreaterThan(0);
    }
    const potions = stock.filter((o) => o.kind === 'potion');
    expect(potions.map((p) => p.potion!.potion).sort()).toEqual([...POTION_IDS].sort());
    for (const p of potions) expect(p.potion!.tier).toBe(p.potion!.potion === 'phoenix' ? 1 : potionTier(23));
    expect(new Set(stock.map((o) => o.id)).size).toBe(stock.length);
  });

  it('a new level bracket is a new stock with new offer ids', () => {
    const gearIds = (lv: number, luck = 0) => dailyStock('2026-10-13', lv, luck, 0).filter((o) => o.kind === 'item').map((o) => o.id);
    expect(gearIds(11)).toEqual(gearIds(15));
    // a "sold" mark from levels 11-15 must not stick to the 16-20 stock
    for (const id of gearIds(16)) expect(gearIds(15)).not.toContain(id);
    // luck re-rolls rarity of the same offers: ids stay, the base stays, item ids follow the roll
    const lo = dailyStock('2026-10-13', 30, 0, 0).filter((o) => o.kind === 'item');
    const hi = dailyStock('2026-10-13', 30, 180, 0).filter((o) => o.kind === 'item');
    expect(hi.map((o) => o.id)).toEqual(lo.map((o) => o.id));
    expect(hi.map((o) => o.item!.base)).toEqual(lo.map((o) => o.item!.base));
    for (let i = 0; i < lo.length; i++) expect(hi[i].item!.id).not.toBe(lo[i].item!.id);
    expect(dailyStock('2026-10-13', 30, 24, 0)).toEqual(dailyStock('2026-10-13', 30, 0, 0));
  });

  it('handles junk input', () => {
    for (const [day, lv, luck] of [['', NaN, NaN], ['x', -5, -100], ['2026-01-01', Infinity, Infinity]] as const) {
      const stock = dailyStock(day, lv, luck, 0);
      expect(stock.filter((o) => o.kind === 'item')).toHaveLength(SHOP_GEAR_OFFERS);
      for (const o of stock) {
        expect(Number.isFinite(o.price)).toBe(true);
        expect(o.price).toBeGreaterThan(0);
        expect(o.label).not.toMatch(/undefined|NaN|Infinity/);
      }
    }
  });

  it('stays finite at absurd levels', () => {
    for (const o of dailyStock('2030-05-05', 1e6, 1e6, 0)) {
      expect(Number.isFinite(o.price)).toBe(true);
      expect(o.label).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('permanent offers', () => {
  it('lists bag, early themes and unowned dyes', () => {
    const offers = permanentOffers(hero());
    expect(offers.filter((o) => o.kind === 'bag')).toHaveLength(1);
    const themes = offers.filter((o) => o.kind === 'theme').map((o) => o.theme);
    expect(themes).toEqual(THEMES.filter((t) => t.unlockLevel > 1).map((t) => t.id));
    expect(offers.filter((o) => o.kind === 'dye')).toHaveLength(DYES.length);
    for (const o of offers) expect(o.price).toBeGreaterThan(0);
  });

  it('hides owned unlocks and themes already reached by level', () => {
    const d = DYES[0];
    const owned = ['theme:snow', dyeKey(d.target, d.color)];
    const offers = permanentOffers(hero({ owned, xp: { dev: xpForLevel(12) } }));
    const ids = offers.map((o) => o.id);
    expect(ids).not.toContain('theme:snow');
    expect(ids).not.toContain('theme:desert'); // level 12 >= 10
    expect(ids).toContain('theme:castle');
    expect(ids).not.toContain(dyeKey(d.target, d.color));
    expect(permanentOffers(hero({ bagSize: BAG_MAX })).some((o) => o.kind === 'bag')).toBe(false);
  });

  it('works for legacy heroes and never overfills the bag', () => {
    const legacy = permanentOffers({ bagSize: undefined, owned: undefined, xp: undefined } as unknown as Pick<Hero, 'bagSize' | 'owned' | 'xp'>);
    expect(legacy.find((o) => o.kind === 'bag')?.label).toBe(`Bigger Bag (+${BAG_STEP} slots)`);
    expect(permanentOffers(hero({ bagSize: BAG_MAX - 2 })).find((o) => o.kind === 'bag')?.label).toBe('Bigger Bag (+2 slots)');
    const all = [...dailyStock('2026-10-13', 7, 0, 0), ...legacy];
    expect(new Set(all.map((o) => o.id)).size).toBe(all.length);
  });

  it('dyes are valid, unique and not free colors', () => {
    const seen = new Set<string>();
    for (const d of DYES) {
      expect(d.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(dyeKey(d.target, d.color)).toBe(`dye:${d.target}:${d.color}`);
      expect(seen.has(dyeKey(d.target, d.color))).toBe(false);
      seen.add(dyeKey(d.target, d.color));
      if (d.target === 'hair') expect(HAIR_COLORS).not.toContain(d.color);
      if (d.target === 'outfit') expect(OUTFIT_COLORS).not.toContain(d.color);
    }
    expect(dyeKey('outfit', '#FF00AA')).toBe('dye:outfit:#ff00aa');
  });

  it('bag and theme prices are sane', () => {
    let prev = 0;
    for (let size = 24; size <= BAG_MAX; size += BAG_STEP) {
      const p = bagUpgradePrice(size);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    expect(Number.isFinite(bagUpgradePrice(1e9))).toBe(true);
    expect(themeUnlockPrice('tavern')).toBe(0);
    expect(themeUnlockPrice('volcano')).toBeGreaterThan(themeUnlockPrice('snow'));
  });
});
