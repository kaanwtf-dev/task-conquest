// Procedural, infinite loot: rarities, material tiers, affixes, names, prices, drops and chests.
// Everything is a pure function of its inputs (seeded Rng, time passed in) so items reproduce exactly.
import { Rng, hashStr } from '../core/rng';
import { BASES, SLOTS } from '../core/types';
import type { Affix, BaseId, ClassId, HeroStats, Item, PotionId, Rarity, Slot, StatId } from '../core/types';
import { getLang, t, tk } from '../i18n';
import { hueRotate, shade } from '../pixel/pix';
import { MATERIALS, type MaterialPalette } from '../pixel/sprites/gear';
import type { BodyKind, GearLook, HeadKind } from '../pixel/sprites/hero';
import { CLASSES } from './catalog';
import { potionTierFor } from './potions';
import { roman } from './progression';

const MAX = Number.MAX_SAFE_INTEGER;

/** Roman numerals while they stay short, plain digits after that. */
export const numeral = (n: number): string => (n < 4000 ? roman(n) : String(n));

const posInt = (n: number, min: number) => (Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min);
const ilvlOf = (n: number) => posInt(n, 1);
const upgradeOf = (item: Pick<Item, 'upgrade'>) => posInt(item.upgrade, 0);

// ---------------------------------------------------------------- rarity

export interface RarityDef {
  name: string;
  color: string; // readable on the dark blue UI
  affixCount: number;
  powerMult: number;
  weight: number; // base drop weight
}

export const RARITIES: readonly RarityDef[] = [
  { name: tk('Common'), color: '#f4f4f4', affixCount: 0, powerMult: 1, weight: 55 },
  { name: tk('Uncommon'), color: '#5ee06a', affixCount: 1, powerMult: 1.15, weight: 28 },
  { name: tk('Rare'), color: '#5aa8ff', affixCount: 2, powerMult: 1.35, weight: 12 },
  { name: tk('Epic'), color: '#c77dff', affixCount: 3, powerMult: 1.6, weight: 4 },
  { name: tk('Legendary'), color: '#ff9f2e', affixCount: 4, powerMult: 2, weight: 0.9 },
  { name: tk('Mythic'), color: '#ff5050', affixCount: 5, powerMult: 2.5, weight: 0.1 },
  { name: tk('Divine'), color: '#5ff0f0', affixCount: 6, powerMult: 3.2, weight: 0 },
];

/** Divine only drops naturally from item level 100 on, and only rarely. */
export const DIVINE_WEIGHT = 0.01;
export const DIVINE_MIN_ILVL = 100;

export function clampRarity(r: number): Rarity {
  return (Number.isFinite(r) ? Math.max(0, Math.min(6, Math.floor(r))) : 0) as Rarity;
}

export const rarityDef = (r: number): RarityDef => RARITIES[clampRarity(r)];
export const rarityOf = (item: Pick<Item, 'rarity'>): RarityDef => rarityDef(item.rarity);
/** Translated. */
export const rarityName = (r: number): string => t(rarityDef(r).name);
export const rarityColor = (r: number): string => rarityDef(r).color;

/** Multiplier applied per rarity step: 1 at luck 0, approaching 2 as luck grows. */
export function luckFactor(luck: number): number {
  const l = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  return 2 - Math.exp(-l / 150);
}

export function rarityWeights(luck = 0, minRarity: number = 0, ilvl = 1): [Rarity, number][] {
  const k = luckFactor(luck);
  const out: [Rarity, number][] = [];
  for (let r = clampRarity(minRarity); r <= 6; r++) {
    const base = r === 6 ? (ilvlOf(ilvl) >= DIVINE_MIN_ILVL ? DIVINE_WEIGHT : 0) : RARITIES[r].weight;
    const w = base * Math.pow(k, r);
    if (w > 0) out.push([r as Rarity, w]);
  }
  return out;
}

export function rollRarity(rng: Rng, luck = 0, minRarity: number = 0, ilvl = 1): Rarity {
  const entries = rarityWeights(luck, minRarity, ilvl);
  return entries.length ? rng.weighted(entries) : clampRarity(minRarity);
}

// ---------------------------------------------------------------- bases

export const BASE_NAMES: Record<BaseId, string> = {
  sword: tk('Sword'),
  axe: tk('Axe'),
  dagger: tk('Dagger'),
  staff: tk('Staff'),
  bow: tk('Bow'),
  mace: tk('Mace'),
  spear: tk('Spear'),
  hammer: tk('Warhammer'),
  wand: tk('Wand'),
  helm: tk('Helm'),
  hood: tk('Hood'),
  hat: tk('Hat'),
  crown: tk('Crown'),
  circlet: tk('Circlet'),
  horned: tk('Horned Helm'),
  leather: tk('Leather Armor'),
  chain: tk('Chainmail'),
  plate: tk('Plate Armor'),
  robe: tk('Robe'),
  shield: tk('Shield'),
  buckler: tk('Buckler'),
  tome: tk('Tome'),
  orb: tk('Orb'),
  cape: tk('Cape'),
  ring: tk('Ring'),
  amulet: tk('Amulet'),
  charm: tk('Charm'),
};

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: tk('Weapon'),
  head: tk('Head'),
  body: tk('Body'),
  offhand: tk('Off-hand'),
  cape: tk('Cape'),
  trinket: tk('Trinket'),
};

/** English (it is part of stored item names); show it with t(baseName(b)). */
export const baseName = (base: BaseId): string => BASE_NAMES[base] ?? tk('Relic');

const SLOT_OF_BASE = Object.fromEntries(SLOTS.flatMap((s) => BASES[s].map((b) => [b, s]))) as Record<BaseId, Slot>;
export const slotOfBase = (base: BaseId): Slot | undefined => SLOT_OF_BASE[base];

