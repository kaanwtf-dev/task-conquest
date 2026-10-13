import { describe, expect, it } from 'vitest';
import type { Hero } from '../core/types';
import { ACHIEVEMENTS, achievementStatus, claimRewards, formatCount, seriesValue, unlockedTitles, type AchievementCtx } from './achievements';
import { levelTitle, skillXpToNext } from './progression';

function hero(patch: Partial<Hero> = {}): Hero {
  return {
    id: 'h',
    updatedAt: 0,
    name: 'Test',
    appearance: { race: 'human', skin: 0, hair: 'short', hairColor: '#000000', eyes: '#000000', beard: 'none', outfit: '#3a6ad0', pants: '#3a3a4a' },
    classId: 'knight',
    xp: {},
    gold: {},
    goldSpent: {},
    kills: {},
    tasksDone: {},
    skillXp: {},
    activeDays: [],
    createdAt: 0,
    equipped: {},
    buffs: [],
    bagSize: 24,
    bossIndex: 1,
    bossDamage: {},
    bossesSlain: {},
    itemsFound: {},
    potionsUsed: {},
    questsCleared: {},
    achievements: {},
    owned: [],
    streakSaves: 0,
    savedDays: [],
    ...patch,
  };
}

const ctx: AchievementCtx = { bestStreak: 0, level: 1 };
const def = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const thresholds = (id: string, n: number) => Array.from({ length: n }, (_, k) => def(id).threshold(k + 1));
const status = (h: Hero, c: AchievementCtx = ctx) => Object.fromEntries(achievementStatus(h, c).map((s) => [s.id, s]));

/** Total skill XP that reaches `level`. */
const skillXpFor = (level: number) => Array.from({ length: level - 1 }, (_, k) => skillXpToNext(k + 1)).reduce((a, b) => a + b, 0);

