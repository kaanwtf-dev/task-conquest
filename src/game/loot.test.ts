import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { BASES, SLOTS } from '../core/types';
import type { Hero, HeroStats, Item, Rarity, Slot } from '../core/types';
import type { Appearance } from '../pixel/sprites/hero';
import { CLASSES, CLASS_BY_ID } from './catalog';
import {
  MATERIAL_TABLES,
  RARITIES,
  STAT_IDS,
  baseName,
  bossChestRarity,
  chestLoot,
  familyOf,
  gearDropChance,
  gearLook,
  itemDisplayName,
  itemPower,
  luckFactor,
  materialName,
  materialOf,
  rollDrop,
  rollItem,
  rollRarity,
  sellPrice,
  starterItems,
  tierForIlvl,
  upgradeCost,
} from './loot';
import { SOFT_CAPS, computeStats } from './stats';

const HEX = /^#[0-9a-f]{6}$/i;
const stats = (over: Partial<HeroStats> = {}): HeroStats => ({ power: 0, xp: 0, gold: 0, find: 0, crit: 5, boss: 0, luck: 0, skill: 0, potion: 0, ...over });

function expectSaneName(name: string) {
  expect(typeof name).toBe('string');
  expect(name.trim().length).toBeGreaterThan(0);
  expect(name).not.toMatch(/undefined|NaN|Infinity|null|\s{2}/);
}

function expectValidItem(item: Item) {
  expect(SLOTS).toContain(item.slot);
  expect(BASES[item.slot] as readonly string[]).toContain(item.base);
  expect(item.rarity).toBeGreaterThanOrEqual(0);
  expect(item.rarity).toBeLessThanOrEqual(6);
  expect(Number.isInteger(item.material)).toBe(true);
  expect(item.material).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(item.power)).toBe(true);
  expect(item.power).toBeGreaterThan(0);
  expect(item.power).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  expect(item.affixes).toHaveLength(RARITIES[item.rarity].affixCount);
  expect(new Set(item.affixes.map((a) => a.stat)).size).toBe(item.affixes.length);
  for (const a of item.affixes) {
    expect(STAT_IDS).toContain(a.stat);
    expect(Number.isFinite(a.value)).toBe(true);
    expect(a.value).toBeGreaterThanOrEqual(1);
  }
  expectSaneName(item.name);
  expectSaneName(itemDisplayName(item));
  const mat = materialOf(item);
  expectSaneName(mat.name);
  for (const c of Object.values(mat.palette)) expect(c).toMatch(HEX);
  expect(Number.isFinite(sellPrice(item))).toBe(true);
  expect(Number.isFinite(upgradeCost(item))).toBe(true);
}

describe('rarity', () => {
  it('matches the drop weights over 20k rolls', () => {
    const rng = new Rng(12345);
    const counts = new Array(7).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i++) counts[rollRarity(rng)]++;
    const total = RARITIES.reduce((s, r) => s + r.weight, 0);
    const tol = [0.015, 0.013, 0.01, 0.006, 0.003, 0.0012, 0];
    RARITIES.forEach((r, i) => expect(Math.abs(counts[i] / n - r.weight / total)).toBeLessThanOrEqual(tol[i]));
    expect(counts[6]).toBe(0);
  });

  it('luck shifts rolls upward smoothly and stays bounded', () => {
    const mean = (luck: number) => {
      const rng = new Rng(7);
      let s = 0;
      for (let i = 0; i < 5000; i++) s += rollRarity(rng, luck);
      return s / 5000;
    };
    expect(mean(100)).toBeGreaterThan(mean(0));
    expect(mean(200)).toBeGreaterThan(mean(100));
    expect(luckFactor(1e12)).toBeLessThanOrEqual(2);
    expect(luckFactor(-50)).toBe(1);
    // even maxed luck keeps commons around
    const rng = new Rng(3);
    let commons = 0;
    for (let i = 0; i < 5000; i++) if (rollRarity(rng, 1e9) === 0) commons++;
    expect(commons / 5000).toBeGreaterThan(0.15);
  });

  it('respects minRarity and only allows Divine from ilvl 100', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 2000; i++) {
      expect(rollRarity(rng, 0, 3)).toBeGreaterThanOrEqual(3);
      expect(rollRarity(rng, 1e6, 0, 99)).toBeLessThan(6);
    }
    expect(rollRarity(rng, 0, 6)).toBe(6);
    let divine = 0;
    for (let i = 0; i < 20000; i++) if (rollRarity(rng, 200, 5, 100) === 6) divine++;
    expect(divine).toBeGreaterThan(0);
  });
});