// ---------------------------------------------------------------- materials

export type MaterialFamily = 'metal' | 'wood' | 'cloth' | 'leather' | 'arcane';

export const FAMILY_OF: Record<BaseId, MaterialFamily> = {
  sword: 'metal',
  axe: 'metal',
  dagger: 'metal',
  mace: 'metal',
  spear: 'metal',
  hammer: 'metal',
  helm: 'metal',
  horned: 'metal',
  chain: 'metal',
  plate: 'metal',
  shield: 'metal',
  buckler: 'metal',
  staff: 'wood',
  bow: 'wood',
  wand: 'wood',
  hood: 'cloth',
  hat: 'cloth',
  robe: 'cloth',
  cape: 'cloth',
  leather: 'leather',
  crown: 'arcane',
  circlet: 'arcane',
  tome: 'arcane',
  orb: 'arcane',
  ring: 'arcane',
  amulet: 'arcane',
  charm: 'arcane',
};

const SLOT_FAMILY: Record<Slot, MaterialFamily> = {
  weapon: 'metal',
  head: 'metal',
  body: 'metal',
  offhand: 'metal',
  cape: 'cloth',
  trinket: 'arcane',
};

export function familyOf(slotOrBase: Slot | BaseId): MaterialFamily {
  return (FAMILY_OF as Record<string, MaterialFamily>)[slotOrBase] ?? SLOT_FAMILY[slotOrBase as Slot] ?? 'metal';
}

export interface MaterialTier {
  name: string;
  minIlvl: number;
  pal: MaterialPalette;
}

export interface MaterialInfo {
  name: string;
  palette: MaterialPalette;
}

const P = (main: string, light: string, dark: string, trim: string, gem: string): MaterialPalette => ({ main, light, dark, trim, gem });
const tiers = (minIlvls: number[], defs: [string, MaterialPalette][]): MaterialTier[] =>
  defs.map(([name, pal], i) => ({ name, pal, minIlvl: minIlvls[i] }));

