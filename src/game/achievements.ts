// Infinite achievement tracks: tier thresholds forever, gold per tier and unlockable titles. All pure.
import type { Hero } from '../core/types';
import { SKILLS } from './catalog';
import { levelTitle, skillXpToNext, sum } from './progression';

const MAX = Number.MAX_SAFE_INTEGER;
const count = (n: number) => (Number.isFinite(n) ? Math.min(MAX, Math.max(0, Math.floor(n))) : 0);
const tierOf = (t: number) => (Number.isFinite(t) ? Math.max(1, Math.floor(t)) : 1);

export interface AchievementCtx {
  bestStreak: number;
  level: number;
}

// ---------------------------------------------------------------- number labels

const groups = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const SCALE = ['Million', 'Billion', 'Trillion', 'Quadrillion', 'Quintillion', 'Sextillion', 'Septillion', 'Octillion', 'Nonillion', 'Decillion'];

/** `mant * 10^exp` as "250", "25,000", "2.5 Million" or "5×10^40"; exact for any exponent. */
function scaledLabel(mant: number, exp: number): string {
  if (exp < 6) return groups(Math.round(mant * 10 ** exp));
  const word = Math.floor((exp - 6) / 3);
  if (word < SCALE.length) return `${mant * 10 ** ((exp - 6) % 3)} ${SCALE[word]}`;
  return `${mant}×10^${groups(exp)}`;
}

/** Plain integer label: "730", "25,000", "2.5 Million" (rounded to one decimal past a million). */
export function formatCount(n: number): string {
  const v = count(n);
  if (v < 1e6) return groups(v);
  let exp = Math.floor((String(v).length - 1) / 3) * 3;
  let mant = Math.round((v / 10 ** exp) * 10) / 10;
  if (mant >= 1000) {
    mant /= 1000;
    exp += 3;
  }
  return scaledLabel(mant, exp);
}

// ---------------------------------------------------------------- threshold ladders

interface Ladder {
  at(tier: number): number; // value needed for `tier` (1-based)
  tierFor(value: number): number; // tiers reached at `value`
  label(tier: number): string; // threshold of `tier` for generated titles
  max?: number; // capped ladders stop here
}

/** The 1-2.5-5 series with 3 standing in for 2.5 below ten: 1, 3, 5, 10, 25, 50, 100, 250, 500, ... */
const MANT = [1, 2.5, 5];
const seriesMant = (k: number) => (k === 1 ? 3 : MANT[k % 3]);
export const seriesValue = (k: number): number => Math.min(Number.MAX_VALUE, Number(`${seriesMant(k)}e${Math.floor(k / 3)}`));

function seriesLadder(first: number): Ladder {
  let k0 = 0;
  while (seriesValue(k0) < first) k0++;
  return {
    at: (t) => seriesValue(k0 + tierOf(t) - 1),
    tierFor(value) {
      const v = count(value);
      if (v < seriesValue(k0)) return 0;
      // the estimate's value is at most v / 2, so only walk upward
      let k = Math.max(k0, Math.floor(3 * Math.log10(v)) - 3);
      while (seriesValue(k + 1) <= v) k++;
      return k - k0 + 1;
    },
    label: (t) => {
      const k = k0 + tierOf(t) - 1;
      return scaledLabel(seriesMant(k), Math.floor(k / 3));
    },
  };
}

/** Days: 3, 7, 14, 30, 60, 100, 180, 365, then another year per tier. */
const STREAK_DAYS = [3, 7, 14, 30, 60, 100, 180, 365];
const streakLadder: Ladder = {
  at: (t) => {
    const n = tierOf(t);
    return n <= STREAK_DAYS.length ? STREAK_DAYS[n - 1] : 365 * (n - STREAK_DAYS.length + 1);
  },
  tierFor(value) {
    const v = count(value);
    return v >= 365 ? STREAK_DAYS.length - 1 + Math.floor(v / 365) : STREAK_DAYS.filter((d) => d <= v).length;
  },
  label: (t) => groups(tierOf(t) - STREAK_DAYS.length + 1), // years, exact so titles never repeat
};

/** 1, 2, ... max, then capped. */
const cappedLadder = (max: number): Ladder => ({
  at: (t) => Math.min(max, tierOf(t)),
  tierFor: (value) => Math.min(max, count(value)),
  label: (t) => formatCount(Math.min(max, tierOf(t))),
  max,
});

