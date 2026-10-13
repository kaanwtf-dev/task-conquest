// Merchant: a daily rotating stock (deterministic per day + level bracket) plus permanent unlocks.
import { Rng, hashStr } from '../core/rng';
import { SLOTS } from '../core/types';
import type { Hero, Item, PotionId } from '../core/types';
import { THEMES, THEME_BY_ID, type ThemeDef, type ThemeId } from '../pixel/themes';
import { itemDisplayName, rollItem, sellPrice } from './loot';
import { POTION_IDS, potionName, potionPrice, potionTier, potionTierFor } from './potions';
import { levelFromXp, sum } from './progression';

export type DyeTarget = 'outfit' | 'hair' | 'pants' | 'cape';

export interface ShopOffer {
  id: string;
  kind: 'item' | 'potion' | 'bag' | 'theme' | 'dye';
  label: string;
  price: number;
  item?: Item;
  potion?: { potion: PotionId; tier: number };
  theme?: ThemeId;
  dye?: { target: DyeTarget; color: string };
}

const MAX = Number.MAX_SAFE_INTEGER;
const posInt = (n: number, min: number) => (Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min);

// ---------------------------------------------------------------- daily stock

export const SHOP_GEAR_OFFERS = 4;
export const SHOP_GEAR_MARKUP = 4;
/** Stock is rerolled per day and per bracket of this many levels. */
export const SHOP_LEVEL_BUCKET = 5;
const LUCK_BUCKET = 25;

export const shopBucket = (level: number) => Math.floor((posInt(level, 1) - 1) / SHOP_LEVEL_BUCKET);

/**
 * Gear is rolled at the first level of the hero's bracket so the stock does not shift within it;
 * luck is bucketed for the same reason. Offer ids are stable for the whole day.
 */
export function dailyStock(dateKey: string, level: number, luck: number, now: number): ShopOffer[] {
  const lv = posInt(level, 1);
  const bucket = shopBucket(lv);
  const ilvl = bucket * SHOP_LEVEL_BUCKET + 1;
  const l = Number.isFinite(luck) ? Math.max(0, Math.floor(luck / LUCK_BUCKET) * LUCK_BUCKET) : 0;
  const rng = new Rng(hashStr(`shop|${dateKey}|${bucket}`));
  const slots = [...SLOTS];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const offers: ShopOffer[] = slots.slice(0, SHOP_GEAR_OFFERS).map((slot, i) => {
    const item = rollItem({
      seed: hashStr(`shop|${dateKey}|${bucket}|${i}`),
      ilvl,
      slot,
      minRarity: 1,
      luck: l,
      source: 'shop',
      now,
      id: `s-${dateKey}-${bucket.toString(36)}-${i}`,
    });
    return { id: `shop:${dateKey}:gear:${i}`, kind: 'item', label: itemDisplayName(item), price: Math.min(MAX, sellPrice(item) * SHOP_GEAR_MARKUP), item };
  });
  for (const potion of POTION_IDS) {
    const tier = potionTierFor(potion, lv);
    offers.push({
      id: `shop:${dateKey}:potion:${potion}`,
      kind: 'potion',
      label: potionName(potion, tier),
      // phoenix stacks stay tier 1 but its price still follows the hero's bracket
      price: potionPrice(potion, potionTier(lv)),
      potion: { potion, tier },
    });
  }
  return offers;
}

// ---------------------------------------------------------------- permanent unlocks

export const BAG_BASE = 24;
export const BAG_STEP = 4;
export const BAG_MAX = 200;

export function bagUpgradePrice(bagSize: number): number {
  const n = Math.max(0, (posInt(bagSize, 0) - BAG_BASE) / BAG_STEP);
  return Math.min(MAX, Math.round(120 * Math.pow(n + 1, 1.7)));
}

/** 0 for themes that are free from the start; otherwise priced by how early you buy it. */
export function themeUnlockPrice(theme: ThemeId | ThemeDef): number {
  const def = typeof theme === 'string' ? THEME_BY_ID[theme] : theme;
  if (!def || def.unlockLevel <= 1) return 0;
  return Math.round(100 + Math.pow(def.unlockLevel, 1.5) * 25);
}

export interface DyeDef {
  target: DyeTarget;
  color: string;
  name: string;
  price: number;
}

export const DYE_TARGET_NAMES: Record<DyeTarget, string> = { outfit: 'Outfit', hair: 'Hair', pants: 'Pants', cape: 'Cape' };

const dyes = (target: DyeTarget, price: number, list: [string, string][]): DyeDef[] =>
  list.map(([name, color], i) => ({ target, color, name, price: price + i * 20 }));

/** Extra colors beyond the free creator palettes in pixel/sprites/hero.ts. */
export const DYES: DyeDef[] = [
  ...dyes('outfit', 120, [
    ['Royal Purple', '#5a2a9a'],
    ['Midnight', '#1e2a4a'],
    ['Rose Gold', '#e0907a'],
    ['Emerald', '#1a9a5a'],
    ['Sunflower', '#f0d040'],
    ['Obsidian', '#1a1418'],
  ]),
  ...dyes('hair', 80, [
    ['Platinum', '#f4f4f0'],
    ['Flame', '#ff6a1a'],
    ['Mint', '#7ae0b0'],
    ['Lilac', '#b090e0'],
    ['Teal', '#2a9aa0'],
    ['Cherry', '#d02050'],
  ]),
  ...dyes('pants', 60, [
    ['Navy', '#2a3a6a'],
    ['Charcoal', '#3a3a40'],
    ['Forest', '#2e5a2e'],
    ['Burgundy', '#6a1a2a'],
    ['Khaki', '#b8a070'],
    ['Snow', '#e8ecf0'],
  ]),
  ...dyes('cape', 100, [
    ['Crimson', '#b02030'],
    ['Night Blue', '#1a2a6a'],
    ['Gold', '#e0b030'],
    ['Violet', '#7a3ab0'],
    ['Frost', '#a8e0f0'],
    ['Shadow', '#2a2a30'],
  ]),
];

export const dyeKey = (target: DyeTarget, color: string) => `dye:${target}:${color.toLowerCase()}`;
export const themeKey = (theme: ThemeId) => `theme:${theme}`;

/** Bag upgrade, early theme unlocks and dyes the hero does not own yet. */
export function permanentOffers(hero: Pick<Hero, 'bagSize' | 'owned' | 'xp'>): ShopOffer[] {
  const owned = new Set(hero.owned ?? []);
  const level = levelFromXp(sum(hero.xp)).level;
  const bag = posInt(hero.bagSize, BAG_BASE);
  const offers: ShopOffer[] = [];
  if (bag < BAG_MAX) {
    const next = Math.min(BAG_MAX, bag + BAG_STEP);
    offers.push({ id: `bag:${next}`, kind: 'bag', label: `Bigger Bag (+${next - bag} slots)`, price: bagUpgradePrice(bag) });
  }
  for (const t of THEMES) {
    if (t.unlockLevel <= 1 || level >= t.unlockLevel || owned.has(themeKey(t.id))) continue;
    offers.push({ id: themeKey(t.id), kind: 'theme', label: `${t.name} Theme`, price: themeUnlockPrice(t), theme: t.id });
  }
  for (const d of DYES) {
    const id = dyeKey(d.target, d.color);
    if (owned.has(id)) continue;
    offers.push({ id, kind: 'dye', label: `${d.name} ${DYE_TARGET_NAMES[d.target]} Dye`, price: d.price, dye: { target: d.target, color: d.color } });
  }
  return offers;
}