export const MATERIAL_TABLES: Record<MaterialFamily, MaterialTier[]> = {
  metal: tiers(
    [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 92, 108, 126, 146, 170],
    [
      [tk('Rusty'), P('#a0745a', '#c89878', '#6a4636', '#5a4030', '#8a8a8a')],
      [tk('Iron'), MATERIALS.iron],
      [tk('Steel'), MATERIALS.steel],
      [tk('Silver'), P('#dfe6f0', '#ffffff', '#8e9bb0', '#5b6ee1', '#99e5ff')],
      [tk('Elven'), MATERIALS.elven],
      [tk('Dwarven'), P('#d9a066', '#f6d29a', '#8a5a2a', '#5a3a28', '#d95763')],
      [tk('Orcish'), P('#7a8a5a', '#a8b884', '#4a5636', '#5a3a28', '#d95763')],
      [tk('Glass'), MATERIALS.glass],
      [tk('Ebony'), MATERIALS.ebony],
      [tk('Infernal'), MATERIALS.infernal],
      [tk('Dragonbone'), P('#e8dcc0', '#fffaf0', '#a89a78', '#8a3a2a', '#ff6a3a')],
      [tk('Stormsilver'), P('#c8e8ff', '#ffffff', '#7aa0c8', '#e8e8f8', '#5fcde4')],
      [tk('Adamant'), P('#4a9a8a', '#7ad0b8', '#2a5a5a', '#c8a040', '#d95763')],
      [tk('Celestial'), P('#fff2a8', '#ffffff', '#d0a040', '#5fcde4', '#ffffff')],
      // the last three names repeat forever with rotated hues, so their colors (gems too) must be saturated
      [tk('Voidsteel'), P('#3a2a5a', '#6a4aa0', '#1a1030', '#a050ff', '#ff50ff')],
      [tk('Astral'), P('#5a6ae0', '#a0b0ff', '#2a2a8a', '#fff2a8', '#ff6ad8')],
      [tk('Primordial'), P('#40d0b0', '#b0fff0', '#1a6a6a', '#ff5a8a', '#ffe040')],
    ],
  ),
  wood: tiers(
    [1, 4, 9, 15, 22, 30, 40, 52, 66, 82, 100],
    [
      [tk('Wooden'), MATERIALS.wood],
      [tk('Oak'), P('#9a6a3a', '#c08a50', '#5a3a1e', '#b8c0c8', '#99e550')],
      [tk('Yew'), P('#c08a5a', '#e0b080', '#7a5030', '#c8a040', '#d95763')],
      [tk('Ironwood'), P('#6a5a4a', '#8a7a6a', '#3a2e26', '#b8c0c8', '#5fcde4')],
      [tk('Elderwood'), P('#7a8a4a', '#a8b870', '#4a5228', '#e0b040', '#99e550')],
      [tk('Moonwood'), P('#b0b8d8', '#e8ecff', '#6a7098', '#d6e2ea', '#5fcde4')],
      [tk('Ghostwood'), P('#d8e0d8', '#ffffff', '#8a9a90', '#5ff0f0', '#5ff0f0')],
      [tk('Bloodwood'), P('#8a2a2a', '#c04a3a', '#4a1218', '#e0b040', '#ff6a3a')],
      [tk('Wyrmwood'), P('#3a7a5a', '#5aa87a', '#1e4a34', '#e0b040', '#ffcc33')],
      [tk('Starwood'), P('#3a3a8a', '#6a6ad0', '#1e1e4a', '#fff2a8', '#ffd84a')],
      [tk('Worldroot'), P('#c8a060', '#fff0b0', '#7a5a2a', '#5fcde4', '#99e550')],
    ],
  ),
  cloth: tiers(
    [1, 4, 9, 15, 22, 30, 40, 52, 66, 82, 100],
    [
      [tk('Linen'), P('#d8ccb0', '#f4ecd8', '#9a8a6a', '#7a4a2a', '#5fcde4')],
      [tk('Wool'), P('#8a6a4a', '#b08a64', '#5a4030', '#d8ccb0', '#d95763')],
      [tk('Silk'), P('#c84a5a', '#f07a8a', '#7a2030', '#e0b040', '#5fcde4')],
      [tk('Velvet'), P('#6a2a8a', '#9a4ac0', '#3a1450', '#e0b040', '#ffcc33')],
      [tk('Spidersilk'), P('#e8e8f0', '#ffffff', '#9a9ab0', '#5a5a6a', '#c050a0')],
      [tk('Duskweave'), P('#3a3a6a', '#5a5a9a', '#1e1e3a', '#d06a9a', '#ff8a5c')],
      [tk('Moonsilk'), P('#a8c8f0', '#e8f4ff', '#5a7aa8', '#f4f4f4', '#5ff0f0')],
      [tk('Dawnsilk'), P('#f0c040', '#fff2a8', '#b07a20', '#c0392b', '#ff6a3a')],
      [tk('Starweave'), P('#2a2a6a', '#5a5ac0', '#14143a', '#fff2a8', '#ffd84a')],
      [tk('Voidweave'), P('#2a1a3a', '#5a3a7a', '#140a1e', '#a050ff', '#ff50ff')],
      [tk('Aetherweave'), P('#5ff0d0', '#d0fff4', '#2a8a7a', '#fff2a8', '#ff8ad0')],
    ],
  ),
  leather: tiers(
    [1, 4, 8, 13, 19, 26, 34, 44, 56, 70, 86, 105],
    [
      [tk('Rawhide'), P('#b08a60', '#d8b488', '#7a5a3a', '#5a3a28', '#8a8a8a')],
      [tk('Tanned'), P('#8a5a34', '#b07a4a', '#5a3a20', '#c0c0c0', '#d95763')],
      [tk('Studded'), P('#7a4a2a', '#a06a40', '#4a2e1c', '#d6e2ea', '#5b6ee1')],
      [tk('Hardened'), P('#6a4a3a', '#8a6a54', '#3a2a20', '#c8a040', '#d95763')],
      [tk('Wolfhide'), P('#8a8a90', '#b8b8c0', '#55555e', '#7a4a2a', '#5fcde4')],
      [tk('Bearhide'), P('#5a3a28', '#7a5438', '#34201a', '#e0b040', '#99e550')],
      [tk('Drakehide'), P('#3a8a5a', '#6ab87a', '#1e5034', '#c8a040', '#ffcc33')],
      [tk('Wyvernhide'), P('#5a6a9a', '#8a9ac8', '#2e3a5e', '#d6e2ea', '#d95763')],
      [tk('Shadowhide'), P('#2e2a3a', '#4e4a5e', '#16141e', '#a050ff', '#ff50ff')],
      [tk('Dragonhide'), P('#a02a2a', '#d05a3a', '#5a1414', '#f2c94c', '#ffcc33')],
      [tk('Titanhide'), P('#a89a7a', '#d8ccaa', '#6a5e48', '#5fcde4', '#ffcc33')],
      [tk('Starhide'), P('#2a2a6a', '#5a5ac0', '#14143a', '#fff2a8', '#ffd84a')],
    ],
  ),
  // orbs are drawn entirely in the gem color, so every arcane tier gets its own saturated gem
  arcane: tiers(
    [1, 3, 7, 12, 18, 25, 33, 42, 53, 66, 80, 98, 120],
    [
      [tk('Copper'), P('#d08a5a', '#f0b888', '#8a5030', '#5a3020', '#5fcde4')],
      [tk('Bronze'), P('#c89a4a', '#ecc47a', '#86602a', '#5a3a20', '#d95763')],
      [tk('Silver'), P('#d6dee8', '#ffffff', '#8a98aa', '#5b6ee1', '#8a9aff')],
      [tk('Gold'), { ...MATERIALS.gold, gem: '#e8508a' }],
      [tk('Jade'), P('#5ab88a', '#9ae8c0', '#2a7a5a', '#e0b040', '#6ad89a')],
      [tk('Moonstone'), P('#c8d4f0', '#f4f8ff', '#8090c0', '#d6e2ea', '#a0c8ff')],
      [tk('Sapphire'), P('#3a5ad0', '#7a9aff', '#1e2a7a', '#e0b040', '#3a6aff')],
      [tk('Ruby'), P('#c82a4a', '#ff6a7a', '#7a1428', '#f2c94c', '#ff3a5a')],
      [tk('Emerald'), P('#2aa85a', '#6ae890', '#145a30', '#f2c94c', '#2ad070')],
      [tk('Diamond'), P('#e8f8ff', '#ffffff', '#9ac0d8', '#d6e2ea', '#5ff0f0')],
      [tk('Starstone'), P('#4a3a9a', '#8a7ae0', '#241a5a', '#fff2a8', '#ffd84a')],
      [tk('Voidglass'), P('#2a1a3a', '#6a3aa0', '#120a1e', '#ff50ff', '#a050ff')],
      [tk('Aetherite'), P('#5ff0d0', '#d0fff4', '#2a8a7a', '#ff8ad0', '#40f0b8')],
    ],
  ),
};

/** Past the end of a table a new tier arrives every EXTRA_STEP item levels, reusing the last EXTRA_NAMES names. */
const EXTRA_STEP = 25;
const EXTRA_NAMES = 3;