// ---------------------------------------------------------------- tracks

/**
 * Skill XP at which heroSkill(...).level reaches POLYMATH_LEVEL. Comparing against it gives the same answer as
 * heroSkill without its O(level) walk, which takes ~0.1 s at huge XP and never ends on a corrupt (NaN) counter.
 */
const POLYMATH_LEVEL = 10;
const POLYMATH_XP = Array.from({ length: POLYMATH_LEVEL - 1 }, (_, k) => skillXpToNext(k + 1)).reduce((a, b) => a + b, 0);

export interface AchievementDef {
  id: string; // stored in hero.achievements; never rename
  name: string;
  icon: string; // emoji, pixelized on render
  description: string;
  maxTier?: number; // capped tracks only
  threshold(tier: number): number;
  tierFor(value: number): number;
  /** Gold for claiming `tier`. */
  reward(tier: number): number;
  /** Hand-written for the first tiers, generated after. */
  title(tier: number): string;
  value(hero: Hero, ctx: AchievementCtx): number;
}

interface TrackSpec {
  id: string;
  name: string;
  icon: string;
  description: string;
  ladder: Ladder;
  gold: number; // tier t pays gold * t^2
  titles: string[];
  generated: (label: string) => string;
  value: (hero: Hero, ctx: AchievementCtx) => number;
  paidByClaims?: boolean; // the metric grows by the gold that claiming pays out
}

/** Gold for tiers (from, to]: gold * sum of squares, closed form so any gap stays O(1). */
function goldBetween(gold: number, from: number, to: number): number {
  const sq = (n: number) => (n * (n + 1) * (2 * n + 1)) / 6;
  return to > from ? Math.min(MAX, Math.round(gold * (sq(to) - sq(from)))) : 0;
}

const track = (s: TrackSpec): AchievementDef & { gold: number; handTitles: number; paidByClaims: boolean } => ({
  id: s.id,
  name: s.name,
  icon: s.icon,
  description: s.description,
  maxTier: s.ladder.max,
  threshold: (t) => s.ladder.at(t),
  tierFor: (v) => s.ladder.tierFor(v),
  reward: (t) => goldBetween(s.gold, tierOf(t) - 1, tierOf(t)),
  title: (t) => {
    const n = tierOf(t);
    const capped = s.ladder.max ? Math.min(n, s.ladder.max) : n;
    return capped <= s.titles.length ? s.titles[capped - 1] : s.generated(s.ladder.label(capped));
  },
  value: s.value,
  gold: s.gold,
  handTitles: s.titles.length,
  paidByClaims: !!s.paidByClaims,
});

