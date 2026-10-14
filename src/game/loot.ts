// Procedural, infinite loot: rarities, material tiers, affixes, names, prices, drops and chests.
// Everything is a pure function of its inputs (seeded Rng, time passed in) so items reproduce exactly.
import { Rng, hashStr } from '../core/rng';
import { BASES, SLOTS } from '../core/types';
import type { Affix, BaseId, ClassId, HeroStats, Item, PotionId, Rarity, Slot, StatId } from '../core/types';
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
  { name: 'Common', color: '#f4f4f4', affixCount: 0, powerMult: 1, weight: 55 },
  { name: 'Uncommon', color: '#5ee06a', affixCount: 1, powerMult: 1.15, weight: 28 },
  { name: 'Rare', color: '#5aa8ff', affixCount: 2, powerMult: 1.35, weight: 12 },
  { name: 'Epic', color: '#c77dff', affixCount: 3, powerMult: 1.6, weight: 4 },
  { name: 'Legendary', color: '#ff9f2e', affixCount: 4, powerMult: 2, weight: 0.9 },
  { name: 'Mythic', color: '#ff5050', affixCount: 5, powerMult: 2.5, weight: 0.1 },
  { name: 'Divine', color: '#5ff0f0', affixCount: 6, powerMult: 3.2, weight: 0 },
];

/** Divine only drops naturally from item level 100 on, and only rarely. */
export const DIVINE_WEIGHT = 0.01;
export const DIVINE_MIN_ILVL = 100;

export function clampRarity(r: number): Rarity {
  return (Number.isFinite(r) ? Math.max(0, Math.min(6, Math.floor(r))) : 0) as Rarity;
}

export const rarityDef = (r: number): RarityDef => RARITIES[clampRarity(r)];
export const rarityOf = (item: Pick<Item, 'rarity'>): RarityDef => rarityDef(item.rarity);
export const rarityName = (r: number): string => rarityDef(r).name;
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
  sword: 'Sword',
  axe: 'Axe',
  dagger: 'Dagger',
  staff: 'Staff',
  bow: 'Bow',
  mace: 'Mace',
  spear: 'Spear',
  hammer: 'Warhammer',
  wand: 'Wand',
  helm: 'Helm',
  hood: 'Hood',
  hat: 'Hat',
  crown: 'Crown',
  circlet: 'Circlet',
  horned: 'Horned Helm',
  leather: 'Leather Armor',
  chain: 'Chainmail',
  plate: 'Plate Armor',
  robe: 'Robe',
  shield: 'Shield',
  buckler: 'Buckler',
  tome: 'Tome',
  orb: 'Orb',
  cape: 'Cape',
  ring: 'Ring',
  amulet: 'Amulet',
  charm: 'Charm',
};

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Weapon',
  head: 'Head',
  body: 'Body',
  offhand: 'Off-hand',
  cape: 'Cape',
  trinket: 'Trinket',
};