/** Highest tier whose minimum item level is reached (unbounded). */
export function tierForIlvl(family: MaterialFamily, ilvl: number): number {
  const table = MATERIAL_TABLES[family] ?? MATERIAL_TABLES.metal;
  const lv = ilvlOf(ilvl);
  const last = table[table.length - 1];
  if (lv >= last.minIlvl) return table.length - 1 + Math.floor((lv - last.minIlvl) / EXTRA_STEP);
  let t = 0;
  while (t + 1 < table.length && table[t + 1].minIlvl <= lv) t++;
  return t;
}

/** Minimum item level at which `tier` starts to drop. */
export function tierMinIlvl(family: MaterialFamily, tier: number): number {
  const table = MATERIAL_TABLES[family] ?? MATERIAL_TABLES.metal;
  const t = posInt(tier, 0);
  if (t < table.length) return table[t].minIlvl;
  return table[table.length - 1].minIlvl + (t - table.length + 1) * EXTRA_STEP;
}

const rotatePalette = (p: MaterialPalette, deg: number): MaterialPalette => ({
  main: hueRotate(p.main, deg),
  light: hueRotate(p.light, deg),
  dark: hueRotate(p.dark, deg),
  trim: hueRotate(p.trim, deg),
  gem: hueRotate(p.gem, deg),
});

const extraCache = new Map<string, MaterialInfo>();

export function materialFor(family: MaterialFamily, tier: number): MaterialInfo {
  const table = MATERIAL_TABLES[family] ?? MATERIAL_TABLES.metal;
  const t = posInt(tier, 0);
  if (t < table.length) return { name: table[t].name, palette: table[t].pal };
  const key = `${family}:${t}`;
  const hit = extraCache.get(key);
  if (hit) return hit;
  const k = t - table.length;
  const src = table[table.length - EXTRA_NAMES + (k % EXTRA_NAMES)];
  const cycle = Math.floor(k / EXTRA_NAMES) + 2;
  // 47 is coprime with 360, so successive cycles land on well-spread hues
  const info = { name: `${src.name} ${numeral(cycle)}`, palette: rotatePalette(src.pal, ((cycle - 1) * 47) % 360) };
  if (extraCache.size > 256) extraCache.clear();
  extraCache.set(key, info);
  return info;
}

export const materialName = (slotOrBase: Slot | BaseId, tier: number): string => materialFor(familyOf(slotOrBase), tier).name;

// starter kits reproduce the class looks from catalog.ts exactly
interface StarterDef {
  slot: Slot;
  base: BaseId;
  tier: number;
  material: string;
  name: string;
}

const STARTER_KITS: Record<ClassId, StarterDef[]> = {
  knight: [
    { slot: 'weapon', base: 'sword', tier: 1, material: tk('Iron'), name: tk('Iron Sword') },
    { slot: 'offhand', base: 'shield', tier: 0, material: tk('Wooden'), name: tk('Wooden Shield') },
  ],
  mage: [
    { slot: 'weapon', base: 'staff', tier: 0, material: tk('Wooden'), name: tk('Wooden Staff') },
    { slot: 'head', base: 'hat', tier: 0, material: tk('Cloth'), name: tk('Cloth Hat') },
  ],
  ranger: [
    { slot: 'weapon', base: 'bow', tier: 0, material: tk('Wooden'), name: tk('Wooden Bow') },
    { slot: 'cape', base: 'cape', tier: 0, material: tk('Cloth'), name: tk('Green Cloth Cape') },
  ],
  rogue: [
    { slot: 'weapon', base: 'dagger', tier: 2, material: tk('Steel'), name: tk('Steel Dagger') },
    { slot: 'head', base: 'hood', tier: 0, material: tk('Cloth'), name: tk('Cloth Hood') },
  ],
  berserker: [{ slot: 'weapon', base: 'axe', tier: 1, material: tk('Iron'), name: tk('Iron Axe') }],
};

const capePalette = (c: string): MaterialPalette => ({ main: c, light: shade(c, 0.3), dark: shade(c, -0.3), trim: '#e0b040', gem: '#5fcde4' });

let starterMats: Partial<Record<BaseId, MaterialInfo>> | undefined;
// built lazily so this module never depends on catalog.ts load order
function starterMaterials(): Partial<Record<BaseId, MaterialInfo>> {
  if (starterMats) return starterMats;
  const out: Partial<Record<BaseId, MaterialInfo>> = {};
  for (const cls of CLASSES) {
    for (const def of STARTER_KITS[cls.id] ?? []) {
      const look = cls.look;
      const pal =
        def.slot === 'weapon' ? look.weapon?.mat
        : def.slot === 'offhand' ? look.offhand?.mat
        : def.slot === 'head' ? look.head?.mat
        : def.slot === 'body' ? look.body?.mat
        : def.slot === 'cape' && look.cape ? capePalette(look.cape)
        : undefined;
      out[def.base] = { name: def.material, palette: pal ?? materialFor(familyOf(def.base), def.tier).palette };
    }
  }
  return (starterMats = out);
}

export function materialOf(item: Pick<Item, 'base' | 'material'> & Partial<Pick<Item, 'source'>>): MaterialInfo {
  if (item.source === 'starter') {
    const s = starterMaterials()[item.base];
    if (s) return s;
  }
  return materialFor(familyOf(item.base), item.material);
}

// ---------------------------------------------------------------- power

export const SLOT_WEIGHT: Record<Slot, number> = { weapon: 1, body: 0.7, head: 0.5, offhand: 0.5, cape: 0.35, trinket: 0.3 };

export function basePower(slot: Slot, ilvl: number, rarity: number, tier: number): number {
  const p = (SLOT_WEIGHT[slot] ?? 0.3) * (6 + ilvlOf(ilvl) * 2.2) * rarityDef(rarity).powerMult * (1 + 0.04 * posInt(tier, 0));
  return Math.min(MAX, Math.round(p));
}