const DEFS = [
  track({
    id: 'slayer',
    name: 'Monster Slayer',
    icon: '⚔️',
    description: 'Slay monsters by completing tasks.',
    ladder: seriesLadder(10),
    gold: 20,
    titles: ['Pest Control', 'Critter Crusher', 'Monster Masher', 'Centurion of Chores', 'Beastbane', 'Horde Breaker', 'Thousand-Blade', 'Dread of Dungeons'],
    generated: (n) => `Slayer of ${n}`,
    value: (h) => sum(h.kills),
  }),
  track({
    id: 'quests',
    name: 'Quest Finisher',
    icon: '📜',
    description: 'Complete tasks of any kind.',
    ladder: seriesLadder(1),
    gold: 15,
    titles: ['First Steps', 'Errand Runner', 'Task Tackler', 'Checklist Champion', 'Done and Dusted', 'Taskmaster', 'The Unstoppable', 'Finisher of Fates'],
    generated: (n) => `Finisher of ${n} Quests`,
    value: (h) => sum(h.tasksDone),
  }),
  track({
    id: 'treasure',
    name: 'Treasure Hunter',
    icon: '💎',
    description: 'Find gear in drops and chests.',
    ladder: seriesLadder(5),
    gold: 20,
    titles: ['Magpie', 'Shiny Seeker', 'Trinket Collector', 'Loot Goblin', 'Relic Wrangler', 'Vault Raider', 'Hoard Hunter', 'Keeper of a Thousand Baubles'],
    generated: (n) => `Finder of ${n} Treasures`,
    value: (h) => sum(h.itemsFound),
  }),
  track({
    id: 'bosses',
    name: 'Boss Hunter',
    icon: '👑',
    description: 'Topple bosses on the endless ladder.',
    ladder: seriesLadder(1),
    gold: 30,
    titles: ['Giant Toppler', 'Crown Cracker', 'Bossbreaker', 'Bane of Warlords', 'Tyrant Tamer', 'Calamity Ender', 'Breaker of Worldbreakers', 'Ladder Legend'],
    generated: (n) => `Toppler of ${n} Bosses`,
    value: (h) => sum(h.bossesSlain),
  }),
  track({
    id: 'gold',
    name: 'Gold Hoarder',
    icon: '💰',
    description: 'Earn gold. Spending never counts against you.',
    ladder: seriesLadder(100),
    gold: 15,
    titles: ['Penny Pincher', 'Coin Counter', 'Purse Proud', 'Moneybags', 'Gilded Glutton', 'Merchant Prince', 'Ledger Dragon', 'Treasury Tyrant'],
    generated: (n) => `Hoarder of ${n} Gold`,
    value: (h) => sum(h.gold),
    paidByClaims: true,
  }),
  track({
    id: 'streak',
    name: 'Unbroken',
    icon: '🔥',
    description: 'Keep a daily streak alive. Your best run counts.',
    ladder: streakLadder,
    gold: 30,
    titles: ['Kindled', 'Week Warrior', 'Fortnight Knight', 'Moonkeeper', 'Iron Habit', 'Centurion of Days', 'Half-Year Hero', 'Keeper of the Year'],
    generated: (n) => `Unbroken for ${n} Years`,
    value: (_h, ctx) => ctx.bestStreak,
  }),
  track({
    id: 'alchemist',
    name: 'Alchemist',
    icon: '⚗️',
    description: 'Drink potions.',
    ladder: seriesLadder(1),
    gold: 20,
    titles: ['Taste Tester', 'Fizz Sipper', 'Brew Dabbler', 'Potion Pundit', 'Cauldron Captain', 'Elixir Sage', 'Philosopher of Fizz', 'Grand Distiller'],
    generated: (n) => `Drinker of ${n} Potions`,
    value: (h) => sum(h.potionsUsed),
  }),
  track({
    id: 'realms',
    name: 'Realm Keeper',
    icon: '🏰',
    description: 'Clear every task in a list for its period.',
    ladder: seriesLadder(1),
    gold: 25,
    titles: ['Tidy Tenant', 'Hearth Holder', 'Steward', 'Castellan', 'Warden of the Realm', 'Sovereign of Lists', 'Order Incarnate', 'Keeper of Realms'],
    generated: (n) => `Keeper of ${n} Realms`,
    value: (h) => sum(h.questsCleared),
  }),
  track({
    id: 'ascension',
    name: 'Ascension',
    icon: '⭐',
    description: 'Reach new hero levels.',
    ladder: seriesLadder(5),
    gold: 25,
    titles: ['Fledgling', 'Seasoned', 'Skybound', 'Peak Seeker', 'Centennial', 'Starwalker', 'Beyond the Clouds', 'The Thousandth Step'],
    generated: (n) => `Ascended to Level ${n}`,
    value: (_h, ctx) => ctx.level,
  }),
  track({
    id: 'polymath',
    name: 'Polymath',
    icon: '🎓',
    description: `Raise different skills to level ${POLYMATH_LEVEL}.`,
    ladder: cappedLadder(SKILLS.length),
    gold: 50,
    titles: [
      'Dabbler', 'Two-Trick Pony', 'Jack of Trades', 'Well-Rounded', 'Renaissance Soul',
      'Many-Handed', 'Sage of Seven Arts', 'Eightfold Adept', 'Ninefold Master', 'Master of All Trades',
    ],
    generated: (n) => `Master of ${n} Skills`,
    value: (h) =>
      SKILLS.filter((s) => {
        const xp: unknown = sum(h.skillXp?.[s.id]); // a corrupt counter can sum to a string
        return typeof xp === 'number' && xp >= POLYMATH_XP;
      }).length,
  }),
];

export const ACHIEVEMENTS: readonly AchievementDef[] = DEFS;

// ---------------------------------------------------------------- status + claiming

export interface AchievementStatus {
  id: string;
  name: string;
  icon: string;
  description: string;
  value: number;
  tierReached: number;
  tierClaimed: number;
  nextThreshold: number; // when maxed: the last threshold
  prevThreshold: number; // threshold of tierReached (0 before tier 1)
  claimable: number; // tiers ready to claim
  nextReward: number; // gold for reaching the next tier (0 when maxed)
  pendingGold: number; // gold waiting in claimable tiers
  titles: string[]; // unlocked by claimed tiers
  nextTitle: string | null;
  maxed: boolean;
}

