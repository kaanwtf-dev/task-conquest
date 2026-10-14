// Potions: timed buffs counted in completed tasks. Tiers follow hero level forever.
import type { Buff, PotionId, StatId } from '../core/types';
import { roman } from './progression';

export interface PotionDef {
  name: string;
  color: string; // bottle liquid
  baseValue: number; // percent bonus at tier 1
  baseTasks: number; // duration in completed tasks (0 = instant use)
  stats: StatId[]; // stats the buff adds `value` to
  price: number; // tier-1 shop price
  describe: (value: number, tasks: number) => string;
}

const pct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
const forTasks = (n: number) => `for ${n} task${n === 1 ? '' : 's'}`;

export const POTION_IDS: PotionId[] = ['insight', 'fortune', 'luck', 'fury', 'giant', 'phoenix'];

export const POTIONS: Record<PotionId, PotionDef> = {
  insight: {
    name: 'Insight',
    color: '#5aa8ff',
    baseValue: 20,
    baseTasks: 10,
    stats: ['xp'],
    price: 40,
    describe: (v, n) => `+${pct(v)} XP ${forTasks(n)}`,
  },
  fortune: {
    name: 'Fortune',
    color: '#f2c94c',
    baseValue: 25,
    baseTasks: 10,
    stats: ['gold'],
    price: 40,
    describe: (v, n) => `+${pct(v)} gold ${forTasks(n)}`,
  },
  luck: {
    name: 'Luck',
    color: '#5ee06a',
    baseValue: 20,
    baseTasks: 8,
    stats: ['find', 'luck'],
    price: 50,
    describe: (v, n) => `+${pct(v)} loot find and +${Number.isInteger(v) ? v : v.toFixed(1)} luck ${forTasks(n)}`,
  },
  fury: {
    name: 'Fury',
    color: '#e04a3a',
    baseValue: 10,
    baseTasks: 6,
    stats: ['crit'],
    price: 45,
    describe: (v, n) => `+${pct(v)} critical chance ${forTasks(n)}`,
  },
  giant: {
    name: 'Giant Strength',
    color: '#c070ff',
    baseValue: 30,
    baseTasks: 6,
    stats: ['boss'],
    price: 45,
    describe: (v, n) => `+${pct(v)} boss damage ${forTasks(n)}`,
  },
  phoenix: {
    name: 'Phoenix Feather',
    color: '#ff8a3a',
    baseValue: 0,
    baseTasks: 0,
    stats: [],
    price: 150,
    describe: () => 'Rekindles a broken streak as if no day was missed.',
  },
};

const numeral = (n: number) => (n < 4000 ? roman(n) : String(n));
const tierOf = (tier: number) => (Number.isFinite(tier) ? Math.max(1, Math.floor(tier)) : 1);

/** Tier 1 for levels 1-10, tier 2 for 11-20, ... unbounded. */
export function potionTier(level: number): number {
  const l = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return 1 + Math.floor((l - 1) / 10);
}

/** Phoenix feathers have no strength, so they always stack as tier 1. */
export function potionTierFor(potion: PotionId, level: number): number {
  return potion === 'phoenix' ? 1 : potionTier(level);
}

export function potionName(potion: PotionId, tier: number): string {
  const def = POTIONS[potion];
  if (!def) return 'Strange Potion';
  if (potion === 'phoenix') return def.name;
  return `Potion of ${def.name} ${numeral(tierOf(tier))}`;
}

export function potionValue(potion: PotionId, tier: number): number {
  const def = POTIONS[potion];
  if (!def) return 0;
  // diminishing returns: tier II ~1.35x, X ~3x, approaching 4x — potions boost gear, they never dwarf it
  const growth = 1 + 3 * (1 - Math.exp(-(tierOf(tier) - 1) / 8));
  return Math.round(def.baseValue * growth * 10) / 10;
}

/** Duration in tasks, extended by the hero's potion stat (percent). */
export function potionDuration(potion: PotionId, potionStat: number): number {
  const def = POTIONS[potion];
  if (!def) return 0;
  const bonus = Number.isFinite(potionStat) ? Math.max(0, potionStat) : 0;
  return Math.round(def.baseTasks * (1 + bonus / 100));
}

export function describePotion(potion: PotionId, tier: number, potionStat = 0): string {
  const def = POTIONS[potion];
  return def ? def.describe(potionValue(potion, tier), potionDuration(potion, potionStat)) : '';
}

export function makeBuff(potion: PotionId, tier: number, potionStat: number, id: string): Buff {
  const t = tierOf(tier);
  return { id, potion, tier: t, value: potionValue(potion, t), remaining: potionDuration(potion, potionStat) };
}

/** One task completed: every buff loses a charge; spent buffs fall off. */
export function tickBuffs(buffs: Buff[]): Buff[] {
  return buffs.filter((b) => b.remaining > 0).map((b) => ({ ...b, remaining: b.remaining - 1 })).filter((b) => b.remaining > 0);
}

export function buffBonus(buffs: readonly Buff[], stat: StatId): number {
  let total = 0;
  for (const b of buffs) {
    // same liveness test as tickBuffs, so a corrupt (NaN) charge count never grants a bonus
    if (!(b.remaining > 0) || !Number.isFinite(b.value)) continue;
    if (POTIONS[b.potion]?.stats.includes(stat)) total += b.value;
  }
  return Math.round(total * 10) / 10;
}

export function potionPrice(potion: PotionId, tier: number): number {
  const def = POTIONS[potion];
  if (!def) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(def.price * (1 + 0.8 * (tierOf(tier) - 1))));
}

/** Stack id used in the bag (see PotionStack). */
export const potionStackId = (potion: PotionId, tier: number) => `${potion}:${potion === 'phoenix' ? 1 : tierOf(tier)}`;