/** Power including blacksmith upgrades. */
export function itemPower(item: Pick<Item, 'power' | 'upgrade'>): number {
  const p = Number.isFinite(item.power) ? Math.max(0, item.power) : 0;
  return Math.min(MAX, Math.round(p * (1 + 0.08 * upgradeOf(item))));
}

// ---------------------------------------------------------------- affixes

export const STAT_IDS: StatId[] = ['xp', 'gold', 'find', 'crit', 'boss', 'luck', 'skill', 'potion'];

const w8 = (xp: number, gold: number, find: number, crit: number, boss: number, luck: number, skill: number, potion: number) =>
  ({ xp, gold, find, crit, boss, luck, skill, potion }) as Record<StatId, number>;

const SLOT_AFFIX_WEIGHTS: Record<Slot, Record<StatId, number>> = {
  //             xp gold find crit boss luck skill potion
  weapon: w8(1, 1, 1, 5, 5, 1, 1, 0.5),
  head: w8(4, 2, 1, 0.5, 0.5, 1, 3, 1),
  body: w8(4, 4, 1, 0.5, 0.5, 1, 1, 2),
  offhand: w8(2, 1, 1, 1, 3, 1, 3, 2),
  cape: w8(2, 2, 3, 1, 1, 3, 1, 1),
  trinket: w8(1, 1, 4, 1, 1, 4, 3, 3),
};

const BASE_AFFIX_BIAS: Partial<Record<BaseId, Partial<Record<StatId, number>>>> = {
  dagger: { crit: 2 },
  hammer: { boss: 2 },
  spear: { boss: 1.5 },
  bow: { find: 2.5, crit: 1.5 },
  staff: { xp: 3, skill: 2 },
  wand: { skill: 3, potion: 2 },
  hat: { xp: 1.5, skill: 1.5 },
  crown: { gold: 2 },
  robe: { xp: 1.5, potion: 1.5 },
  tome: { skill: 2, xp: 1.5 },
  orb: { potion: 2 },
  charm: { luck: 2 },
};

export function affixWeights(slot: Slot, base: BaseId): [StatId, number][] {
  const sw = SLOT_AFFIX_WEIGHTS[slot] ?? SLOT_AFFIX_WEIGHTS.trinket;
  const bias = BASE_AFFIX_BIAS[base] ?? {};
  return STAT_IDS.map((s) => [s, sw[s] * (bias[s] ?? 1)]);
}

/** Affix strength; `roll` in [0, 1) maps onto the 0.7..1.3 spread. */
export function affixValue(ilvl: number, rarity: number, roll: number): number {
  const r = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
  const v = (2 + 3 * Math.log2(1 + ilvlOf(ilvl) / 5)) * (1 + 0.15 * clampRarity(rarity)) * (0.7 + 0.6 * r);
  return Math.max(1, Math.round(v));
}

