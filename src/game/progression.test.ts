import { describe, expect, it } from 'vitest';
import { levelFromXp, levelTitle, roman, skillLevel, taskXp, xpToNext } from './progression';

describe('progression', () => {
  it('levels never cap and stay monotonic', () => {
    let prev = 0;
    for (const l of [1, 2, 10, 100, 1000, 10000]) {
      const need = xpToNext(l);
      expect(Number.isFinite(need)).toBe(true);
      expect(need).toBeGreaterThan(prev);
      prev = need;
    }
  });

  it('levelFromXp inverts the curve', () => {
    let total = 0;
    for (let l = 1; l < 60; l++) {
      expect(levelFromXp(total).level).toBe(l);
      expect(levelFromXp(total + xpToNext(l) - 1).level).toBe(l);
      total += xpToNext(l);
    }
  });

  it('pacing: a few normal tasks for level 2, slowly growing after', () => {
    const tasksFor = (l: number) => xpToNext(l) / taskXp(l, 2);
    expect(tasksFor(1)).toBeGreaterThan(3);
    expect(tasksFor(1)).toBeLessThan(8);
    expect(tasksFor(50)).toBeGreaterThan(tasksFor(10));
    expect(tasksFor(100)).toBeLessThan(40);
  });

  it('skills level by use forever', () => {
    expect(skillLevel(0).level).toBe(1);
    expect(skillLevel(1e9).level).toBeGreaterThan(100);
  });

  it('titles continue past the table', () => {
    expect(levelTitle(1)).toBe('Novice');
    expect(levelTitle(10000)).toMatch(/^Eternal [MDCLXVI]+$/);
    expect(roman(1994)).toBe('MCMXCIV');
  });
});
