// Infinite progression curves. Levels never cap; each level takes a little longer than the last.
import type { Counter, Difficulty, Hero, SkillId } from '../core/types';
import { tk } from '../i18n';

export const DIFFICULTY = [
  { name: tk('Trivial'), mult: 0.5, stars: 1 },
  { name: tk('Easy'), mult: 1, stars: 2 },
  { name: tk('Normal'), mult: 1.6, stars: 3 },
  { name: tk('Hard'), mult: 2.5, stars: 4 },
  { name: tk('Epic'), mult: 4, stars: 5 },
] as const;

export const sum = (c: Counter | undefined) => (c ? Object.values(c).reduce((a, b) => a + b, 0) : 0);

/** XP a normal-difficulty task is worth at `level` (before bonuses) is base * 1.6. */
export function baseXp(level: number): number {
  return 8 + level * 1.5;
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(baseXp(level) * (6 + 4 * Math.sqrt(level)));
}

/** Corrupt (NaN / negative / non-number) totals count as 0 so the level loops always terminate. */
const cleanTotal = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Derive level + progress from total XP. O(level), fine even at level 10k. */
export function levelFromXp(total: number): { level: number; into: number; need: number } {
  let level = 1;
  let rem = cleanTotal(total);
  for (;;) {
    const need = xpToNext(level);
    if (rem < need) return { level, into: rem, need };
    rem -= need;
    level++;
  }
}

export function heroLevel(hero: Hero) {
  return levelFromXp(sum(hero.xp));
}

export function heroGold(hero: Hero): number {
  return sum(hero.gold) - sum(hero.goldSpent) - sum(hero.penalties ?? {}) + sum(hero.refunds ?? {});
}

export function taskXp(level: number, d: Difficulty): number {
  return Math.round(baseXp(level) * DIFFICULTY[d].mult);
}

export function taskGold(level: number, d: Difficulty, roll: number): number {
  return Math.max(1, Math.round((2 + level * 0.4) * DIFFICULTY[d].mult * (0.8 + roll * 0.4)));
}

// ----- skills (level by use, Elder Scrolls style) -----
export function skillXpToNext(level: number): number {
  return Math.round(20 * Math.pow(level, 1.35));
}

export function skillLevel(xp: number) {
  let level = 1;
  let rem = cleanTotal(xp);
  for (;;) {
    const need = skillXpToNext(level);
    if (rem < need) return { level, into: rem, need };
    rem -= need;
    level++;
  }
}

export function heroSkill(hero: Hero, id: SkillId) {
  return skillLevel(sum(hero.skillXp[id]));
}

// show with titleLabel() from achievements.ts
const TITLES = [
  tk('Novice'), tk('Apprentice'), tk('Journeyman'), tk('Adept'), tk('Expert'), tk('Veteran'), tk('Master'), tk('Grandmaster'),
  tk('Champion'), tk('Hero'), tk('Legend'), tk('Mythic'), tk('Demigod'), tk('Ascendant'), tk('Eternal'),
];

/** English (titles are stored and compared in English): show it with titleLabel() from achievements.ts. */
export function levelTitle(level: number): string {
  const idx = Number.isFinite(level) && level > 1 ? Math.floor((level - 1) / 10) : 0;
  if (idx < TITLES.length) return TITLES[idx];
  return `${TITLES[TITLES.length - 1]} ${roman(idx - TITLES.length + 2)}`;
}

export function roman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 4000) return Math.floor(n).toLocaleString('en-US'); // numerals get silly (and slow) past MMMCMXCIX
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}
