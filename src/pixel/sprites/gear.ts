// 16x16 gear icons. Fill-only art; outlines are added automatically.
// Weapons are drawn diagonally with the grip in the bottom-left so they can sit in the hero's hand.
import { Pix, shade, type Color } from '../pix';

export interface MaterialPalette {
  main: string; // blade / plate color
  light: string;
  dark: string;
  trim: string; // guard / rivets
  gem: string;
}

export const WEAPON_ART: Record<string, string[]> = {
  sword: [
    '................',
    '..............ww',
    '.............wwB',
    '............wwB.',
    '...........wwB..',
    '..........wwB...',
    '.........wwB....',
    '........wwB.....',
    '..g....wwB......',
    '...g..wwB.......',
    '....gjwB........',
    '....hgg.........',
    '...hh..g........',
    '..hh............',
    '.pp.............',
    '................',
  ],
  dagger: [
    '................',
    '................',
    '................',
    '................',
    '..........ww....',
    '.........wwB....',
    '........wwB.....',
    '.......wwB......',
    '...g..wwB.......',
    '....gjwB........',
    '....hgg.........',
    '...hh..g........',
    '..pp............',
    '................',
    '................',
    '................',
  ],
  staff: [
    '............jj..',
    '...........jJJj.',
    '..........gjJJj.',
    '..........ggjj..',
    '.........hg.....',
    '........hh......',
    '.......hh.......',
    '......hh........',
    '.....hh.........',
    '....hh..........',
    '...hh...........',
    '..hh............',
    '.hh.............',
    'hh..............',
    '................',
    '................',
  ],
  bow: [
    '................',
    '............h...',
    '...........s.h..',
    '..........s..hh.',
    '.........s...hh.',
    '........s....hh.',
    '.......s.....hh.',
    '......s......h..',
    '.....s.......h..',
    '....s.......g...',
    '...s.......g....',
    '..s.......g.....',
    '.h.......g......',
    '..hhhhhhh.......',
    '...hhhh.........',
    '................',
  ],
  mace: [
    '..........w.w...',
    '.........wwwww..',
    '..........wwwBw.',
    '.........wwwBB..',
    '..........wBwB..',
    '.........h......',
    '........h.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '.pp.............',
    '................',
    '................',
  ],
  spear: [
    '..............w.',
    '.............wwB',
    '............wwB.',
    '...........gwB..',
    '..........hgg...',
    '.........h......',
    '........h.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '.h..............',
    'h...............',
    '................',
  ],
  hammer: [
    '.........ww.....',
    '........wwwB....',
    '.......wwwwwB...',
    '........wwwwwB..',
    '.........hwwB...',
    '........h..B....',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '.pp.............',
    '................',
    '................',
    '................',
  ],
  wand: [
    '................',
    '................',
    '................',
    '..........j.....',
    '.........jJj....',
    '..........jg....',
    '.........hg.....',
    '........h.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....p...........',
    '................',
    '................',
    '................',
    '................',
  ],
};

/** Bow as held by the hero: upright, string on the body side. */
export const HELD_BOW = [
  '..hh....',
  '..shh...',
  '..s.h...',
  '..s..h..',
  '..s..h..',
  '..s...h.',
  '..s...h.',
  '..s...g.',
  '..s...g.',
  '..s...h.',
  '..s...h.',
  '..s..h..',
  '..s..h..',
  '..s.h...',
  '..shh...',
  '..hh....',
];

export function heldBowPix(mat: MaterialPalette, handle = '#7a4a2a'): Pix {
  const p = new Pix(8, 16).art(HELD_BOW, { h: handle, g: mat.trim }).outline();
  return p.art(HELD_BOW, { s: '#f4f4f4' });
}