describe('rollItem', () => {
  it('is deterministic for identical options', () => {
    const opts = { seed: 4242, ilvl: 37, luck: 20, now: 1000 };
    expect(rollItem(opts)).toEqual(rollItem(opts));
    expect(rollItem({ ...opts, slot: 'trinket' })).toEqual(rollItem({ ...opts, slot: 'trinket' }));
    expect(rollItem(opts).id).toBe(`i${(4242).toString(36)}-${(37).toString(36)}`);
    expect(rollItem({ ...opts, id: 'custom' }).id).toBe('custom');
    const names = new Set(Array.from({ length: 50 }, (_, i) => rollItem({ ...opts, seed: i }).name));
    expect(names.size).toBeGreaterThan(25);
  });

  it('rolls valid items for every slot and base', () => {
    for (const slot of SLOTS) {
      for (const base of BASES[slot]) {
        for (let s = 0; s < 40; s++) {
          const item = rollItem({ seed: s, ilvl: 1 + s * 7, base, now: 0, luck: s * 5 });
          expect(item.slot).toBe(slot);
          expect(item.base).toBe(base);
          expectValidItem(item);
        }
      }
      for (let s = 0; s < 40; s++) expect(rollItem({ seed: s, ilvl: 12, slot, now: 0 }).slot).toBe(slot);
    }
  });

  it('every rarity produces valid items and names', () => {
    for (let r = 0 as Rarity; r <= 6; r = (r + 1) as Rarity) {
      for (let s = 0; s < 30; s++) {
        const item = rollItem({ seed: s, ilvl: 50, minRarity: r, now: 0 });
        expect(item.rarity).toBeGreaterThanOrEqual(r);
        expectValidItem(item);
      }
    }
  });

  it('stays finite and sane at huge item levels', () => {
    for (const ilvl of [1, 100, 5000, 1e6]) {
      for (let s = 0; s < 60; s++) {
        const item = rollItem({ seed: s, ilvl, now: 0, minRarity: (s % 7) as Rarity });
        expect(item.ilvl).toBe(ilvl);
        expectValidItem(item);
        expect(Number.isFinite(itemPower({ ...item, upgrade: 1e6 }))).toBe(true);
      }
    }
  });

  it('power follows the slot / ilvl / rarity / tier formula', () => {
    const item = rollItem({ seed: 1, ilvl: 40, base: 'sword', now: 0 });
    const expected = Math.round(1 * (6 + 40 * 2.2) * RARITIES[item.rarity].powerMult * (1 + 0.04 * item.material));
    expect(item.power).toBe(expected);
    expect(itemPower({ ...item, upgrade: 5 })).toBe(Math.round(item.power * 1.4));
  });

  it('sanitizes bad input', () => {
    expectValidItem(rollItem({ seed: NaN, ilvl: -5, now: 0 }));
    expectValidItem(rollItem({ seed: 1.5, ilvl: Infinity, now: 0 }));
    // a base that conflicts with the requested slot is dropped
    expect(rollItem({ seed: 1, ilvl: 5, slot: 'head', base: 'sword', now: 0 }).slot).toBe('head');
  });
});

