import { describe, expect, it } from 'vitest';
import type { Buff, HeroStats, PotionId } from '../core/types';
import {
  POTIONS,
  POTION_IDS,
  buffBonus,
  describePotion,
  makeBuff,
  potionName,
  potionPrice,
  potionStackId,
  potionTier,
  potionTierFor,
  potionValue,
  tickBuffs,
} from './potions';
import { applyBuffs } from './stats';

const base: HeroStats = { power: 10, xp: 10, gold: 0, find: 15, crit: 5, boss: 0, luck: 0, skill: 0, potion: 0 };

describe('potions', () => {
  it('tiers advance every 10 levels forever', () => {
    expect(potionTier(1)).toBe(1);
    expect(potionTier(10)).toBe(1);
    expect(potionTier(11)).toBe(2);
    expect(potionTier(100)).toBe(10);
    expect(potionTier(1e6)).toBe(100000);
    expect(potionTier(0)).toBe(1);
    expect(potionTier(NaN)).toBe(1);
    expect(potionTierFor('phoenix', 500)).toBe(1);
    expect(potionTierFor('fury', 500)).toBe(50);
  });

  it('names use roman numerals; phoenix feathers have no "Potion of"', () => {
    expect(potionName('insight', 3)).toBe('Potion of Insight III');
    expect(potionName('giant', 1)).toBe('Potion of Giant Strength I');
    expect(potionName('phoenix', 4)).toBe('Phoenix Feather');
    expect(potionName('fortune', 1e5)).toBe('Potion of Fortune 100000');
    for (const p of POTION_IDS) {
      expect(potionName(p, 7)).not.toMatch(/undefined|NaN/);
      expect(POTIONS[p].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(describePotion(p, 2, 50).length).toBeGreaterThan(0);
    }
    expect(potionStackId('phoenix', 9)).toBe('phoenix:1');
    expect(potionStackId('luck', 3)).toBe('luck:3');
  });

  it('makeBuff scales value by tier and duration by the potion stat', () => {
    const b = makeBuff('insight', 3, 50, 'b1');
    expect(b).toEqual({ id: 'b1', potion: 'insight', tier: 3, value: potionValue('insight', 3), remaining: Math.round(POTIONS.insight.baseTasks * 1.5) });
    // diminishing returns: always rising with tier, never past 4x the tier-1 value
    let prev = 0;
    for (const t of [1, 2, 3, 5, 10, 50, 1e4]) {
      const v = potionValue('insight', t);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(POTIONS.insight.baseValue * 4);
      prev = v;
    }
    expect(potionValue('insight', 1)).toBe(POTIONS.insight.baseValue);
    expect(makeBuff('fury', 1, 0, 'x').remaining).toBe(POTIONS.fury.baseTasks);
    expect(makeBuff('phoenix', 1, 100, 'p').remaining).toBe(0);
    const big = makeBuff('fortune', 1e5, 1e6, 'big');
    expect(Number.isFinite(big.value)).toBe(true);
    expect(Number.isFinite(big.remaining)).toBe(true);
  });

  it('tickBuffs counts down and drops expired buffs', () => {
    const buffs: Buff[] = [makeBuff('insight', 1, 0, 'a'), { id: 'b', potion: 'fury', tier: 1, value: 10, remaining: 1 }, { id: 'c', potion: 'luck', tier: 1, value: 5, remaining: 0 }];
    const next = tickBuffs(buffs);
    expect(next.map((b) => b.id)).toEqual(['a']);
    expect(next[0].remaining).toBe(buffs[0].remaining - 1);
    expect(buffs[0].remaining).toBe(POTIONS.insight.baseTasks); // input untouched
    let cur = next;
    for (let i = 0; i < 100; i++) cur = tickBuffs(cur);
    expect(cur).toEqual([]);
  });

  it('a buff powers exactly as many tasks as it says', () => {
    for (const p of POTION_IDS) {
      if (p === 'phoenix') continue;
      for (const stat of [0, 37, 230]) {
        const b = makeBuff(p, 2, stat, 'x');
        const s = POTIONS[p].stats[0];
        let buffs: Buff[] = [b];
        let tasks = 0;
        while (buffBonus(buffs, s) > 0) {
          tasks++;
          buffs = tickBuffs(buffs);
        }
        expect(tasks).toBe(b.remaining);
        expect(describePotion(p, 2, stat)).toContain(`for ${b.remaining} tasks`);
      }
    }
  });

  it('shrugs off corrupt buffs and tiers', () => {
    const junk = [
      { id: 'a', potion: 'insight', tier: 1, value: NaN, remaining: 5 },
      { id: 'b', potion: 'nope', tier: 1, value: 50, remaining: 5 },
      { id: 'c', potion: 'fury', tier: 1, value: 10, remaining: NaN },
    ] as unknown as Buff[];
    expect(buffBonus(junk, 'xp')).toBe(0);
    expect(buffBonus(junk, 'crit')).toBe(0);
    expect(tickBuffs(junk).map((b) => b.id)).toEqual(['a', 'b']);
    for (const t of [NaN, -3, 0, Infinity]) {
      expect(potionName('insight', t)).toBe('Potion of Insight I');
      expect(makeBuff('insight', t, NaN, 'z')).toMatchObject({ tier: 1, value: POTIONS.insight.baseValue, remaining: POTIONS.insight.baseTasks });
      expect(potionPrice('insight', t)).toBe(POTIONS.insight.price);
    }
    expect(Number.isFinite(makeBuff('luck', 1, 1e300, 'z').remaining)).toBe(true);
  });

  it('buffBonus sums active buffs per stat', () => {
    const buffs: Buff[] = [
      { id: '1', potion: 'insight', tier: 1, value: 20, remaining: 3 },
      { id: '2', potion: 'insight', tier: 2, value: 25, remaining: 1 },
      { id: '3', potion: 'luck', tier: 1, value: 10, remaining: 2 },
      { id: '4', potion: 'giant', tier: 1, value: 30, remaining: 0 },
    ];
    expect(buffBonus(buffs, 'xp')).toBe(45);
    expect(buffBonus(buffs, 'find')).toBe(10);
    expect(buffBonus(buffs, 'luck')).toBe(10);
    expect(buffBonus(buffs, 'boss')).toBe(0);
    expect(buffBonus([], 'gold')).toBe(0);
  });

  it('applyBuffs adds bonuses and caps crit at 100', () => {
    const s = applyBuffs(base, [makeBuff('insight', 1, 0, 'a'), makeBuff('luck', 1, 0, 'b')]);
    expect(s.xp).toBe(10 + potionValue('insight', 1));
    expect(s.find).toBe(15 + potionValue('luck', 1));
    expect(s.luck).toBe(potionValue('luck', 1));
    expect(s.power).toBe(10);
    const fury = Array.from({ length: 5 }, (_, i) => makeBuff('fury', 1000, 0, `f${i}`));
    expect(applyBuffs(base, fury).crit).toBe(100);
    expect(applyBuffs(base, [])).toEqual(base);
  });

  it('prices rise with tier and stay finite', () => {
    for (const p of POTION_IDS as PotionId[]) {
      let prev = 0;
      for (const t of [1, 2, 5, 10, 100, 1e5]) {
        const price = potionPrice(p, t);
        expect(Number.isFinite(price)).toBe(true);
        expect(price).toBeGreaterThan(prev);
        prev = price;
      }
    }
  });
});
