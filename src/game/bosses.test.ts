import { describe, expect, it } from 'vitest';
import type { ClassId, Difficulty, Hero, Item } from '../core/types';
import type { Appearance } from '../pixel/sprites/hero';
import { MONSTER_BY_ID } from '../pixel/sprites/monsters';
import {
  BOSS_NAME_CYCLE,
  bossFor,
  bossName,
  bossLevel,
  bossProgress,
  bossRank,
  bossReward,
  damageForTask,
  expectedPower,
  gearFactor,
  levelAfterTasks,
  tasksToLevel,
} from './bosses';
import { starterItems } from './loot';
import { taskXp, xpToNext } from './progression';
import { computeStats } from './stats';

const CLASSES: ClassId[] = ['knight', 'mage', 'ranger', 'rogue', 'berserker'];
const appearance: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#000000', eyes: '#000000', beard: 'none', outfit: '#3a6ad0', pants: '#3a3a4a' };
const isRegular = (i: number) => bossRank(i) === 'boss';

/** Normal tasks on the real XP curve; `power(level, boss)` is the hero's gear Power while fighting `boss`. */
function simulate(bosses: number, power: (level: number, boss: number) => number, bossPct = 0) {
  let level = 1;
  let xp = 0;
  const tasks: number[] = [0];
  const levels: number[] = [0];
  for (let i = 1; i <= bosses; i++) {
    const { maxHp } = bossFor(i);
    let dealt = 0;
    let n = 0;
    while (dealt < maxHp) {
      dealt += damageForTask({ difficulty: 2, power: power(level, i), level, bossPct, crit: false });
      xp += taskXp(level, 2);
      n++;
      while (xp >= xpToNext(level)) xp -= xpToNext(level++);
    }
    tasks.push(n);
    levels.push(level);
  }
  return { tasks, levels };
}