export const baseName = (base: BaseId): string => BASE_NAMES[base] ?? 'Relic';

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
      ['Rusty', P('#a0745a', '#c89878', '#6a4636', '#5a4030', '#8a8a8a')],
      ['Iron', MATERIALS.iron],
      ['Steel', MATERIALS.steel],
      ['Silver', P('#dfe6f0', '#ffffff', '#8e9bb0', '#5b6ee1', '#99e5ff')],
      ['Elven', MATERIALS.elven],
      ['Dwarven', P('#d9a066', '#f6d29a', '#8a5a2a', '#5a3a28', '#d95763')],
      ['Orcish', P('#7a8a5a', '#a8b884', '#4a5636', '#5a3a28', '#d95763')],
      ['Glass', MATERIALS.glass],
      ['Ebony', MATERIALS.ebony],
      ['Infernal', MATERIALS.infernal],
      ['Dragonbone', P('#e8dcc0', '#fffaf0', '#a89a78', '#8a3a2a', '#ff6a3a')],
      ['Stormsilver', P('#c8e8ff', '#ffffff', '#7aa0c8', '#e8e8f8', '#5fcde4')],
      ['Adamant', P('#4a9a8a', '#7ad0b8', '#2a5a5a', '#c8a040', '#d95763')],
      ['Celestial', P('#fff2a8', '#ffffff', '#d0a040', '#5fcde4', '#ffffff')],
      // the last three names repeat forever with rotated hues, so their colors (gems too) must be saturated
      ['Voidsteel', P('#3a2a5a', '#6a4aa0', '#1a1030', '#a050ff', '#ff50ff')],
      ['Astral', P('#5a6ae0', '#a0b0ff', '#2a2a8a', '#fff2a8', '#ff6ad8')],
      ['Primordial', P('#40d0b0', '#b0fff0', '#1a6a6a', '#ff5a8a', '#ffe040')],
    ],
  ),
  wood: tiers(
    [1, 4, 9, 15, 22, 30, 40, 52, 66, 82, 100],
    [
      ['Wooden', MATERIALS.wood],
      ['Oak', P('#9a6a3a', '#c08a50', '#5a3a1e', '#b8c0c8', '#99e550')],
      ['Yew', P('#c08a5a', '#e0b080', '#7a5030', '#c8a040', '#d95763')],
      ['Ironwood', P('#6a5a4a', '#8a7a6a', '#3a2e26', '#b8c0c8', '#5fcde4')],
      ['Elderwood', P('#7a8a4a', '#a8b870', '#4a5228', '#e0b040', '#99e550')],
      ['Moonwood', P('#b0b8d8', '#e8ecff', '#6a7098', '#d6e2ea', '#5fcde4')],
      ['Ghostwood', P('#d8e0d8', '#ffffff', '#8a9a90', '#5ff0f0', '#5ff0f0')],
      ['Bloodwood', P('#8a2a2a', '#c04a3a', '#4a1218', '#e0b040', '#ff6a3a')],
      ['Wyrmwood', P('#3a7a5a', '#5aa87a', '#1e4a34', '#e0b040', '#ffcc33')],
      ['Starwood', P('#3a3a8a', '#6a6ad0', '#1e1e4a', '#fff2a8', '#ffd84a')],
      ['Worldroot', P('#c8a060', '#fff0b0', '#7a5a2a', '#5fcde4', '#99e550')],
    ],
  ),
  cloth: tiers(
    [1, 4, 9, 15, 22, 30, 40, 52, 66, 82, 100],
    [
      ['Linen', P('#d8ccb0', '#f4ecd8', '#9a8a6a', '#7a4a2a', '#5fcde4')],
      ['Wool', P('#8a6a4a', '#b08a64', '#5a4030', '#d8ccb0', '#d95763')],
      ['Silk', P('#c84a5a', '#f07a8a', '#7a2030', '#e0b040', '#5fcde4')],
      ['Velvet', P('#6a2a8a', '#9a4ac0', '#3a1450', '#e0b040', '#ffcc33')],
      ['Spidersilk', P('#e8e8f0', '#ffffff', '#9a9ab0', '#5a5a6a', '#c050a0')],
      ['Duskweave', P('#3a3a6a', '#5a5a9a', '#1e1e3a', '#d06a9a', '#ff8a5c')],
      ['Moonsilk', P('#a8c8f0', '#e8f4ff', '#5a7aa8', '#f4f4f4', '#5ff0f0')],
      ['Dawnsilk', P('#f0c040', '#fff2a8', '#b07a20', '#c0392b', '#ff6a3a')],
      ['Starweave', P('#2a2a6a', '#5a5ac0', '#14143a', '#fff2a8', '#ffd84a')],
      ['Voidweave', P('#2a1a3a', '#5a3a7a', '#140a1e', '#a050ff', '#ff50ff')],
      ['Aetherweave', P('#5ff0d0', '#d0fff4', '#2a8a7a', '#fff2a8', '#ff8ad0')],
    ],
  ),
  leather: tiers(
    [1, 4, 8, 13, 19, 26, 34, 44, 56, 70, 86, 105],
    [
      ['Rawhide', P('#b08a60', '#d8b488', '#7a5a3a', '#5a3a28', '#8a8a8a')],
      ['Tanned', P('#8a5a34', '#b07a4a', '#5a3a20', '#c0c0c0', '#d95763')],
      ['Studded', P('#7a4a2a', '#a06a40', '#4a2e1c', '#d6e2ea', '#5b6ee1')],
      ['Hardened', P('#6a4a3a', '#8a6a54', '#3a2a20', '#c8a040', '#d95763')],
      ['Wolfhide', P('#8a8a90', '#b8b8c0', '#55555e', '#7a4a2a', '#5fcde4')],
      ['Bearhide', P('#5a3a28', '#7a5438', '#34201a', '#e0b040', '#99e550')],
      ['Drakehide', P('#3a8a5a', '#6ab87a', '#1e5034', '#c8a040', '#ffcc33')],
      ['Wyvernhide', P('#5a6a9a', '#8a9ac8', '#2e3a5e', '#d6e2ea', '#d95763')],
      ['Shadowhide', P('#2e2a3a', '#4e4a5e', '#16141e', '#a050ff', '#ff50ff')],
      ['Dragonhide', P('#a02a2a', '#d05a3a', '#5a1414', '#f2c94c', '#ffcc33')],
      ['Titanhide', P('#a89a7a', '#d8ccaa', '#6a5e48', '#5fcde4', '#ffcc33')],
      ['Starhide', P('#2a2a6a', '#5a5ac0', '#14143a', '#fff2a8', '#ffd84a')],
    ],
  ),
  // orbs are drawn entirely in the gem color, so every arcane tier gets its own saturated gem
  arcane: tiers(
    [1, 3, 7, 12, 18, 25, 33, 42, 53, 66, 80, 98, 120],
    [
      ['Copper', P('#d08a5a', '#f0b888', '#8a5030', '#5a3020', '#5fcde4')],
      ['Bronze', P('#c89a4a', '#ecc47a', '#86602a', '#5a3a20', '#d95763')],
      ['Silver', P('#d6dee8', '#ffffff', '#8a98aa', '#5b6ee1', '#8a9aff')],
      ['Gold', { ...MATERIALS.gold, gem: '#e8508a' }],
      ['Jade', P('#5ab88a', '#9ae8c0', '#2a7a5a', '#e0b040', '#6ad89a')],
      ['Moonstone', P('#c8d4f0', '#f4f8ff', '#8090c0', '#d6e2ea', '#a0c8ff')],
      ['Sapphire', P('#3a5ad0', '#7a9aff', '#1e2a7a', '#e0b040', '#3a6aff')],
      ['Ruby', P('#c82a4a', '#ff6a7a', '#7a1428', '#f2c94c', '#ff3a5a')],
      ['Emerald', P('#2aa85a', '#6ae890', '#145a30', '#f2c94c', '#2ad070')],
      ['Diamond', P('#e8f8ff', '#ffffff', '#9ac0d8', '#d6e2ea', '#5ff0f0')],
      ['Starstone', P('#4a3a9a', '#8a7ae0', '#241a5a', '#fff2a8', '#ffd84a')],
      ['Voidglass', P('#2a1a3a', '#6a3aa0', '#120a1e', '#ff50ff', '#a050ff')],
      ['Aetherite', P('#5ff0d0', '#d0fff4', '#2a8a7a', '#ff8ad0', '#40f0b8')],
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
    { slot: 'weapon', base: 'sword', tier: 1, material: 'Iron', name: 'Iron Sword' },
    { slot: 'offhand', base: 'shield', tier: 0, material: 'Wooden', name: 'Wooden Shield' },
  ],
  mage: [
    { slot: 'weapon', base: 'staff', tier: 0, material: 'Wooden', name: 'Wooden Staff' },
    { slot: 'head', base: 'hat', tier: 0, material: 'Cloth', name: 'Cloth Hat' },
  ],
  ranger: [
    { slot: 'weapon', base: 'bow', tier: 0, material: 'Wooden', name: 'Wooden Bow' },
    { slot: 'cape', base: 'cape', tier: 0, material: 'Cloth', name: 'Green Cloth Cape' },
  ],
  rogue: [
    { slot: 'weapon', base: 'dagger', tier: 2, material: 'Steel', name: 'Steel Dagger' },
    { slot: 'head', base: 'hood', tier: 0, material: 'Cloth', name: 'Cloth Hood' },
  ],
  berserker: [{ slot: 'weapon', base: 'axe', tier: 1, material: 'Iron', name: 'Iron Axe' }],
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

const PREFIX: Record<StatId, string[]> = {
  xp: ['Wise', 'Learned', 'Insightful'],
  gold: ['Gilded', 'Golden', 'Prosperous'],
  find: ['Seeking', 'Searching', 'Questing'],
  crit: ['Keen', 'Sharp', 'Deadly'],
  boss: ['Slaying', 'Giantbane', 'Titanic'],
  luck: ['Lucky', 'Charmed', 'Fortunate'],
  skill: ['Studious', 'Skilled', 'Masterful'],
  potion: ['Brewing', 'Bubbling', 'Distilled'],
};

const SUFFIX: Record<StatId, string[]> = {
  xp: ['Insight', 'Wisdom', 'the Scholar'],
  gold: ['Plenty', 'Riches', 'the Merchant'],
  find: ['Discovery', 'the Seeker', 'Finding'],
  crit: ['Fury', 'Precision', 'the Hawk'],
  boss: ['the Giant', 'Slaying', 'the Titan'],
  luck: ['Fortune', 'the Clover', 'Chance'],
  skill: ['Mastery', 'Practice', 'the Artisan'],
  potion: ['Alchemy', 'the Brewer', 'Elixirs'],
};

const OWNER_A = ['Grim', 'Thal', 'Mal', 'Vex', 'Kal', 'Bel', 'Os', 'Ruk', 'Zan', 'Ael', 'Dro', 'Fen', 'Ith', 'Sor', 'Ul', 'Var', 'Yr', 'Cor', 'Hal', 'Nim', 'Bram', 'Tov'];
const OWNER_B = ['jaw', 'mir', 'wyn', 'rok', 'iel', 'eth', 'ra', 'vane', 'mund', 'os', 'ith', 'ash', 'ren', 'bek', 'tor', 'nar'];
const OWNER_NOUN = ['Lament', 'Promise', 'Wrath', 'Embrace', 'Vigil', 'Folly', 'Requiem', 'Oath', 'Bane', 'Whisper', 'Reckoning', 'Hymn', 'Grudge', 'Mercy', 'Legacy', 'Gambit'];
const COMPOUND_A = ['Star', 'Dawn', 'Storm', 'Night', 'Frost', 'Ember', 'Moon', 'Doom', 'Soul', 'Dusk', 'Thunder', 'Gloom', 'Wild', 'Grave', 'Rune', 'Sky', 'Bright', 'Thorn'];
const COMPOUND_B = ['fall', 'song', 'shard', 'fang', 'whisper', 'brand', 'heart', 'wake', 'call', 'spire', 'veil', 'crest', 'gleam', 'warden', 'bloom', 'reach', 'mark'];
const EPITHET: Record<Slot, string[]> = {
  weapon: ['Edge', 'Fang', 'Herald', 'Wrath', 'Bane', 'Talon'],
  head: ['Crown', 'Ward', 'Gaze', 'Mind', 'Halo'],
  body: ['Ward', 'Bulwark', 'Mantle', 'Shroud', 'Guardian'],
  offhand: ['Ward', 'Codex', 'Eye', 'Bastion', 'Lantern'],
  cape: ['Mantle', 'Shroud', 'Veil', 'Wings', 'Banner'],
  trinket: ['Eye', 'Heart', 'Seal', 'Token', 'Sigil', 'Promise'],
};
const OF_THING = ['Dawn', 'the Void', 'Ages', 'Embers', 'the Deep', 'Kings', 'the Lost', 'Twilight', 'the Tides', 'Storms', 'the North', 'Echoes', 'Ash', 'the First Light', 'Ruin', 'Stars'];
const ADJ = ['Weeping', 'Silent', 'Hollow', 'Burning', 'Frozen', 'Shattered', 'Eternal', 'Forgotten', 'Gilded', 'Restless', 'Howling', 'Radiant'];

/** Legendary and better: a one-of-a-kind name. */
function uniqueName(rng: Rng, slot: Slot, base: BaseId): string {
  const owner = () => rng.pick(OWNER_A) + rng.pick(OWNER_B);
  const compound = () => rng.pick(COMPOUND_A) + rng.pick(COMPOUND_B);
  switch (rng.int(0, 3)) {
    case 0:
      return `${owner()}'s ${rng.pick(OWNER_NOUN)}`;
    case 1:
      return `${compound()}, ${rng.pick(EPITHET[slot])} of ${rng.pick(OF_THING)}`;
    case 2:
      return `The ${rng.pick(ADJ)} ${baseName(base)}`;
    default:
      return `${compound()}, ${owner()}'s ${rng.pick(OWNER_NOUN)}`;
  }
}

function affixName(rng: Rng, material: string, base: BaseId, affixes: Affix[]): string {
  const core = `${material} ${baseName(base)}`;
  if (!affixes.length) return core;
  if (affixes.length === 1) {
    const s = affixes[0].stat;
    return rng.chance(0.5) ? `${rng.pick(PREFIX[s])} ${core}` : `${core} of ${rng.pick(SUFFIX[s])}`;
  }
  return `${rng.pick(PREFIX[affixes[0].stat])} ${core} of ${rng.pick(SUFFIX[affixes[1].stat])}`;
}

export function itemDisplayName(item: Pick<Item, 'name' | 'base' | 'material' | 'upgrade'> & Partial<Pick<Item, 'source'>>): string {
  const name = item.name?.trim() || `${materialOf(item).name} ${baseName(item.base)}`;
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