export const SHIELD_ART: Record<string, string[]> = {
  shield: [
    'tttttttt',
    'twwwwwBt',
    'twwjjwBt',
    'twjjjjBt',
    'twwjjwBt',
    '.twwwBt.',
    '.twwBBt.',
    '..twBt..',
    '...tt...',
  ],
  buckler: [
    '.tttt.',
    'twwwBt',
    'twjjBt',
    'twjjBt',
    'twwBBt',
    '.tttt.',
  ],
  tome: [
    'tttttt',
    'twwwwt',
    'twjjwt',
    'twwwwt',
    'twwwwt',
    'tttttt',
  ],
  orb: [
    '.jjj.',
    'jJJjj',
    'jJjjj',
    'jjjjj',
    '.jjj.',
    '.ggg.',
  ],
};

/** Where the hero's hand grips each weapon (icon coordinates). */
export const WEAPON_GRIP: Record<string, [number, number]> = {
  sword: [3, 12],
  axe: [4, 11],
  dagger: [4, 11],
  staff: [4, 10],
  bow: [4, 10],
  mace: [4, 10],
  spear: [4, 11],
  hammer: [4, 10],
  wand: [5, 9],
};

export const WEAPON_KINDS = ['sword', 'axe', 'dagger', 'staff', 'bow', 'mace', 'spear', 'hammer', 'wand'] as const;

export function weaponPix(kind: string, mat: MaterialPalette, handle = '#7a4a2a'): Pix {
  const p = new Pix(16, 16);
  if (kind === 'axe') {
    for (let t = 0; t <= 11; t++) p.set(1 + t, 14 - t, handle);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.abs(x - 8) + Math.abs(y - 4);
        if (d <= 3 && x + y < 15) p.set(x, y, x + y <= 9 ? mat.light : x + y >= 13 ? mat.dark : mat.main);
      }
    p.set(12, 3, mat.trim).set(13, 2, mat.trim);
    return p.outline();
  }
  const art = WEAPON_ART[kind] ?? WEAPON_ART.sword;
  const map: Record<string, Color> = {
    w: mat.main,
    B: mat.dark,
    g: mat.trim,
    j: mat.gem,
    J: shade(mat.gem, 0.45),
    h: handle,
    p: mat.trim,
  };
  // bows are mirrored so the hand holds the limb and the bow sits beside the body
  const flip = kind === 'bow';
  p.art(art, map, 0, 0, flip).outline();
  // strings are drawn after outlining so they stay 1px thin
  p.art(art, { s: '#f4f4f4' }, 0, 0, flip);
  return p;
}

export function shieldPix(kind: string, mat: MaterialPalette): Pix {
  const art = SHIELD_ART[kind] ?? SHIELD_ART.shield;
  const w = art[0].length;
  const p = new Pix(w + 2, art.length + 2);
  p.art(art, { w: mat.main, B: mat.dark, t: mat.trim, j: mat.gem, J: shade(mat.gem, 0.45), g: mat.trim }, 1, 1);
  return p.outline();
}

export const MATERIALS: Record<string, MaterialPalette> = {
  wood: { main: '#b07a45', light: '#d39a5c', dark: '#7a4f2a', trim: '#8a8a8a', gem: '#5fcde4' },
  iron: { main: '#b8c0c8', light: '#e8eef2', dark: '#6e7a86', trim: '#8a6a3a', gem: '#d95763' },
  steel: { main: '#d6e2ea', light: '#ffffff', dark: '#7d93a8', trim: '#c8a040', gem: '#5b6ee1' },
  gold: { main: '#f2c94c', light: '#fff2a8', dark: '#b8862b', trim: '#d95763', gem: '#5fcde4' },
  elven: { main: '#9fe0c8', light: '#e0fff4', dark: '#4a9a8a', trim: '#e8d070', gem: '#99e550' },
  ebony: { main: '#4a3a5a', light: '#7a6a8a', dark: '#2a1e36', trim: '#c8a040', gem: '#d95763' },
  glass: { main: '#9ef0a0', light: '#e8ffe0', dark: '#4aa86a', trim: '#e8e8e8', gem: '#5fcde4' },
  infernal: { main: '#c0392b', light: '#ff8a5c', dark: '#6a1a1a', trim: '#2a1a1a', gem: '#ffcc33' },
};
