// Hero stats: equipped affixes + race/class perks, soft-capped so they stay bounded forever.
import { SLOTS } from '../core/types';
import type { Buff, ClassId, Hero, HeroStats, Item, StatId } from '../core/types';
import type { RaceId } from '../pixel/sprites/hero';
import { STAT_IDS, itemPower } from './loot';
import { buffBonus } from './potions';

export const SOFT_CAPS: Record<StatId, number> = { xp: 150, gold: 150, find: 100, crit: 45, boss: 200, luck: 200, skill: 150, potion: 200 };
export const BASE_CRIT = 5;

// Conditional perks live in the store: lizardfolk +20% XP on daily tasks, undead streak protection.
export const RACE_BONUS: Partial<Record<RaceId, Partial<Record<StatId, number>>>> = {
  human: { xp: 10 },
  dwarf: { gold: 15 },
  elf: { find: 15 },
  orc: { crit: 8 },
  catfolk: { luck: 15 },
  imp: { potion: 30 },
};

export const CLASS_BONUS: Record<ClassId, Partial<Record<StatId, number>>> = {
  knight: { boss: 10 },
  mage: { xp: 5 },
  ranger: { find: 10 },
  rogue: { crit: 5 },
  berserker: { boss: 15 },
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Smooth diminishing returns: approaches `cap` but never exceeds it. */
export function softCap(x: number, cap: number): number {
  if (!Number.isFinite(x) || x <= 0) return x === Infinity ? cap : 0;
  return cap * (1 - Math.exp(-x / cap));
}

export function emptyStats(): HeroStats {
  return { power: 0, xp: 0, gold: 0, find: 0, crit: 0, boss: 0, luck: 0, skill: 0, potion: 0 };
}

/**
 * Gear affixes are soft-capped; race/class perks are added on top unchanged so their advertised
 * values hold exactly. Base crit is added last.
 */
export function computeStats(hero: Pick<Hero, 'equipped' | 'appearance' | 'classId'>, items: Record<string, Item>): HeroStats {
  const raw = emptyStats();
  let power = 0;
  const seen = new Set<string>();
  for (const slot of SLOTS) {
    const id = hero.equipped?.[slot];
    if (!id || seen.has(id)) continue;
    const item = items[id];
    if (!item || item.deleted || item.slot !== slot) continue;
    seen.add(id);
    power += itemPower(item);
    for (const a of item.affixes ?? [])
      if (STAT_IDS.includes(a.stat) && Number.isFinite(a.value) && a.value > 0) raw[a.stat] += a.value;
  }
  const race = (hero.appearance && RACE_BONUS[hero.appearance.race]) || {};
  const cls = CLASS_BONUS[hero.classId] ?? {};
  const out = emptyStats();
  out.power = Math.min(Number.MAX_SAFE_INTEGER, Math.round(power));
  for (const stat of STAT_IDS) {
    let v = softCap(raw[stat], SOFT_CAPS[stat]) + (race[stat] ?? 0) + (cls[stat] ?? 0);
    if (stat === 'crit') v += BASE_CRIT;
    out[stat] = round1(v);
  }
  return out;
}

/** Adds active potion bonuses. Crit is a chance, so it tops out at 100. */
export function applyBuffs(stats: HeroStats, buffs: readonly Buff[]): HeroStats {
  const out = { ...stats };
  for (const stat of STAT_IDS) {
    const b = buffBonus(buffs, stat);
    if (b) out[stat] = round1(out[stat] + b);
  }
  out.crit = Math.min(100, out.crit);
  return out;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export const STAT_INFO: Record<StatId, { name: string; short: string; describe: (v: number) => string }> = {
  xp: { name: 'Wisdom', short: 'XP', describe: (v) => `+${num(v)}% XP from tasks` },
  gold: { name: 'Greed', short: 'GOLD', describe: (v) => `+${num(v)}% gold from tasks` },
  find: { name: 'Loot Find', short: 'FIND', describe: (v) => `+${num(v)}% chance to find loot` },
  crit: { name: 'Critical', short: 'CRIT', describe: (v) => `${num(v)}% chance for double rewards` },
  boss: { name: 'Boss Damage', short: 'BOSS', describe: (v) => `+${num(v)}% damage to bosses` },
  luck: { name: 'Luck', short: 'LUCK', describe: (v) => `+${num(v)} luck: rarer loot` },
  skill: { name: 'Skill Gain', short: 'SKILL', describe: (v) => `+${num(v)}% skill XP` },
  potion: { name: 'Brewing', short: 'BREW', describe: (v) => `Potions last ${num(v)}% longer` },
};

/** Short affix label for item tooltips, e.g. "+12% XP". */
export function affixLabel(stat: StatId, value: number): string {
  return stat === 'luck' ? `+${num(value)} Luck` : `+${num(value)}% ${STAT_INFO[stat]?.short ?? stat}`;
}