describe('materials', () => {
  it('maps bases onto families', () => {
    expect(familyOf('sword')).toBe('metal');
    expect(familyOf('bow')).toBe('wood');
    expect(familyOf('robe')).toBe('cloth');
    expect(familyOf('leather')).toBe('leather');
    expect(familyOf('amulet')).toBe('arcane');
    expect(familyOf('trinket')).toBe('arcane');
  });

  it('continues past the end of each table with numerals and new hues', () => {
    const metal = MATERIAL_TABLES.metal;
    const n = metal.length;
    expect(materialName('sword', n - 1)).toBe('Primordial');
    expect(materialName('sword', n)).toBe('Voidsteel II');
    expect(materialName('sword', n + 1)).toBe('Astral II');
    expect(materialName('sword', n + 2)).toBe('Primordial II');
    expect(materialName('sword', n + 3)).toBe('Voidsteel III');
    const a = materialOf({ base: 'sword', material: n - 1 }).palette;
    const b = materialOf({ base: 'sword', material: n + 2 }).palette;
    expect(b.main).not.toBe(a.main);
    for (const fam of Object.keys(MATERIAL_TABLES) as (keyof typeof MATERIAL_TABLES)[]) {
      for (const t of [0, 5, 50, 5000, 1e6]) expectSaneName(materialFor(fam, t));
    }
  });

  it('tiers rise with item level forever', () => {
    for (const fam of Object.keys(MATERIAL_TABLES) as (keyof typeof MATERIAL_TABLES)[]) {
      let prev = -1;
      for (const lv of [1, 2, 5, 10, 30, 100, 300, 1000, 1e6]) {
        const t = tierForIlvl(fam, lv);
        expect(t).toBeGreaterThanOrEqual(prev);
        expect(Number.isFinite(t)).toBe(true);
        prev = t;
      }
      expect(tierForIlvl(fam, 1)).toBe(0);
    }
  });
});

function materialFor(fam: keyof typeof MATERIAL_TABLES, t: number): string {
  const base = { metal: 'sword', wood: 'staff', cloth: 'robe', leather: 'leather', arcane: 'ring' }[fam] as Item['base'];
  return materialOf({ base, material: t }).name;
}

describe('names', () => {
  it('base names read naturally', () => {
    expect(baseName('leather')).toBe('Leather Armor');
    expect(baseName('chain')).toBe('Chainmail');
    expect(baseName('plate')).toBe('Plate Armor');
    expect(baseName('horned')).toBe('Horned Helm');
    for (const slot of SLOTS) for (const b of BASES[slot]) expectSaneName(baseName(b));
  });

  it('display name shows upgrades', () => {
    const item = rollItem({ seed: 9, ilvl: 9, now: 0 });
    expect(itemDisplayName(item)).toBe(item.name);
    expect(itemDisplayName({ ...item, upgrade: 3 })).toBe(`${item.name} +3`);
    expect(itemDisplayName({ ...item, name: '' })).toMatch(/\S+ \S+/);
  });

  it('commons are "<Material> <Base>", affixed items carry prefix/suffix words', () => {
    const common = rollItem({ seed: 3, ilvl: 1, base: 'plate', now: 0, minRarity: 0, luck: 0 });
    if (common.rarity === 0) expect(common.name).toBe(`${materialOf(common).name} Plate Armor`);
    for (let s = 0; s < 40; s++) {
      const epic = rollItem({ seed: s, ilvl: 20, minRarity: 2, now: 0 });
      if (epic.rarity >= 2 && epic.rarity <= 3) expect(epic.name).toMatch(/^\S+ .+ of .+$/);
    }
  });
});

describe('economy', () => {
  it('upgrade cost follows the formula, is monotonic and finite', () => {
    const item = { ilvl: 40, rarity: 3 as Rarity, upgrade: 0 };
    for (let u = 0; u <= 10; u++)
      expect(upgradeCost({ ...item, upgrade: u })).toBe(Math.round(25 * 1.17 ** u * (1 + 40 / 8) * (1 + 0.3 * 3)));
    let prev = 0;
    for (let u = 0; u <= 500; u++) {
      const c = upgradeCost({ ...item, upgrade: u });
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
    for (const ilvl of [1, 1e6]) {
      const c = upgradeCost({ ilvl, rarity: 6, upgrade: 1e6 });
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    }
  });

  it('sell price grows with ilvl and rarity', () => {
    expect(sellPrice({ ilvl: 50, rarity: 0, upgrade: 0 })).toBeGreaterThan(sellPrice({ ilvl: 5, rarity: 0, upgrade: 0 }));
    expect(sellPrice({ ilvl: 5, rarity: 4, upgrade: 0 })).toBeGreaterThan(sellPrice({ ilvl: 5, rarity: 1, upgrade: 0 }));
    expect(sellPrice({ ilvl: 1, rarity: 0, upgrade: 0 })).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(sellPrice({ ilvl: 1e6, rarity: 6, upgrade: 1e6 }))).toBe(true);
  });
});

