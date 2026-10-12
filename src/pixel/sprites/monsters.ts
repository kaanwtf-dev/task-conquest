// Monster archetypes (20x20 fill art, facing left toward the hero). Variants come from palette swaps.
import { Pix, hueRotate, shade, type Color } from '../pix';

export interface MonsterArt {
  id: string;
  name: string;
  art: string[];
  pal: Record<string, string>;
}

const E = '#1a1022';

export const MONSTERS: MonsterArt[] = [
  {
    id: 'slime',
    name: 'Slime',
    pal: { a: '#5ac85a', h: '#b8f0a8', e: E, w: '#ffffff', d: '#2a6a3a' },
    art: [
      '....................',
      '....................',
      '....................',
      '....................',
      '........aaaa........',
      '......aahhaaaa......',
      '.....ahhaaaaaaa.....',
      '....aahaaaaaaaaa....',
      '....aaaaaaaaaaaa....',
      '...aaweaaaweaaaaa...',
      '...aaeeaaaeeaaaaa...',
      '..aaaaaaaaaaaaaaaa..',
      '..aaaaadddaaaaaaaa..',
      '..aaaaaaaaaaaaaaaa..',
      '...aaaaaaaaaaaaaa...',
      '....aaaaaaaaaaaa....',
    ],
  },
  {
    id: 'goblin',
    name: 'Goblin',
    pal: { a: '#7ab040', e: '#ffd23a', w: '#f4ecd0', d: E, c: '#8a5a34', k: '#6a6a6a' },
    art: [
      '....................',
      '....................',
      '........aaaa........',
      '.a.....aaaaaa.....a.',
      '.aa...aaaaaaaa...aa.',
      '..aaaaaeaaaeaaaaaa..',
      '...aaaadaaadaaaaa...',
      '.....aaaaaaaaaa.....',
      '.....aawdwdwaaa.....',
      '......aaaaaaaa......',
      '....cccccccccccc....',
      '...acccccccccccca...',
      '..aa.cccccccccc.ak..',
      '..a..cccccccccc..kk.',
      '......cc....cc...kk.',
      '......aa....aa......',
      '.....aaa....aaa.....',
    ],
  },
  {
    id: 'wolf',
    name: 'Wolf',
    pal: { a: '#8a8a9a', c: '#d8d8e0', e: '#ffd23a', w: '#ffffff', d: E },
    art: [
      '....................',
      '....................',
      '....................',
      '....................',
      '..a.a...............',
      '..aaaa..............',
      '.aaeaaa.............',
      'aaaaaaaaaaaaaaaa..a.',
      'dwaaaaaaaaaaaaaaaaa.',
      '.aacccaaaaaaaaaaa...',
      '..accccaaaaaaaaaa...',
      '...aacccaaaaaaaa....',
      '....aa.a.....aa.a...',
      '....aa.a.....aa.a...',
      '...aa.aa....aa.aa...',
    ],
  },
  {
    id: 'bat',
    name: 'Bat',
    pal: { a: '#6a4a8a', c: '#9a7ab8', e: '#ff4a4a', w: '#ffffff', d: E },
    art: [
      '....................',
      '....................',
      '....................',
      '....................',
      '..a..............a..',
      '.aa....a....a....aa.',
      'aaaa...aaaaaa...aaaa',
      'acaaa.aaeaaeaa.aaaca',
      'accaaaaaaaaaaaaaacca',
      'a.caaaaawaawaaaaac.a',
      '...a.aaaaaaaaaa.a...',
      '......aaaaaaaa......',
      '.......a....a.......',
    ],
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    pal: { w: '#f0eadc', d: '#3a3044', e: '#ff5a3a', k: '#9a9aa8' },
    art: [
      '....................',
      '......wwwwww........',
      '.....wwwwwwww.......',
      '.....wddwwddw.......',
      '.....wedwwedw.......',
      '.....wwwwwwww.......',
      '......wdwdww........',
      '.......wwww.........',
      '....wwwwwwwwww......',
      '...w..wdwdwd..w.k...',
      '...w..wwwwww..w.k...',
      '..ww..wdwdwd..wwk...',
      '......wwwwww....k...',
      '.......w..w.........',
      '.......w..w.........',
      '......ww..ww........',
    ],
  },
  {
    id: 'mushroom',
    name: 'Shroom',
    pal: { c: '#d84a4a', w: '#ffffff', a: '#f0dcc0', e: E, d: '#8a4a3a' },
    art: [
      '....................',
      '....................',
      '.......cccccc.......',
      '.....cccwwcccc......',
      '....ccwwccccwwcc....',
      '...cccccccccccccc...',
      '..cccwwcccccwwcccc..',
      '..cccccccccccccccc..',
      '....aaaaaaaaaaaa....',
      '.....aaeaaaeaaa.....',
      '.....aaeaaaeaaa.....',
      '.....aaaaddaaaa.....',
      '.....aaaaaaaaaa.....',
      '....aaaaaaaaaaaa....',
    ],
  },
  {
    id: 'crab',
    name: 'Crab',
    pal: { a: '#e0603a', c: '#f08a5a', e: E, w: '#ffffff' },
    art: [
      '....................',
      '....................',
      '....................',
      '..cc..........cc....',
      '.cccc........cccc...',
      '.cc.c..w..w..c.cc...',
      '..cc...e..e...cc....',
      '...a.aaaaaaaa.a.....',
      '....aaaaaaaaaaa.....',
      '...aaaaacaaaaaaa....',
      '..aaaaaaaaaaaaaaa...',
      '...aaaaaaaaaaaaa....',
      '..a.a.a.....a.a.a...',
      '.a..a..a...a..a..a..',
    ],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    pal: { a: '#d8e8ff', h: '#ffffff', e: E, d: '#8aa0d0' },
    art: [
      '....................',
      '....................',
      '.......aaaaa........',
      '.....aaahhaaaa......',
      '....aahhaaaaaaa.....',
      '....aaeeaaeeaaa.....',
      '...aaaeeaaeeaaaa....',
      '...aaaaaaaaaaaaa....',
      '...aaaaaddaaaaaaa...',
      '...aaaaaddaaaaaaaa..',
      '...aaaaaaaaaaaaaaaa.',
      '...aaaaaaaaaaaaaa...',
      '...aaaaaaaaaaaaa....',
      '...aa.aaa.aaa.aa....',
      '...a...a...a...a....',
    ],
  },
  {
    id: 'rat',
    name: 'Rat',
    pal: { a: '#8a7a6a', c: '#e8a0a0', e: E, w: '#ffffff' },
    art: [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '...cc...............',
      '..cacaaaaa..........',
      '.aeaaaaaaaaa........',
      'caaaaaaaaaaaa.......',
      '.waaaaaaaaaaaaaaaa..',
      '..aaaaaaaaaaaa...aa.',
      '...a.a....a.a.....a.',
    ],
  },
];

export const MONSTER_BY_ID: Record<string, MonsterArt> = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

/** Build a monster sprite, optionally palette-swapped by `hue` degrees (variants / tiers). */
export function monsterPix(id: string, hue = 0, flash = false): Pix {
  const m = MONSTER_BY_ID[id] ?? MONSTERS[0];
  const map: Record<string, Color> = {};
  for (const [k, v] of Object.entries(m.pal)) {
    const keep = v === E || v === '#ffffff' || k === 'e' || k === 'w';
    map[k] = flash ? '#ffffff' : keep || hue === 0 ? v : hueRotate(v, hue);
  }
  const p = new Pix(20, 20).art(m.art, map, 0, 20 - m.art.length);
  if (!flash) p.autoShade(-0.2);
  return p.outline(flash ? '#ffffff' : '#1a1022');
}

export function monsterTint(hex: string, hue: number) {
  return hue ? hueRotate(hex, hue) : shade(hex, 0);
}
