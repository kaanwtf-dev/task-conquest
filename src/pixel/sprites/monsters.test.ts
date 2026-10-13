import { describe, expect, it } from 'vitest';
import { THEMES } from '../themes';
import { MONSTERS, MONSTER_BY_ID, monsterPix } from './monsters';

const EXPANSION = ['spider', 'eye', 'golem', 'imp', 'snake', 'scorpion', 'frog', 'wisp', 'mimic', 'yeti', 'dragon', 'beetle'];

describe('monster archetypes', () => {
  it('uses 20-wide fill art that fits the frame and only palette keys', () => {
    for (const m of MONSTERS) {
      expect(m.art.length, m.id).toBeLessThanOrEqual(20);
      for (const row of m.art) {
        expect(row.length, `${m.id}: ${row}`).toBe(20);
        for (const ch of row) if (ch !== '.') expect(m.pal[ch], `${m.id} uses '${ch}'`).toBeDefined();
      }
    }
  });

  it('has unique ids and includes the expansion set', () => {
    expect(new Set(MONSTERS.map((m) => m.id)).size).toBe(MONSTERS.length);
    for (const id of EXPANSION) expect(MONSTER_BY_ID[id], id).toBeDefined();
  });

  it('keeps a 1px margin around expansion art so outlines are never clipped', () => {
    for (const id of EXPANSION) {
      const art = MONSTER_BY_ID[id].art;
      for (const row of art) expect(row[0] + row[19], id).toBe('..');
      if (art.length === 20) expect(art[0].replace(/\./g, ''), id).toBe('');
    }
  });

  it('renders every archetype for any hue, including hit flashes', () => {
    for (const m of MONSTERS)
      for (const hue of [0, 137, 359, 1e6]) {
        const p = monsterPix(m.id, hue);
        expect([p.w, p.h]).toEqual([20, 20]);
        expect(p.bounds().w, m.id).toBeGreaterThan(8);
        const flash = monsterPix(m.id, hue, true);
        for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (flash.get(x, y)) expect(flash.get(x, y)).toBe('#ffffff');
      }
  });

  it('treats non-finite hues as the base palette instead of emitting broken colors', () => {
    const dump = (id: string, hue: number) => {
      const p = monsterPix(id, hue);
      return Array.from({ length: 400 }, (_, i) => p.get(i % 20, (i / 20) | 0)).join(',');
    };
    for (const m of MONSTERS)
      for (const hue of [NaN, Infinity, -Infinity]) {
        expect(dump(m.id, hue), `${m.id} ${hue}`).toBe(dump(m.id, 0));
      }
  });

  it('never resolves Object.prototype names as archetypes', () => {
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(MONSTER_BY_ID[k], k).toBeUndefined();
      expect(monsterPix(k).bounds(), k).toEqual(monsterPix(MONSTERS[0].id).bounds());
    }
  });
});

describe('theme monster pools', () => {
  it('gives every theme 5-8 distinct, existing archetypes', () => {
    for (const t of THEMES) {
      expect(t.monsters.length, t.id).toBeGreaterThanOrEqual(5);
      expect(t.monsters.length, t.id).toBeLessThanOrEqual(8);
      expect(new Set(t.monsters).size, t.id).toBe(t.monsters.length);
      for (const id of t.monsters) expect(MONSTER_BY_ID[id], `${t.id}: ${id}`).toBeDefined();
    }
  });

  it('matches the designed zone pools', () => {
    const want: Record<string, string[]> = {
      tavern: ['rat', 'goblin', 'slime', 'bat', 'mimic'],
      forest: ['wolf', 'mushroom', 'goblin', 'slime', 'spider', 'frog', 'wisp'],
      beach: ['crab', 'slime', 'snake', 'bat', 'frog'],
      dungeon: ['skeleton', 'bat', 'rat', 'ghost', 'slime', 'eye', 'mimic', 'spider'],
      snow: ['wolf', 'ghost', 'slime', 'yeti', 'wisp', 'golem'],
      desert: ['scorpion', 'snake', 'skeleton', 'beetle', 'golem'],
      castle: ['skeleton', 'ghost', 'bat', 'goblin', 'eye', 'imp'],
      volcano: ['imp', 'golem', 'beetle', 'dragon', 'slime', 'wisp'],
    };
    expect(THEMES.map((t) => t.id).sort()).toEqual(Object.keys(want).sort());
    for (const t of THEMES) expect([...t.monsters].sort(), t.id).toEqual([...want[t.id]].sort());
  });

  it('puts every expansion archetype in at least one zone', () => {
    const used = new Set(THEMES.flatMap((t) => t.monsters));
    for (const id of EXPANSION) expect(used.has(id), id).toBe(true);
  });
});