describe('starter kits + gearLook', () => {
  it('starter items reproduce the class looks exactly', () => {
    for (const cls of CLASSES) {
      const items = starterItems(cls.id, 5);
      expect(items.length).toBeGreaterThan(0);
      const equipped: Partial<Record<Slot, Item>> = {};
      for (const it of items) {
        expect(it.id).toBe(`starter-${cls.id}-${it.slot}`);
        expect(it.rarity).toBe(0);
        expect(it.ilvl).toBe(1);
        expect(it.source).toBe('starter');
        expectValidItem(it);
        equipped[it.slot] = it;
      }
      expect(gearLook(equipped)).toEqual(CLASS_BY_ID[cls.id].look);
    }
    expect(starterItems('knight', 0).map((i) => i.name)).toEqual(['Iron Sword', 'Wooden Shield']);
  });

  it('maps every visual slot and ignores trinkets and mismatches', () => {
    const at = (base: Item['base']) => rollItem({ seed: 1, ilvl: 30, base, now: 0 });
    const look = gearLook({ weapon: at('spear'), head: at('horned'), body: at('robe'), offhand: at('orb'), cape: at('cape'), trinket: at('ring') });
    expect(look.weapon?.kind).toBe('spear');
    expect(look.head?.kind).toBe('horned');
    expect(look.body?.kind).toBe('robe');
    expect(look.offhand?.kind).toBe('orb');
    expect(look.cape).toMatch(HEX);
    expect(Object.keys(look).sort()).toEqual(['body', 'cape', 'head', 'offhand', 'weapon']);
    expect(gearLook({ head: at('sword') })).toEqual({});
    expect(gearLook({ weapon: { ...at('sword'), deleted: true } })).toEqual({});
  });
});

describe('drops + chests', () => {
  it('rollDrop is deterministic and near the advertised rates', () => {
    const opts = { seed: 77, level: 12, stats: stats(), elite: false, now: 0 };
    expect(rollDrop(opts)).toEqual(rollDrop(opts));
    let gear = 0;
    let potions = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      const d = rollDrop({ ...opts, seed: i });
      if (d.item) {
        gear++;
        expect(d.item.ilvl).toBe(12);
        expect(d.item.source).toBe('drop');
      }
      if (d.potion) {
        potions++;
        expect(d.potion.tier).toBe(d.potion.potion === 'phoenix' ? 1 : 2);
      }
    }
    expect(gear / n).toBeGreaterThan(0.08);
    expect(gear / n).toBeLessThan(0.12);
    expect(potions / n).toBeGreaterThan(0.06);
    expect(potions / n).toBeLessThan(0.1);
  });

  it('find and elites raise the gear chance, capped at 90%', () => {
    expect(gearDropChance(0, false)).toBeCloseTo(0.1);
    expect(gearDropChance(50, false)).toBeCloseTo(0.15);
    expect(gearDropChance(0, true)).toBeCloseTo(0.3);
    expect(gearDropChance(1e9, true)).toBe(0.9);
    let elite = 0;
    for (let i = 0; i < 2000; i++) if (rollDrop({ seed: i, level: 5, stats: stats(), elite: true, now: 0 }).item) elite++;
    expect(elite / 2000).toBeGreaterThan(0.25);
  });

  it('chests honor their minimum rarity', () => {
    expect(bossChestRarity(1)).toBe(3);
    expect(bossChestRarity(5)).toBe(4);
    expect(bossChestRarity(25)).toBe(5);
    expect(bossChestRarity(50)).toBe(5);
    expect(bossChestRarity(100)).toBe(6);
    expect(bossChestRarity(1e6)).toBe(6);
    for (let s = 0; s < 50; s++) {
      const q = chestLoot({ seed: s, level: 8, stats: stats(), kind: 'quest', now: 0 });
      expect(q.rarity).toBeGreaterThanOrEqual(1);
      expect(q.source).toBe('chest');
      expectValidItem(q);
      for (const bossIndex of [1, 5, 25, 100, 1e6]) {
        const b = chestLoot({ seed: s, level: 8, stats: stats(), kind: 'boss', bossIndex, now: 0 });
        expect(b.rarity).toBeGreaterThanOrEqual(bossChestRarity(bossIndex));
        expect(b.source).toBe('boss');
        expectValidItem(b);
      }
    }
    const a = chestLoot({ seed: 1, level: 8, stats: stats(), kind: 'boss', bossIndex: 3, now: 0 });
    expect(chestLoot({ seed: 1, level: 8, stats: stats(), kind: 'boss', bossIndex: 3, now: 0 })).toEqual(a);
    expect(chestLoot({ seed: 1, level: 8, stats: stats(), kind: 'quest', now: 0 }).id).not.toBe(a.id);
  });
});

