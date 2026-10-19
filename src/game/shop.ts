// Merchant: a daily rotating stock (deterministic per day + level bracket) plus permanent unlocks.
import { Rng, hashStr } from '../core/rng';
import { t, tk } from '../i18n';
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
  label: string; // in the player's language
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
 * luck is bucketed for the same reason. A new bracket is a new stock, so gear offer ids carry the
 * bracket (a "sold" mark never sticks to an item that was not bought). Luck only re-rolls rarity and
 * affixes of the same slot + base, so it keeps the offer id: one purchase per offer per day.
 */
export function dailyStock(dateKey: string, level: number, luck: number, now: number): ShopOffer[] {
  const lv = posInt(level, 1);
  const bucket = shopBucket(lv);
  const ilvl = bucket * SHOP_LEVEL_BUCKET + 1;
  const lb = Number.isFinite(luck) ? Math.max(0, Math.floor(luck / LUCK_BUCKET)) : 0;
  const l = lb * LUCK_BUCKET;
  const b36 = bucket.toString(36);
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
      id: `s-${dateKey}-${b36}-${lb.toString(36)}-${i}`,
    });
    return { id: `shop:${dateKey}:${b36}:gear:${i}`, kind: 'item', label: itemDisplayName(item), price: Math.min(MAX, sellPrice(item) * SHOP_GEAR_MARKUP), item };
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

export const DYE_TARGET_NAMES: Record<DyeTarget, string> = { outfit: tk('Outfit'), hair: tk('Hair'), pants: tk('Pants'), cape: tk('Cape') };

const dyes = (target: DyeTarget, price: number, list: [string, string][]): DyeDef[] =>
  list.map(([name, color], i) => ({ target, color, name, price: price + i * 20 }));

/** Extra colors beyond the free creator palettes in pixel/sprites/hero.ts. */
export const DYES: DyeDef[] = [
  ...dyes('outfit', 120, [
    [tk('Royal Purple'), '#5a2a9a'],
    [tk('Midnight'), '#1e2a4a'],
    [tk('Rose Gold'), '#e0907a'],
    [tk('Emerald'), '#1a9a5a'],
    [tk('Sunflower'), '#f0d040'],
    [tk('Obsidian'), '#1a1418'],
  ]),
  ...dyes('hair', 80, [
    [tk('Platinum'), '#f4f4f0'],
    [tk('Flame'), '#ff6a1a'],
    [tk('Mint'), '#7ae0b0'],
    [tk('Lilac'), '#b090e0'],
    [tk('Teal'), '#2a9aa0'],
    [tk('Cherry'), '#d02050'],
  ]),
  ...dyes('pants', 60, [
    [tk('Navy'), '#2a3a6a'],
    [tk('Charcoal'), '#3a3a40'],
    [tk('Forest'), '#2e5a2e'],
    [tk('Burgundy'), '#6a1a2a'],
    [tk('Khaki'), '#b8a070'],
    [tk('Snow'), '#e8ecf0'],
  ]),
  ...dyes('cape', 100, [
    [tk('Crimson'), '#b02030'],
    [tk('Night Blue'), '#1a2a6a'],
    [tk('Gold'), '#e0b030'],
    [tk('Violet'), '#7a3ab0'],
    [tk('Frost'), '#a8e0f0'],
    [tk('Shadow'), '#2a2a30'],
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
    offers.push({ id: `bag:${next}`, kind: 'bag', label: t('Bigger Bag (+{n} slots)', { n: next - bag }), price: bagUpgradePrice(bag) });
  }
  for (const th of THEMES) {
    if (th.unlockLevel <= 1 || level >= th.unlockLevel || owned.has(themeKey(th.id))) continue;
    offers.push({ id: themeKey(th.id), kind: 'theme', label: t('{name} Theme', { name: t(th.name) }), price: themeUnlockPrice(th), theme: th.id });
  }
  for (const d of DYES) {
    const id = dyeKey(d.target, d.color);
    if (owned.has(id)) continue;
    offers.push({ id, kind: 'dye', label: t('{color} {target} Dye', { color: t(d.name), target: t(DYE_TARGET_NAMES[d.target]) }), price: d.price, dye: { target: d.target, color: d.color } });
  }
  return offers;
}