describe('threshold ladders', () => {
  it('follow the 1-2.5-5 series forever', () => {
    expect(Array.from({ length: 12 }, (_, k) => seriesValue(k))).toEqual([1, 3, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]);
    expect(thresholds('slayer', 10)).toEqual([10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
    expect(thresholds('quests', 5)).toEqual([1, 3, 5, 10, 25]);
    expect(thresholds('treasure', 4)).toEqual([5, 10, 25, 50]);
    expect(thresholds('bosses', 6)).toEqual([1, 3, 5, 10, 25, 50]);
    expect(thresholds('gold', 4)).toEqual([100, 250, 500, 1000]);
    expect(thresholds('alchemist', 3)).toEqual([1, 3, 5]);
    expect(thresholds('realms', 3)).toEqual([1, 3, 5]);
    expect(thresholds('ascension', 6)).toEqual([5, 10, 25, 50, 100, 250]);
  });

  it('streak: 3, 7, 14, 30, 60, 100, 180, 365, then another year per tier', () => {
    expect(thresholds('streak', 11)).toEqual([3, 7, 14, 30, 60, 100, 180, 365, 730, 1095, 1460]);
  });

  it('polymath counts skills to 10 and caps', () => {
    expect(thresholds('polymath', 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
    expect(def('polymath').maxTier).toBe(10);
    expect(def('polymath').tierFor(25)).toBe(10);
  });

  it('tierFor inverts threshold on every track', () => {
    for (const a of ACHIEVEMENTS) {
      const top = a.maxTier ?? 40;
      expect(a.tierFor(0), a.id).toBe(0);
      for (let t = 1; t <= top; t++) {
        const th = a.threshold(t);
        expect(th, `${a.id} ${t}`).toBeGreaterThan(t > 1 ? a.threshold(t - 1) : 0);
        if (th > Number.MAX_SAFE_INTEGER) continue;
        expect(a.tierFor(th), `${a.id} ${t}`).toBe(t);
        expect(a.tierFor(th - 1), `${a.id} ${t}`).toBe(t - 1);
      }
    }
  });

  it('infinite tiers stay finite at 1e9 and beyond', () => {
    for (const v of [1e9, 1e15, Number.MAX_SAFE_INTEGER, 1e300, Infinity, NaN, -4]) {
      const h = hero({ kills: { a: v }, tasksDone: { a: v }, gold: { a: v }, itemsFound: { a: v }, bossesSlain: { a: v }, potionsUsed: { a: v }, questsCleared: { a: v } });
      for (const s of achievementStatus(h, { bestStreak: v, level: v })) {
        for (const n of [s.value, s.tierReached, s.nextThreshold, s.prevThreshold, s.claimable, s.nextReward, s.pendingGold])
          expect(Number.isFinite(n), `${s.id} @ ${v}`).toBe(true);
        expect(s.nextThreshold, s.id).toBeGreaterThanOrEqual(s.prevThreshold);
        for (const t of [...s.titles, s.nextTitle ?? '']) expect(t).not.toMatch(/NaN|Infinity|undefined/);
      }
      const r = claimRewards(h, { bestStreak: v, level: v });
      expect(Number.isFinite(r.gold)).toBe(true);
    }
    const big = status(hero({ kills: { a: 1e9 } }), { bestStreak: 1e9, level: 1e9 });
    expect(big.slayer.tierReached).toBe(25); // 10, 25, 50, ... 1e9 is the 25th threshold
    expect(big.slayer.nextThreshold).toBe(2.5e9);
    expect(big.streak.tierReached).toBe(7 + Math.floor(1e9 / 365));
    for (const a of ACHIEVEMENTS) {
      expect(Number.isFinite(a.threshold(1e6)), a.id).toBe(true);
      expect(Number.isFinite(a.reward(1e6)), a.id).toBe(true);
      expect(a.title(1e6), a.id).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('titles', () => {
  it('are unique per track tier and across tracks', () => {
    const all = new Set<string>();
    for (const a of ACHIEVEMENTS) {
      const top = a.maxTier ?? 60;
      for (let t = 1; t <= top; t++) {
        const title = a.title(t);
        expect(title.length, `${a.id} ${t}`).toBeGreaterThan(2);
        expect(all.has(title), `${a.id} ${t}: ${title}`).toBe(false);
        all.add(title);
      }
    }
    // none clash with level titles
    for (let l = 1; l <= 300; l += 10) expect(all.has(levelTitle(l))).toBe(false);
  });

  it('are hand-written first, then generated from the threshold', () => {
    expect(def('slayer').title(1)).toBe('Pest Control');
    expect(def('slayer').title(9)).toBe('Slayer of 5,000');
    expect(def('slayer').title(13)).toBe('Slayer of 100,000');
    expect(def('slayer').title(17)).toBe('Slayer of 2.5 Million');
    expect(def('streak').title(9)).toBe('Unbroken for 2 Years');
    expect(def('gold').title(9)).toBe('Hoarder of 50,000 Gold');
    expect(def('polymath').title(10)).toBe('Master of All Trades');
    expect(def('slayer').title(500)).toMatch(/^Slayer of [\d.]+×10\^[\d,]+$/);
  });
});

describe('status + claiming', () => {
  it('reports progress and pending rewards', () => {
    const s = status(hero({ kills: { a: 30, b: 7 }, achievements: { slayer: 1 } })).slayer;
    expect(s.value).toBe(37);
    expect(s.tierReached).toBe(2);
    expect(s.tierClaimed).toBe(1);
    expect(s.claimable).toBe(1);
    expect(s.prevThreshold).toBe(25);
    expect(s.nextThreshold).toBe(50);
    expect(s.pendingGold).toBe(def('slayer').reward(2));
    expect(s.nextReward).toBe(def('slayer').reward(3));
    expect(s.titles).toEqual(['Pest Control']);
    expect(s.nextTitle).toBe('Monster Masher');
    const fresh = status(hero()).slayer;
    expect([fresh.tierReached, fresh.prevThreshold, fresh.nextThreshold, fresh.claimable]).toEqual([0, 0, 10, 0]);
  });

  it('reward gold grows with tier', () => {
    for (const a of ACHIEVEMENTS) for (let t = 2; t <= 30; t++) expect(a.reward(t), a.id).toBeGreaterThan(a.reward(t - 1));
  });

  it('reads every metric source', () => {
    const skillXp = { lore: { a: skillXpFor(10) }, smithing: { a: skillXpFor(12) }, athletics: { a: skillXpFor(9) } };
    const h = hero({
      kills: { a: 10 },
      tasksDone: { a: 3 },
      itemsFound: { a: 5 },
      bossesSlain: { a: 1, b: 2 },
      gold: { a: 100 },
      goldSpent: { a: 100 },
      potionsUsed: { a: 1 },
      questsCleared: { a: 5 },
      skillXp,
    });
    const s = status(h, { bestStreak: 14, level: 25 });
    expect(s.slayer.tierReached).toBe(1);
    expect(s.quests.tierReached).toBe(2);
    expect(s.treasure.tierReached).toBe(1);
    expect(s.bosses.tierReached).toBe(2);
    expect(s.gold.tierReached).toBe(1); // gold earned, spending ignored
    expect(s.streak.tierReached).toBe(3);
    expect(s.alchemist.tierReached).toBe(1);
    expect(s.realms.tierReached).toBe(3);
    expect(s.ascension.tierReached).toBe(3);
    expect(s.polymath.value).toBe(2);
  });

  it('polymath maxes out with every skill at 10', () => {
    const skillXp = Object.fromEntries(
      ['athletics', 'hearthcraft', 'mercantile', 'lore', 'smithing', 'alchemy', 'speech', 'restoration', 'artistry', 'wayfaring'].map((id) => [id, { a: skillXpFor(10) }]),
    );
    const s = status(hero({ skillXp, achievements: { polymath: 10 } })).polymath;
    expect(s.maxed).toBe(true);
    expect(s.claimable).toBe(0);
    expect(s.nextReward).toBe(0);
    expect(s.nextTitle).toBeNull();
    expect([s.prevThreshold, s.nextThreshold]).toEqual([9, 10]);
  });

  it('claims everything once and is idempotent', () => {
    const c = { bestStreak: 8, level: 12 };
    const h = hero({ kills: { a: 60 }, tasksDone: { a: 60 }, bossesSlain: { a: 3 }, gold: { a: 120 }, achievements: { slayer: 1 } });
    const snapshot = JSON.stringify(h);
    const r = claimRewards(h, c);
    expect(JSON.stringify(h)).toBe(snapshot); // pure
    expect(claimRewards(h, c)).toEqual(r); // deterministic
    const { gold: goldTier, ...rest } = r.tiers;
    expect(rest).toEqual({ slayer: 3, quests: 6, bosses: 2, streak: 2, ascension: 2 });
    // the payout is itself gold earned: Gold Hoarder settles at the tier that 120 + payout reaches
    expect(goldTier).toBeGreaterThan(1);
    expect(goldTier).toBe(def('gold').tierFor(120 + r.gold));
    expect(r.gold).toBeGreaterThan(achievementStatus(h, c).reduce((g, s) => g + s.pendingGold, 0));
    expect(r.newTitles).toContain('Critter Crusher');
    expect(r.newTitles).toContain('Monster Masher');
    expect(r.newTitles).not.toContain('Pest Control'); // already claimed
    expect(r.newTitles).toContain('Week Warrior');
    // apply like the store does, then claim again: nothing left
    const after = hero({ ...h, achievements: { ...h.achievements, ...r.tiers }, gold: { a: 120, b: r.gold } });
    expect(claimRewards(after, c)).toEqual({ gold: 0, tiers: {}, newTitles: [] });
    expect(achievementStatus(after, c).reduce((n, s) => n + s.claimable, 0)).toBe(0);
  });

  it('pays exactly the pending gold when the payout unlocks nothing new', () => {
    const h = hero({ kills: { a: 10 }, bossesSlain: { a: 1 } });
    const r = claimRewards(h, ctx);
    expect(r.gold).toBe(achievementStatus(h, ctx).reduce((g, s) => g + s.pendingGold, 0));
    expect(r.gold).toBe(def('slayer').reward(1) + def('bosses').reward(1));
    expect(r.newTitles).toEqual(['Pest Control', 'Giant Toppler']);
  });

  it('never pays again when progress drops below what was claimed', () => {
    const h = hero({ achievements: { streak: 5 } });
    const s = status(h, { bestStreak: 10, level: 1 }).streak;
    expect(s.claimable).toBe(0);
    expect(s.titles).toHaveLength(5);
    expect(claimRewards(h, { bestStreak: 10, level: 1 }).tiers).toEqual({});
  });

  it('keeps only the highest generated title per track', () => {
    const h = hero({ achievements: { slayer: 12, streak: 10 } });
    const s = status(h).slayer;
    expect(s.titles).toHaveLength(9); // 8 hand-written + "Slayer of 50,000"
    expect(s.titles[8]).toBe('Slayer of 50,000');
    const r = claimRewards(hero({ kills: { a: 1e6 }, achievements: { slayer: 12, gold: 30 } }), ctx);
    expect(r.tiers.slayer).toBe(16);
    expect(r.newTitles).toEqual(['Slayer of 1 Million']);
  });

  it('unlockedTitles lists level titles then claimed achievement titles', () => {
    const titles = unlockedTitles(hero({ achievements: { quests: 2, bosses: 1 } }), { bestStreak: 0, level: 35 });
    expect(titles.slice(0, 4)).toEqual([levelTitle(1), levelTitle(11), levelTitle(21), levelTitle(31)]);
    expect(titles).toContain('First Steps');
    expect(titles).toContain('Errand Runner');
    expect(titles).toContain('Giant Toppler');
    expect(new Set(titles).size).toBe(titles.length);
    const late = unlockedTitles(hero(), { bestStreak: 0, level: 10000 });
    expect(late).toContain(levelTitle(10000));
    expect(late.length).toBeLessThanOrEqual(16);
  });
});

describe('formatCount', () => {
  it('groups digits and names big numbers', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(730)).toBe('730');
    expect(formatCount(25000)).toBe('25,000');
    expect(formatCount(2.5e6)).toBe('2.5 Million');
    expect(formatCount(999_999_999)).toBe('1 Billion');
    expect(formatCount(Infinity)).toBe('0');
  });
});