describe('computeStats', () => {
  const appearance: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#000000', eyes: '#000000', beard: 'none', outfit: '#3a6ad0', pants: '#3a3a4a' };
  const hero = (over: Partial<Pick<Hero, 'equipped' | 'appearance' | 'classId'>> = {}) => ({ equipped: {}, appearance, classId: 'knight' as const, ...over });

  it('applies race and class perks with base crit', () => {
    const s = computeStats(hero(), {});
    expect(s).toEqual({ power: 0, xp: 10, gold: 0, find: 0, crit: 5, boss: 10, luck: 0, skill: 0, potion: 0 });
    expect(computeStats(hero({ appearance: { ...appearance, race: 'orc' }, classId: 'rogue' }), {}).crit).toBe(18);
    expect(computeStats(hero({ appearance: { ...appearance, race: 'imp' }, classId: 'mage' }), {})).toMatchObject({ potion: 30, xp: 5 });
  });

  it('sums equipped affixes and power, ignoring missing or deleted items', () => {
    const a = rollItem({ seed: 1, ilvl: 20, slot: 'weapon', minRarity: 3, now: 0 });
    const b = { ...rollItem({ seed: 2, ilvl: 20, slot: 'head', minRarity: 3, now: 0 }), deleted: true };
    const items = { [a.id]: a, [b.id]: b };
    const s = computeStats(hero({ equipped: { weapon: a.id, head: b.id, body: 'gone' } }), items);
    expect(s.power).toBe(itemPower(a));
    const perks: Partial<Record<string, number>> = { xp: 10, boss: 10, crit: 5 };
    for (const stat of STAT_IDS) {
      const raw = a.affixes.find((x) => x.stat === stat)?.value ?? 0;
      expect(s[stat]).toBeCloseTo(SOFT_CAPS[stat] * (1 - Math.exp(-raw / SOFT_CAPS[stat])) + (perks[stat] ?? 0), 1);
    }
  });

  it('soft caps keep every stat bounded', () => {
    const huge: Item = { ...rollItem({ seed: 1, ilvl: 1e6, slot: 'trinket', now: 0 }), affixes: STAT_IDS.map((stat) => ({ stat, value: 1e12 })) };
    const s = computeStats(hero({ equipped: { trinket: huge.id } }), { [huge.id]: huge });
    for (const stat of STAT_IDS) {
      const perks = stat === 'xp' ? 10 : stat === 'boss' ? 10 : stat === 'crit' ? 5 : 0;
      expect(s[stat]).toBeLessThanOrEqual(SOFT_CAPS[stat] + perks);
      expect(s[stat]).toBeGreaterThan(SOFT_CAPS[stat] * 0.99);
    }
    expect(Number.isFinite(s.power)).toBe(true);
  });
});
