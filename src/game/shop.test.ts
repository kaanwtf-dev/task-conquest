import { describe, expect, it } from 'vitest';
import type { Hero } from '../core/types';
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