function rollAffixes(rng: Rng, slot: Slot, base: BaseId, ilvl: number, rarity: Rarity): Affix[] {
  const pool = affixWeights(slot, base);
  const out: Affix[] = [];
  for (let i = 0; i < RARITIES[rarity].affixCount && pool.length; i++) {
    const stat = rng.weighted(pool);
    pool.splice(pool.findIndex(([s]) => s === stat), 1);
    out.push({ stat, value: affixValue(ilvl, rarity, rng.float()) });
  }
  // strongest first: drives naming and UI order
  return out.sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------- names

/** Puts `item` into a name template such as "Wise {item}" (English names are built from the same templates). */
const fillItem = (template: string, item: string) => template.replace('{item}', () => item);

const PREFIX: Record<StatId, string[]> = {
  xp: [tk('Wise {item}'), tk('Learned {item}'), tk('Insightful {item}')],
  gold: [tk('Gilded {item}'), tk('Golden {item}'), tk('Prosperous {item}')],
  find: [tk('Seeking {item}'), tk('Searching {item}'), tk('Questing {item}')],
  crit: [tk('Keen {item}'), tk('Sharp {item}'), tk('Deadly {item}')],
  boss: [tk('Slaying {item}'), tk('Giantbane {item}'), tk('Titanic {item}')],
  luck: [tk('Lucky {item}'), tk('Charmed {item}'), tk('Fortunate {item}')],
  skill: [tk('Studious {item}'), tk('Skilled {item}'), tk('Masterful {item}')],
  potion: [tk('Brewing {item}'), tk('Bubbling {item}'), tk('Distilled {item}')],
};

const SUFFIX: Record<StatId, string[]> = {
  xp: [tk('{item} of Insight'), tk('{item} of Wisdom'), tk('{item} of the Scholar')],
  gold: [tk('{item} of Plenty'), tk('{item} of Riches'), tk('{item} of the Merchant')],
  find: [tk('{item} of Discovery'), tk('{item} of the Seeker'), tk('{item} of Finding')],
  crit: [tk('{item} of Fury'), tk('{item} of Precision'), tk('{item} of the Hawk')],
  boss: [tk('{item} of the Giant'), tk('{item} of Slaying'), tk('{item} of the Titan')],
  luck: [tk('{item} of Fortune'), tk('{item} of the Clover'), tk('{item} of Chance')],
  skill: [tk('{item} of Mastery'), tk('{item} of Practice'), tk('{item} of the Artisan')],
  potion: [tk('{item} of Alchemy'), tk('{item} of the Brewer'), tk('{item} of Elixirs')],
};

const OWNER_A = ['Grim', 'Thal', 'Mal', 'Vex', 'Kal', 'Bel', 'Os', 'Ruk', 'Zan', 'Ael', 'Dro', 'Fen', 'Ith', 'Sor', 'Ul', 'Var', 'Yr', 'Cor', 'Hal', 'Nim', 'Bram', 'Tov'];
const OWNER_B = ['jaw', 'mir', 'wyn', 'rok', 'iel', 'eth', 'ra', 'vane', 'mund', 'os', 'ith', 'ash', 'ren', 'bek', 'tor', 'nar'];
// "{owner}'s Lament": owners (made-up names) and compounds ("Starfall") are proper names and stay as they are
const OWNER_NOUN = [
  tk("{owner}'s Lament"), tk("{owner}'s Promise"), tk("{owner}'s Wrath"), tk("{owner}'s Embrace"), tk("{owner}'s Vigil"), tk("{owner}'s Folly"),
  tk("{owner}'s Requiem"), tk("{owner}'s Oath"), tk("{owner}'s Bane"), tk("{owner}'s Whisper"), tk("{owner}'s Reckoning"), tk("{owner}'s Hymn"),
  tk("{owner}'s Grudge"), tk("{owner}'s Mercy"), tk("{owner}'s Legacy"), tk("{owner}'s Gambit"),
];
const COMPOUND_A = ['Star', 'Dawn', 'Storm', 'Night', 'Frost', 'Ember', 'Moon', 'Doom', 'Soul', 'Dusk', 'Thunder', 'Gloom', 'Wild', 'Grave', 'Rune', 'Sky', 'Bright', 'Thorn'];
const COMPOUND_B = ['fall', 'song', 'shard', 'fang', 'whisper', 'brand', 'heart', 'wake', 'call', 'spire', 'veil', 'crest', 'gleam', 'warden', 'bloom', 'reach', 'mark'];
const EPITHET: Record<Slot, string[]> = {
  weapon: [tk('Edge of {thing}'), tk('Fang of {thing}'), tk('Herald of {thing}'), tk('Wrath of {thing}'), tk('Bane of {thing}'), tk('Talon of {thing}')],
  head: [tk('Crown of {thing}'), tk('Ward of {thing}'), tk('Gaze of {thing}'), tk('Mind of {thing}'), tk('Halo of {thing}')],
  body: [tk('Ward of {thing}'), tk('Bulwark of {thing}'), tk('Mantle of {thing}'), tk('Shroud of {thing}'), tk('Guardian of {thing}')],
  offhand: [tk('Ward of {thing}'), tk('Codex of {thing}'), tk('Eye of {thing}'), tk('Bastion of {thing}'), tk('Lantern of {thing}')],
  cape: [tk('Mantle of {thing}'), tk('Shroud of {thing}'), tk('Veil of {thing}'), tk('Wings of {thing}'), tk('Banner of {thing}')],
  trinket: [tk('Eye of {thing}'), tk('Heart of {thing}'), tk('Seal of {thing}'), tk('Token of {thing}'), tk('Sigil of {thing}'), tk('Promise of {thing}')],
};
const OF_THING = [
  tk('Dawn'), tk('the Void'), tk('Ages'), tk('Embers'), tk('the Deep'), tk('Kings'), tk('the Lost'), tk('Twilight'),
  tk('the Tides'), tk('Storms'), tk('the North'), tk('Echoes'), tk('Ash'), tk('the First Light'), tk('Ruin'), tk('Stars'),
];
const ADJ = [
  tk('Weeping'), tk('Silent'), tk('Hollow'), tk('Burning'), tk('Frozen'), tk('Shattered'),
  tk('Eternal'), tk('Forgotten'), tk('Gilded'), tk('Restless'), tk('Howling'), tk('Radiant'),
];
const THE_ADJ_BASE = tk('The {adj} {base}');
const COMPOUND_NAME = tk('{compound}, {name}');

const fillOwner = (template: string, owner: string) => template.replace('{owner}', () => owner);
const fillThing = (template: string, thing: string) => template.replace('{thing}', () => thing);

/** Legendary and better: a one-of-a-kind name. */
function uniqueName(rng: Rng, slot: Slot, base: BaseId): string {
  const owner = () => rng.pick(OWNER_A) + rng.pick(OWNER_B);
  const compound = () => rng.pick(COMPOUND_A) + rng.pick(COMPOUND_B);
  switch (rng.int(0, 3)) {
    case 0: {
      const o = owner();
      return fillOwner(rng.pick(OWNER_NOUN), o);
    }
    case 1: {
      const c = compound();
      return `${c}, ${fillThing(rng.pick(EPITHET[slot]), rng.pick(OF_THING))}`;
    }
    case 2:
      return `The ${rng.pick(ADJ)} ${baseName(base)}`;
    default: {
      const c = compound();
      const o = owner();
      return `${c}, ${fillOwner(rng.pick(OWNER_NOUN), o)}`;
    }
  }
}

function affixName(rng: Rng, material: string, base: BaseId, affixes: Affix[]): string {
  const core = `${material} ${baseName(base)}`;
  if (!affixes.length) return core;
  if (affixes.length === 1) {
    const s = affixes[0].stat;
    return rng.chance(0.5) ? fillItem(rng.pick(PREFIX[s]), core) : fillItem(rng.pick(SUFFIX[s]), core);
  }
  const prefixed = fillItem(rng.pick(PREFIX[affixes[0].stat]), core);
  return fillItem(rng.pick(SUFFIX[affixes[1].stat]), prefixed);
}

// ----- names in the player's language: stored names are English, so they are taken apart and rebuilt

const ROMAN_OR_NUMBER = /^(.+) ([IVXLCDM]+|\d+)$/;
const ALL_PREFIXES = Object.values(PREFIX).flat();
const ALL_SUFFIXES = Object.values(SUFFIX).flat();
const ALL_EPITHETS = [...new Set(Object.values(EPITHET).flat())];

/** A material name ("Iron", "Voidsteel II") in the player's language. */
export function materialLabel(name: string): string {
  const m = ROMAN_OR_NUMBER.exec(name);
  return m ? t('{material} {numeral}', { material: t(m[1]), numeral: m[2] }) : t(name);
}

/** "{material} {base}" in the player's language. */
const coreLabel = (material: string, base: BaseId) => t('{material} {base}', { material: materialLabel(material), base: t(baseName(base)) });

/** English template filled with `value`, or null when `name` is not built from it. */
function unfill(template: string, slot: string, name: string): string | null {
  const [before, after] = template.split(`{${slot}}`);
  return name.length > before.length + after.length && name.startsWith(before) && name.endsWith(after) ? name.slice(before.length, name.length - after.length) : null;
}

function translateOwnerName(name: string): string | null {
  for (const tpl of OWNER_NOUN) {
    const owner = unfill(tpl, 'owner', name);
    if (owner !== null && !owner.includes(' ')) return t(tpl, { owner });
  }
  return null;
}

function translateAffixName(name: string, material: string, base: BaseId): string | null {
  const core = `${material} ${baseName(base)}`;
  const coreTr = coreLabel(material, base);
  if (name === core) return coreTr;
  const prefixed = (s: string): string | null => {
    if (s === core) return coreTr;
    for (const p of ALL_PREFIXES) if (fillItem(p, core) === s) return t(p, { item: coreTr });
    return null;
  };
  const direct = prefixed(name);
  if (direct !== null) return direct;
  for (const suf of ALL_SUFFIXES) {
    const inner = unfill(suf, 'item', name);
    const innerTr = inner === null ? null : prefixed(inner);
    if (innerTr !== null) return t(suf, { item: innerTr });
  }
  return null;
}

function translateUniqueName(name: string, base: BaseId): string | null {
  const adj = ADJ.find((a) => name === `The ${a} ${baseName(base)}`);
  if (adj) return t(THE_ADJ_BASE, { adj: t(adj), base: t(baseName(base)) });
  const owned = translateOwnerName(name);
  if (owned !== null) return owned;
  const comma = name.indexOf(', ');
  if (comma <= 0) return null;
  const compound = name.slice(0, comma);
  const rest = name.slice(comma + 2);
  let restTr = translateOwnerName(rest);
  if (restTr === null) {
    for (const ep of ALL_EPITHETS) {
      const thing = unfill(ep, 'thing', rest);
      if (thing !== null && OF_THING.includes(thing)) {
        restTr = t(ep, { thing: t(thing) });
        break;
      }
    }
  }
  return restTr === null ? null : t(COMPOUND_NAME, { compound, name: restTr });
}

const nameCache = new Map<string, string>();

/** A stored (English) item name in the player's language; names it can't take apart are shown as they are. */
function translatedName(item: Pick<Item, 'name' | 'base' | 'material'> & Partial<Pick<Item, 'source'>>, name: string): string {
  if (getLang() === 'en') return name;
  if (t(name) !== name) return t(name); // starter kit names
  const material = materialOf(item).name;
  const key = `${getLang()}|${item.base}|${material}|${name}`;
  const hit = nameCache.get(key);
  if (hit !== undefined) return hit;
  const out = translateAffixName(name, material, item.base) ?? translateUniqueName(name, item.base) ?? name;
  if (nameCache.size > 512) nameCache.clear();
  nameCache.set(key, out);
  return out;
}

/** The item's name in the player's language, with its upgrade ("Iron Sword +2"). */
export function itemDisplayName(item: Pick<Item, 'name' | 'base' | 'material' | 'upgrade'> & Partial<Pick<Item, 'source'>>): string {
  const stored = item.name?.trim();
  const name = stored ? translatedName(item, stored) : coreLabel(materialOf(item).name, item.base);
  const u = upgradeOf(item);
  return u > 0 ? `${name} +${u}` : name;
}

// ---------------------------------------------------------------- rolling

export interface RollItemOpts {
  seed: number;
  ilvl: number;
  slot?: Slot;
  base?: BaseId;
  minRarity?: Rarity;
  luck?: number;
  source?: Item['source'];
  now: number;
  id?: string;
}

const SLOT_DROP_WEIGHTS: [Slot, number][] = [['weapon', 3], ['head', 2], ['body', 2], ['offhand', 2], ['cape', 1], ['trinket', 2]];
const TIER_JITTER: [number, number][] = [[-1, 1], [0, 2], [1, 1]];

export function rollItem(opts: RollItemOpts): Item {
  const ilvl = ilvlOf(opts.ilvl);
  const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
  const rng = new Rng(hashStr(`item|${seed}|${ilvl}`));
  let base = opts.base && slotOfBase(opts.base) ? opts.base : undefined;
  if (base && opts.slot && slotOfBase(base) !== opts.slot) base = undefined;
  const slot: Slot = base ? slotOfBase(base)! : opts.slot && BASES[opts.slot] ? opts.slot : rng.weighted(SLOT_DROP_WEIGHTS);
  const b: BaseId = base ?? rng.pick(BASES[slot]);
  const rarity = rollRarity(rng, opts.luck ?? 0, opts.minRarity ?? 0, ilvl);
  const family = familyOf(b);
  const tier = Math.max(0, tierForIlvl(family, ilvl) + rng.weighted(TIER_JITTER));
  const affixes = rollAffixes(rng, slot, b, ilvl, rarity);
  const name = rarity >= 4 ? uniqueName(rng, slot, b) : affixName(rng, materialFor(family, tier).name, b, affixes);
  return {
    id: opts.id ?? `i${seed.toString(36)}-${ilvl.toString(36)}`,
    updatedAt: opts.now,
    slot,
    base: b,
    material: tier,
    rarity,
    ilvl,
    power: basePower(slot, ilvl, rarity, tier),
    upgrade: 0,
    affixes,
    name,
    seed,
    source: opts.source ?? 'drop',
    createdAt: opts.now,
  };
}

export function starterItems(classId: ClassId, now: number): Item[] {
  return (STARTER_KITS[classId] ?? STARTER_KITS.knight).map((d) => {
    const id = `starter-${classId}-${d.slot}`;
    return {
      id,
      updatedAt: now,
      slot: d.slot,
      base: d.base,
      material: d.tier,
      rarity: 0,
      ilvl: 1,
      power: basePower(d.slot, 1, 0, d.tier),
      upgrade: 0,
      affixes: [],
      name: d.name,
      seed: hashStr(id),
      source: 'starter',
      createdAt: now,
    };
  });
}

// ---------------------------------------------------------------- economy

const RARITY_PRICE = [1, 1.6, 2.6, 4.2, 7, 12, 20];

export function sellPrice(item: Pick<Item, 'ilvl' | 'rarity' | 'upgrade'>): number {
  const p = (4 + ilvlOf(item.ilvl) * 1.2) * RARITY_PRICE[clampRarity(item.rarity)] * (1 + 0.15 * upgradeOf(item));
  return Math.min(MAX, Math.max(1, Math.round(p)));
}

/** Geometric (x1.17 per +1) up to this upgrade, then linear with the same slope so costs stay finite forever. */
const UPGRADE_GEOMETRIC = 60;

export function upgradeCost(item: Pick<Item, 'ilvl' | 'rarity' | 'upgrade'>): number {
  const u = upgradeOf(item);
  const growth = u <= UPGRADE_GEOMETRIC ? 1.17 ** u : 1.17 ** UPGRADE_GEOMETRIC * (1 + 0.17 * (u - UPGRADE_GEOMETRIC));
  const cost = 25 * growth * (1 + ilvlOf(item.ilvl) / 8) * (1 + 0.3 * clampRarity(item.rarity));
  return Math.min(MAX, Math.round(cost));
}

// ---------------------------------------------------------------- equipment

/** Resolve equipped ids to live items (missing, deleted or mis-slotted items are skipped). */
export function resolveEquipped(equipped: Partial<Record<Slot, string>> | undefined, items: Record<string, Item>): Partial<Record<Slot, Item>> {
  const out: Partial<Record<Slot, Item>> = {};
  for (const slot of SLOTS) {
    const id = equipped?.[slot];
    const item = id ? items[id] : undefined;
    if (item && !item.deleted && item.slot === slot) out[slot] = item;
  }
  return out;
}

const fits = (slot: Slot, item: Item | undefined): item is Item =>
  !!item && !item.deleted && item.slot === slot && (BASES[slot] as readonly string[]).includes(item.base);

export function gearLook(equipped: Partial<Record<Slot, Item | undefined>>): GearLook {
  const look: GearLook = {};
  const w = equipped.weapon;
  if (fits('weapon', w)) look.weapon = { kind: w.base, mat: materialOf(w).palette };
  const h = equipped.head;
  if (fits('head', h)) look.head = { kind: h.base as HeadKind, mat: materialOf(h).palette };
  const b = equipped.body;
  if (fits('body', b)) look.body = { kind: b.base as BodyKind, mat: materialOf(b).palette };
  const o = equipped.offhand;
  if (fits('offhand', o)) look.offhand = { kind: o.base, mat: materialOf(o).palette };
  const c = equipped.cape;
  if (fits('cape', c)) look.cape = materialOf(c).palette.main;
  return look;
}

// ---------------------------------------------------------------- drops + chests

export const POTION_DROP_CHANCE = 0.08;
const POTION_DROP_WEIGHTS: [PotionId, number][] = [['insight', 3], ['fortune', 3], ['luck', 2], ['fury', 2], ['giant', 2], ['phoenix', 0.6]];

export function gearDropChance(find: number, elite: boolean): number {
  const f = Number.isFinite(find) ? Math.max(0, find) : 0;
  return Math.min(0.9, 0.1 * (1 + f / 100) * (elite ? 3 : 1));
}

export interface DropResult {
  item?: Item;
  potion?: { potion: PotionId; tier: number };
}

export function rollDrop(opts: { seed: number; level: number; stats: HeroStats; elite: boolean; now: number }): DropResult {
  const rng = new Rng(hashStr(`drop|${opts.seed}`));
  const level = ilvlOf(opts.level);
  const out: DropResult = {};
  if (rng.chance(gearDropChance(opts.stats.find, opts.elite)))
    out.item = rollItem({ seed: opts.seed, ilvl: level, luck: opts.stats.luck, source: 'drop', now: opts.now });
  if (rng.chance(POTION_DROP_CHANCE)) {
    const potion = rng.weighted(POTION_DROP_WEIGHTS);
    out.potion = { potion, tier: potionTierFor(potion, level) };
  }
  return out;
}

/** Epic; Legendary every 5th boss, Mythic every 25th, Divine every 100th. */
export function bossChestRarity(bossIndex: number): Rarity {
  const b = posInt(bossIndex, 1);
  if (b % 100 === 0) return 6;
  if (b % 25 === 0) return 5;
  if (b % 5 === 0) return 4;
  return 3;
}

export function chestLoot(opts: { seed: number; level: number; stats: HeroStats; kind: 'quest' | 'boss'; bossIndex?: number; now: number }): Item {
  const boss = opts.kind === 'boss';
  const level = ilvlOf(opts.level);
  const seed = hashStr(`chest|${opts.kind}|${opts.bossIndex ?? 0}|${opts.seed}`);
  return rollItem({
    seed,
    ilvl: level,
    luck: opts.stats.luck,
    minRarity: boss ? bossChestRarity(opts.bossIndex ?? 1) : 1,
    source: boss ? 'boss' : 'chest',
    now: opts.now,
    id: `${boss ? 'b' : 'q'}${seed.toString(36)}-${level.toString(36)}`,
  });
}