describe('boss ladder', () => {
  it('is deterministic and opens with a memorable first boss', () => {
    expect(bossFor(1)).toEqual(bossFor(1));
    expect(bossFor(1).name).toBe('Mother Mossbelly');
    expect(bossFor(1).index).toBe(1);
    expect(bossFor(1).hue).toBe(0);
    for (const i of [2, 17, 333, 98765]) expect(bossFor(i)).toEqual(bossFor(i));
  });

  it('gives every boss a unique name across a full lap of the name space and beyond', () => {
    const n = BOSS_NAME_CYCLE + 2000;
    const seen = new Set<string>();
    // crude in British English, or reads as such inside compounds ("Big Knob...", "Mother Shag...")
    const crude = /knob|shag|wank|fart|piss|butt|boob|dick|cock|tit(?!an)/i;
    const flagged: string[] = [];
    for (let i = 1; i <= n; i++) {
      const name = bossName(i);
      seen.add(name);
      if (crude.test(name)) flagged.push(name);
    }
    expect(seen.size).toBe(n);
    expect(flagged.slice(0, 5)).toEqual([]);
    // later laps carry a generation numeral
    expect(bossFor(BOSS_NAME_CYCLE * 3 + 5).name).toMatch(/ [IVXLCDM]+$/);
    expect(bossName(BOSS_NAME_CYCLE + 1)).toBe('Mother Mossbelly II');
    expect(bossName(BOSS_NAME_CYCLE * 4000 + 1)).toBe('Mother Mossbelly 4001'); // plain digits past 3999
    for (const i of [1, 77, 4242]) expect(bossName(i)).toBe(bossFor(i).name);
  });

  it('uses generated names in all three styles', () => {
    const names = Array.from({ length: 300 }, (_, k) => bossFor(k + 1).name);
    expect(names.some((n) => / the [A-Z]/.test(n))).toBe(true); // "Grimjaw the Unending"
    expect(names.some((n) => /^(Mother|Old|Granny|Uncle|Big|Little|Captain|Mayor|Brother|Madame) /.test(n))).toBe(true);
    expect(names.some((n) => /^(Sir|Lady|Baron|Duchess|King|Queen|Count|Prince|Archduke|Empress) .+ [IVX]+$/.test(n))).toBe(true); // "Sir Rattlebones IV"
    for (const n of names) expect(n).toMatch(/^[A-Z][A-Za-z' -]+$/);
  });

  it('assigns milestone ranks: Warlord every 10th, Calamity 50th, Worldbreaker 100th, Unmaker 1000th', () => {
    expect(bossRank(1)).toBe('boss');
    expect(bossRank(10)).toBe('warlord');
    expect(bossRank(40)).toBe('warlord');
    expect(bossRank(50)).toBe('calamity');
    expect(bossRank(150)).toBe('calamity');
    expect(bossRank(100)).toBe('worldbreaker');
    expect(bossRank(1000)).toBe('unmaker');
    expect(bossFor(30).title).toMatch(/^Warlord of /);
    expect(bossFor(250).title).toMatch(/^Calamity of /);
    expect(bossFor(300).title).toMatch(/^Worldbreaker of /);
    expect(bossFor(7000).title).toMatch(/^Unmaker of /);
    expect(bossFor(31).title).toMatch(/^[A-Z][a-z]+ of the /);
  });

  it('uses real monster archetypes and valid hues', () => {
    for (let i = 1; i <= 3000; i++) {
      const b = bossFor(i);
      expect(MONSTER_BY_ID[b.archetype]).toBeDefined();
      expect(b.hue).toBeGreaterThanOrEqual(0);
      expect(b.hue).toBeLessThan(360);
    }
  });

  it('HP depends on the index only and grows along the ladder', () => {
    let prev = 0;
    for (let i = 1; i <= 2000; i++) {
      if (!isRegular(i)) continue;
      const hp = bossFor(i).maxHp;
      expect(Number.isInteger(hp)).toBe(true);
      expect(hp).toBeGreaterThan(prev);
      prev = hp;
    }
    // once the level curve flattens, milestones out-muscle the next regular boss
    for (const i of [20, 30, 50, 100, 1000]) expect(bossFor(i).maxHp).toBeGreaterThan(bossFor(i + 1).maxHp);
  });

  it('stays finite and sane for huge or broken indices', () => {
    for (const i of [1e6, 1e9, 1e15, Number.MAX_SAFE_INTEGER, 1e300, Infinity, NaN, -5, 0, 2.7]) {
      const b = bossFor(i);
      expect(Number.isFinite(b.maxHp)).toBe(true);
      expect(b.maxHp).toBeGreaterThan(0);
      expect(Number.isSafeInteger(b.index)).toBe(true);
      expect(b.index).toBeGreaterThanOrEqual(1);
      expect(b.name).not.toMatch(/NaN|Infinity|undefined|e\+/);
      expect(b.title).not.toMatch(/NaN|Infinity|undefined/);
      const r = bossReward(i, 1e6);
      expect(Number.isFinite(r.gold)).toBe(true);
    }
    expect(bossFor(1e6).maxHp).toBeLessThan(1e9);
    expect(bossFor(-5).index).toBe(1);
  });

  it('names and titles stay readable at index 1e6 and beyond', () => {
    for (const i of [1e6, 1e6 + 1, 1e9 + 7, Number.MAX_SAFE_INTEGER]) {
      const b = bossFor(i);
      expect(b.name, `${i}`).toMatch(/^[A-Z][A-Za-z' -]+( [IVXLCDM]+| \d+)?$/);
      expect(b.title, `${i}`).toMatch(/^[A-Z][A-Za-z]+ of the [A-Z][A-Za-z ]+$/);
      expect(b.name.length + b.title.length, `${i}`).toBeLessThan(100);
    }
  });
});

describe('damageForTask', () => {
  const hit = (o: Partial<{ difficulty: Difficulty; power: number; level: number; bossPct: number; crit: boolean }> = {}) =>
    damageForTask({ difficulty: 2, power: expectedPower(o.level ?? 10), level: 10, bossPct: 0, crit: false, ...o });

  it('gear factor: 0.5x bare, 1x level-appropriate, under 2x for great gear', () => {
    expect(gearFactor(0, 1)).toBeCloseTo(0.5);
    for (const l of [1, 10, 100, 1e4, 1e6]) expect(gearFactor(expectedPower(l), l)).toBeCloseTo(1, 6);
    expect(gearFactor(expectedPower(50) * 3, 50)).toBeGreaterThan(1.5);
    expect(gearFactor(expectedPower(50) * 3, 50)).toBeLessThan(2);
    expect(gearFactor(1e300, 1)).toBeLessThanOrEqual(2);
    // the same Power is worth less as the hero outlevels it
    expect(gearFactor(100, 10)).toBeGreaterThan(gearFactor(100, 40));
  });

  it('scales with difficulty, boss% and crits', () => {
    const dmg = [0, 1, 2, 3, 4].map((d) => hit({ difficulty: d as Difficulty }));
    for (let d = 1; d < 5; d++) expect(dmg[d]).toBeGreaterThan(dmg[d - 1]);
    expect(hit({ crit: true })).toBeCloseTo(hit() * 2, -1);
    expect(hit({ bossPct: 100 })).toBeCloseTo(hit() * 2, -1);
    expect(hit({ level: 200 })).toBeGreaterThan(hit({ level: 20 }));
  });

  it('a level-appropriate kit hits for exactly the base formula', () => {
    for (const level of [1, 7, 60, 999]) {
      for (const d of [1, 2, 4] as Difficulty[]) {
        const want = Math.round((10 + 3 * level) * [0.5, 1, 1.6, 2.5, 4][d]);
        expect(damageForTask({ difficulty: d, power: expectedPower(level), level, bossPct: 0, crit: false }), `${level}/${d}`).toBe(want);
      }
    }
  });

  it('never drops when power, level or boss% go up', () => {
    let prev = 0;
    for (let power = 0; power <= 5000; power += 37) {
      const d = damageForTask({ difficulty: 2, power, level: 40, bossPct: 0, crit: false });
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    prev = 0;
    for (let level = 1; level <= 2000; level += 13) {
      const d = damageForTask({ difficulty: 2, power: expectedPower(level), level, bossPct: 25, crit: false });
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    // fractional inputs from buffs/soft caps are fine
    expect(damageForTask({ difficulty: 2, power: 12.5, level: 3.9, bossPct: 10.3, crit: false })).toBe(
      damageForTask({ difficulty: 2, power: 12.5, level: 3, bossPct: 10.3, crit: false }),
    );
  });

  it('is always >= 1 and finite', () => {
    expect(damageForTask({ difficulty: 0, power: 0, level: 1, bossPct: 0, crit: false })).toBeGreaterThanOrEqual(1);
    for (const v of [NaN, -1, Infinity, 1e300]) {
      const d = damageForTask({ difficulty: v as Difficulty, power: v, level: v, bossPct: v, crit: true });
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('boss design targets', () => {
  it('level model matches the real XP curve', () => {
    let total = 0;
    for (let l = 1; l < 400; l++) {
      if (l > 1 && l % 20 === 0) expect(tasksToLevel(l) / total).toBeCloseTo(1, 1);
      total += xpToNext(l) / taskXp(l, 2);
    }
    for (const n of [0, 10, 1e3, 1e6, 1e12]) expect(tasksToLevel(levelAfterTasks(n))).toBeCloseTo(n, 0);
    expect(Number.isFinite(bossLevel(1e15))).toBe(true);
  });

  it('boss 1 takes ~10-14 Normal tasks with any starter kit at levels 1-3', () => {
    for (const classId of CLASSES) {
      const kit: Record<string, Item> = Object.fromEntries(starterItems(classId, 0).map((i) => [i.id, i]));
      const equipped = Object.fromEntries(Object.values(kit).map((i) => [i.slot, i.id]));
      const stats = computeStats({ equipped, appearance, classId } as Pick<Hero, 'equipped' | 'appearance' | 'classId'>, kit);
      const { tasks, levels } = simulate(1, () => stats.power, stats.boss);
      expect(tasks[1], classId).toBeGreaterThanOrEqual(10);
      expect(tasks[1], classId).toBeLessThanOrEqual(14);
      expect(levels[1], classId).toBeLessThanOrEqual(3);
    }
  });

  it('bosses 20-100 take ~25-40 Normal tasks with level-appropriate gear, and none ever needs more than 45', () => {
    const fromStart = simulate(1100, (level) => expectedPower(level));
    const lateGear = simulate(1100, (level, boss) => (boss < 5 ? 13 : expectedPower(level)));
    for (const { tasks } of [fromStart, lateGear]) {
      for (let i = 20; i <= 100; i++) {
        if (isRegular(i)) {
          expect(tasks[i], `boss ${i}`).toBeGreaterThanOrEqual(25);
          expect(tasks[i], `boss ${i}`).toBeLessThanOrEqual(40);
        }
      }
      for (let i = 1; i < tasks.length; i++) expect(tasks[i], `boss ${i}`).toBeLessThanOrEqual(45);
      expect(tasks[1000]).toBeGreaterThan(tasks[999]); // the Unmaker is the toughest of its stretch
    }
  });

  it('far down the ladder a level-appropriate hero still needs ~25-45 tasks', () => {
    for (const i of [5000, 1e5, 1e6]) {
      const b = bossFor(i);
      const level = Math.round(bossLevel(i));
      const perTask = damageForTask({ difficulty: 2, power: expectedPower(level), level, bossPct: 0, crit: false });
      const tasks = b.maxHp / perTask;
      expect(tasks, `boss ${i}`).toBeGreaterThan(25);
      expect(tasks, `boss ${i}`).toBeLessThanOrEqual(45);
    }
  });
});

describe('bossReward + bossProgress', () => {
  it('chests: Epic, Legendary every 5th, Mythic every 25th, Divine every 100th', () => {
    expect(bossReward(1, 1).chestMinRarity).toBe(3);
    expect(bossReward(5, 1).chestMinRarity).toBe(4);
    expect(bossReward(25, 1).chestMinRarity).toBe(5);
    expect(bossReward(75, 1).chestMinRarity).toBe(5);
    expect(bossReward(100, 1).chestMinRarity).toBe(6);
    expect(bossReward(1000, 1).chestMinRarity).toBe(6);
  });

  it('gold grows with level and rank', () => {
    expect(bossReward(1, 20).gold).toBeGreaterThan(bossReward(1, 1).gold);
    expect(bossReward(10, 5).gold).toBeGreaterThan(bossReward(11, 5).gold);
    expect(bossReward(100, 5).gold).toBeGreaterThan(bossReward(50, 5).gold);
    expect(bossReward(1, 1).gold).toBeGreaterThan(0);
  });

  it('progress reads bossIndex and sums per-device damage, clamped to HP', () => {
    const p = bossProgress({ bossIndex: 3, bossDamage: { a: 40, b: 60 } });
    expect(p.boss.index).toBe(3);
    expect(p.dealt).toBe(100);
    expect(p.hp).toBe(p.boss.maxHp - 100);
    const over = bossProgress({ bossIndex: 1, bossDamage: { a: 1e9 } });
    expect(over.hp).toBe(0);
    expect(over.dealt).toBe(over.boss.maxHp);
    expect(bossProgress({ bossIndex: 2, bossDamage: {} }).dealt).toBe(0);
  });

  it('progress survives corrupt saves', () => {
    for (const bossDamage of [{ a: NaN }, { a: -50 }, { a: 5, b: 'x' as unknown as number }, undefined as unknown as Record<string, number>]) {
      const p = bossProgress({ bossIndex: NaN, bossDamage });
      expect(p.boss.index).toBe(1);
      expect(p.dealt).toBe(0);
      expect(p.hp).toBe(p.boss.maxHp);
    }
  });
});