/**
 * Titles unlocked by claiming tiers 1..claimed: every hand-written one, plus only the highest generated one
 * (it supersedes the lower numbers and keeps the list short forever).
 */
function titlesUpTo(def: (typeof DEFS)[number], claimed: number): string[] {
  const n = def.maxTier ? Math.min(claimed, def.maxTier) : claimed;
  const out: string[] = [];
  for (let t = 1; t <= Math.min(n, def.handTitles); t++) out.push(def.title(t));
  if (n > def.handTitles) out.push(def.title(n));
  return out;
}

const claimedTier = (hero: Hero, id: string) => count(hero.achievements?.[id] ?? 0);

function safeCtx(ctx: AchievementCtx): AchievementCtx {
  return { bestStreak: count(ctx?.bestStreak ?? 0), level: Math.max(1, count(ctx?.level ?? 1)) };
}

export function achievementStatus(hero: Hero, ctx: AchievementCtx): AchievementStatus[] {
  const c = safeCtx(ctx);
  return DEFS.map((def) => {
    const value = count(def.value(hero, c));
    const reached = def.tierFor(value);
    const claimed = claimedTier(hero, def.id);
    const maxed = def.maxTier !== undefined && reached >= def.maxTier;
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      description: def.description,
      value,
      tierReached: reached,
      tierClaimed: claimed,
      nextThreshold: maxed ? def.threshold(def.maxTier!) : def.threshold(reached + 1),
      prevThreshold: maxed ? (def.maxTier! > 1 ? def.threshold(def.maxTier! - 1) : 0) : reached > 0 ? def.threshold(reached) : 0,
      claimable: Math.max(0, reached - claimed),
      nextReward: maxed ? 0 : def.reward(reached + 1),
      pendingGold: goldBetween(def.gold, claimed, reached),
      titles: titlesUpTo(def, claimed),
      nextTitle: maxed ? null : def.title(reached + 1),
      maxed,
    };
  });
}

/**
 * Everything ready to claim. Pure: the store adds `gold` to hero.gold and merges `tiers` into hero.achievements.
 * Claimed gold is earned gold, so Gold Hoarder tiers it unlocks are settled in the same claim; claiming again
 * after the store applies the result yields nothing.
 */
export function claimRewards(hero: Hero, ctx: AchievementCtx): { gold: number; tiers: Record<string, number>; newTitles: string[] } {
  const c = safeCtx(ctx);
  const values = DEFS.map((def) => count(def.value(hero, c)));
  let gold = 0;
  const tiers: Record<string, number> = {};
  // rewards grow polynomially while thresholds grow geometrically, so this settles in a few passes
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    DEFS.forEach((def, k) => {
      const reached = def.tierFor(def.paidByClaims ? Math.min(MAX, values[k] + gold) : values[k]);
      const claimed = tiers[def.id] ?? claimedTier(hero, def.id);
      if (reached <= claimed) return;
      gold = Math.min(MAX, gold + goldBetween(def.gold, claimed, reached));
      tiers[def.id] = reached;
      changed = true;
    });
    if (!changed) break;
  }
  const newTitles: string[] = [];
  for (const def of DEFS) {
    if (tiers[def.id] === undefined) continue;
    const had = new Set(titlesUpTo(def, claimedTier(hero, def.id)));
    newTitles.push(...titlesUpTo(def, tiers[def.id]).filter((t) => !had.has(t)));
  }
  return { gold, tiers, newTitles };
}

/** Named level brackets offered as titles; past these only the current (numbered) level title is listed. */
const LEVEL_TITLE_BRACKETS = 15;

/** Level titles reached so far, then achievement titles from claimed tiers (deduped, in track order). */
export function unlockedTitles(hero: Hero, ctx: AchievementCtx): string[] {
  const c = safeCtx(ctx);
  const out: string[] = [];
  const brackets = Math.min(LEVEL_TITLE_BRACKETS, Math.floor((c.level - 1) / 10) + 1);
  for (let k = 0; k < brackets; k++) out.push(levelTitle(1 + 10 * k));
  out.push(levelTitle(c.level));
  for (const def of DEFS) out.push(...titlesUpTo(def, claimedTier(hero, def.id)));
  return [...new Set(out)];
}
