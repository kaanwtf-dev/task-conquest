// Loot art: 16x16 item / potion / chest icons, 40x40 boss + merchant portraits.
// Fill-only art (outlined automatically); armor icons pull every color from the MaterialPalette so tiers recolor them.
import { BASES, type BaseId, type PotionId, type Slot } from '../../core/types';
import { Pix, hueRotate, shade, spriteUrl, type Color } from '../pix';
import { WEAPON_KINDS, weaponPix, type MaterialPalette } from './gear';
import { heroPix, type Appearance } from './hero';
import { MONSTERS, MONSTER_BY_ID } from './monsters';

const OUTLINE = '#140c1c';
const BONE = '#f0e6c8';
const BONE_DARK = '#c8b890';
const PAPER = '#f4ecd4';
const MONSTER_EYE = '#1a1022'; // monster eye/ink color, also the hero outline

// ------------------------------------------------------------------ gear icons

/**
 * m/l/d main/light/dark · t/u/T trim (+light/dark) · g/G/k gem (+light/dark) · D deep shadow
 * L/M/N/O leather aliases of main/light/dark/darker · W/V bone · P/Q paper (+shadow)
 */
function gearMap(p: MaterialPalette): Record<string, Color> {
  return {
    m: p.main,
    l: p.light,
    d: p.dark,
    D: shade(p.dark, -0.45),
    t: p.trim,
    u: shade(p.trim, 0.35),
    T: shade(p.trim, -0.3),
    g: p.gem,
    G: shade(p.gem, 0.5),
    k: shade(p.gem, -0.35),
    L: p.main,
    M: p.light,
    N: p.dark,
    O: shade(p.dark, -0.25),
    W: BONE,
    V: BONE_DARK,
    P: PAPER,
    Q: shade(PAPER, -0.18),
  };
}

const ICON_ART: Record<string, string[]> = {
  helm: [
    '................',
    '.......gGk......',
    '......gGggk.....',
    '.......kggk.....',
    '....mmmlmmmm....',
    '...mllmlmmmmd...',
    '..mllmmlmmmmmd..',
    '..mlmmmlmmmmmd..',
    '..mlmmmlmmmmmd..',
    '..DDDDDDDDDDDD..',
    '..mlmmmDDmmmmd..',
    '..mlmmmDDmmmmd..',
    '..mlmmmDDmmmmd..',
    '...mmmmmmmmdd...',
    '...tutttttttT...',
  ],
  horned: [
    '................',
    '.W............V.',
    '.WW..........VV.',
    '..W...mmmm...V..',
    '..WW.mllmmd.VV..',
    '...WWmlmmmdVV...',
    '...mlmmmmmmmd...',
    '..tttttggttttT..',
    '..mmDDDmmDDDmd..',
    '..mmDDDmmDDDmd..',
    '..mmDDDDDDDDmd..',
    '..mmDDDDDDDDmd..',
    '..mmd......mdd..',
  ],
  hood: [
    '................',
    '.......mm.......',
    '......mlmm......',
    '.....mllmmd.....',
    '....mllmmmmd....',
    '...mlmmttmmmd...',
    '...mlmtDDtmmd...',
    '..mlmtDDDDtmmd..',
    '..mlmtDDDDtmmd..',
    '..mmmtDDDDtmmd..',
    '..mmmmtDDtmmmd..',
    '.mmmmmmttmmmmdd.',
    '.mlmmmmmmmmmmdd.',
    '..dddddddddddd..',
  ],
  hat: [
    '................',
    '................',
    '...........md...',
    '..........mmd...',
    '.........mlmd...',
    '........mllmd...',
    '.......mllmmd...',
    '......mllmmmmd..',
    '.....mllmmmmmd..',
    '.....mlmmmmmmd..',
    '....ttttggtttT..',
    '.mllmmmmmmmmmmd.',
    '..dddddddddddd..',
  ],
  crown: [
    '................',
    '................',
    '................',
    '................',
    '..g....gg....g..',
    '..m....mm....m..',
    '..mm..mllm..md..',
    '..mlm.mlmm.mmd..',
    '..mlmmmlmmmmmd..',
    '..mlmmmmmmmmmd..',
    '..ttgttggttgtT..',
    '..mlmmmmmmmmmd..',
    '..dddddddddddd..',
  ],
  circlet: [
    '................',
    '................',
    '................',
    '................',
    '.......uu.......',
    '......uGgT......',
    '.m....tggT....d.',
    '.ml...tkkT...md.',
    '..ml..tTTT..md..',
    '..mlg.mmmd.gmd..',
    '...mllmmmmmmd...',
    '....mmmmmmdd....',
    '......dddd......',
  ],
  leather: [
    '................',
    '..NNN......NNO..',
    '.NMMNLL..LLNNNO.',
    '.NMNNLMOOLLNNOO.',
    '.NNNOLMLOLLOOOO.',
    '..LLLMLOLLLLLN..',
    '..LMLLLOLLLLLN..',
    '...MLLLOLLLLN...',
    '...MLLOLOLLLN...',
    '...LLLLOLLLLN...',
    '...ttttuttttT...',
    '...LLLLtLLLLN...',
    '...LMLLLLLLLN...',
    '...NNNNNNNNNN...',
  ],
  chain: [
    '................',
    '...mmm....mmm...',
    '..mlmmmttmmmmd..',
    '.mlmdmdmdmdmdmd.',
    '.mmdmdmdmdmdmdd.',
    '.mdmdmdmdmdmddd.',
    '.mmdmdmdmdmdmdd.',
    '..dmdmdmdmdmdd..',
    '...mdmdmdmdmd...',
    '...dmdmdmdmdd...',
    '...ttttuttttT...',
    '...mdmdmdmdmd...',
    '..mdmdmdmdmdmd..',
    '..dddddddddddd..',
  ],
  plate: [
    '................',
    '..ml..tuuT..md..',
    '.mll.lmmmmd.mmd.',
    '.mlm.lmmmmd.mmd.',
    '.mmd.lmlmmd.mdd.',
    '..d.mlmlmmmd.d..',
    '....mlmggmmd....',
    '....mlmkkmmd....',
    '....mlmmmmmd....',
    '.....lmmmmd.....',
    '....ttttttTT....',
    '....mlmmmmmd....',
    '....dddddddd....',
    '....mlmmmmmd....',
    '....dddddddd....',
  ],
  robe: [
    '................',
    '.....tt..tt.....',
    '....mtt..ttmd...',
    '...mlmttttmmmd..',
    '..mlmmmttmmmmmd.',
    '.mlmmmmttmmmmmd.',
    '.mmd.mmttmmd.dd.',
    '.tt..mmttmmd.TT.',
    '.....uuuuuuT....',
    '.....mmttmmd....',
    '....mlmttmmmd...',
    '....mlmttmmmd...',
    '...mlmmttmmmmd..',
    '...tttttttttTT..',
  ],
  shield: [
    '................',
    '.tttttttttttttT.',
    '.tllllmmmmmmmdT.',
    '.tlllmmmttmmmdT.',
    '.tllmmmmttmmmdT.',
    '.tlmmtttggtttdT.',
    '.tlmmtttkktttdT.',
    '.tmmmmmmttmmddT.',
    '..tmmmmmttmmdT..',
    '..tmmmmmttmmdT..',
    '...tmmmmttmdT...',
    '....tmmmtmdT....',
    '.....tmmmdT.....',
    '......tddT......',
    '.......TT.......',
  ],
  buckler: [
    '................',
    '................',
    '.....tttttt.....',
    '...ttllmmmmTT...',
    '..tllmmmmmmmdT..',
    '..tlmmmmmmmmdT..',
    '.tlmmmmuummmmdT.',
    '.tlmmmuGgummmdT.',
    '.tlmmmugkTmmmdT.',
    '.tmmmmmTTmmmmdT.',
    '..tmmmmmmmmmdT..',
    '..tmmmmmmmmddT..',
    '...TTmddddddT...',
    '.....TTTTTT.....',
  ],
  tome: [
    '................',
    '................',
    '..tmmmmmmmmmt...',
    '.dmllmmmmmmmmP..',
    '.dmlmmmuummmmP..',
    '.dmlmmuGgummmP..',
    '.dmlmmugkummmP..',
    '.dmlmmmuummmmP..',
    '.dmlmmmmmmmmmP..',
    '.dmlmmmmmmmmmP..',
    '.dmmmmmmmmmmmP..',
    '.dmmmmmmmmmmmQ..',
    '.tdddddddddddtQ.',
    '..PPPPPPPPPPPPQ.',
    '...QQQQQQQQQQQ..',
  ],
  orb: [
    '................',
    '.....gggggg.....',
    '....gGGgggggk...',
    '...gGGggggggkk..',
    '...gGgggggggkk..',
    '...ggggggggggk..',
    '...gggggggggkk..',
    '...kgggggggkkk..',
    '....kkggggkkk...',
    '.....tkkkkkT....',
    '....umttttmdT...',
    '...tm.mmmd..dT..',
    '..tm..mmmd...T..',
    '.....mmmmmd.....',
    '....dddddddd....',
  ],
  cape: [
    '................',
    '......uGgT......',
    '.....tttkT......',
    '....kmlmmmdk....',
    '....kmlmdmmk....',
    '...kmlmmdmmdk...',
    '...kmlmmdmmdk...',
    '...kmlmdmmmdk...',
    '..kmlmmdmmmmdk..',
    '..kmlmdmmmdmdk..',
    '..kmlmdmmmdmdk..',
    '.kmlmmdmmmdmmdk.',
    '.kmlmdmmmmdmmdk.',
    '.kmmmdmmmmdmmdk.',
    '..dd..ddd..ddd..',
  ],
  ring: [
    '................',
    '................',
    '......uGgT......',
    '.....tgGggT.....',
    '......tkkT......',
    '.....mlmmmd.....',
    '...mll....mmd...',
    '..ml........md..',
    '..ml........md..',
    '..ml........md..',
    '..mm........dd..',
    '...mm......dd...',
    '....mmmmmmdd....',
    '.....dddddd.....',
  ],
  amulet: [
    '................',
    '..t..........t..',
    '..u..........T..',
    '...t........T...',
    '...u........T...',
    '....t......T....',
    '.....t....T.....',
    '......tuuT......',
    '.....mllmmd.....',
    '....mlGgggmd....',
    '....mlgGggmd....',
    '....mmggkkdd....',
    '.....mkkkkd.....',
    '......mmdd......',
    '.......dd.......',
  ],
  charm: [
    '................',
    '.......uT.......',
    '......u..T......',
    '.......tT.......',
    '.......mm.......',
    '......mllm......',
    '.mmmmmmlmmmmmmd.',
    '..mllmmGgmmmdd..',
    '...mlmmgkmmdd...',
    '....mlmmmmdd....',
    '....mlmmmmmd....',
    '...mlmmddmmmd...',
    '...mlmd..dmmd...',
    '..mld......dmd..',
    '..dd........dd..',
  ],
};

/** 16x16 icon for any item base; weapons reuse the hero's weapon art so icons match what is held. */
export function itemIconPix(opts: { slot: Slot; base: BaseId; palette: MaterialPalette }): Pix {
  const { palette } = opts;
  let base: string = opts.base;
  if ((WEAPON_KINDS as readonly string[]).includes(base)) return weaponPix(base, palette);
  if (!ICON_ART[base]) {
    // unknown/legacy base: fall back to the slot's first base
    const fallback = (BASES[opts.slot] as readonly string[] | undefined)?.[0] ?? 'sword';
    if ((WEAPON_KINDS as readonly string[]).includes(fallback)) return weaponPix(fallback, palette);
    base = fallback;
  }
  return new Pix(16, 16).art(ICON_ART[base], gearMap(palette)).outline(OUTLINE);
}

function paletteKey(p: MaterialPalette): string {
  return `${p.main}${p.light}${p.dark}${p.trim}${p.gem}`;
}

export function itemIconUrl(opts: { slot: Slot; base: BaseId; palette: MaterialPalette }): string {
  return spriteUrl(`item:${opts.slot}:${opts.base}:${paletteKey(opts.palette)}`, () => itemIconPix(opts));
}

// ------------------------------------------------------------------ potions

interface PotionLook {
  liquid: string;
  art: string[];
}

/** q/Q/K liquid (+light/dark) · c/C cork · g glass · w glint · x/X/y extra accent colors per potion */
const POTIONS: Record<PotionId, PotionLook> = {
  insight: {
    liquid: '#4a8ae8',
    art: [
      '................',
      '......cccc......',
      '......CCCC......',
      '.......gw.......',
      '.......gw.......',
      '.....gggwgg.....',
      '...ggwggggggg...',
      '..gwQqqqqqqqqg..',
      '..gQqqqqqqqqqK..',
      '..qQqqqQqqqqqK..',
      '..qqqqqqqqqqqK..',
      '..qqqqqqqqqqKK..',
      '...qqqqqqqqKK...',
      '....KKKKKKKK....',
    ],
  },
  fortune: {
    liquid: '#f2c030',
    art: [
      '................',
      '......cccc......',
      '......CCCC......',
      '.....gggggg.....',
      '...gggggggggg...',
      '...gwgggggggg...',
      '...gQqqqqqqqK...',
      '...qQqqxxqqqK...',
      '...qQqxyxXqqK...',
      '...qqqxXXXqqK...',
      '...qqqqXXqqqK...',
      '...qqqqqqqqqK...',
      '...qqqqqqqqKK...',
      '...KKKKKKKKKK...',
    ],
  },
  luck: {
    liquid: '#4ac850',
    art: [
      '......x..x......',
      '.....xyxxyx.....',
      '......xxxX......',
      '.....xyxxXx.....',
      '......xccX......',
      '.......CC.......',
      '......gwgg......',
      '......gwgg......',
      '......gQqK......',
      '......qQqK......',
      '......qQqK......',
      '......qqqK......',
      '......qqqK......',
      '......qqKK......',
      '.......KK.......',
    ],
  },
  fury: {
    liquid: '#e03a3a',
    art: [
      '................',
      '.......cc.......',
      '.......CC.......',
      '...x...gw...x...',
      '...xx.gwgg.xx...',
      '....gggggggg....',
      '...gwqqqqqqqg...',
      '.xxgQqqqQqqqKxx.',
      '..xgQqqqqqqqKx..',
      '...qqqQqqqqqK...',
      '....qqqqqqqK....',
      '...xxqqqqqKxx...',
      '...x..KKKK..x...',
      '.......xx.......',
    ],
  },
  giant: {
    liquid: '#f08a2a',
    art: [
      '................',
      '.....cccc.......',
      '.....CCCC.......',
      '....ggwggg......',
      '...ggwgggggxxx..',
      '..ggwggggggg..x.',
      '.gwQqqqqqqqqK.x.',
      '.gQqqqqqqqqqKxx.',
      '.qQqqqqqqqqqKx..',
      '.qQqqQqqqqqqK...',
      '.qqqqqqqqqqqK...',
      '.qqqqqqqqqqqK...',
      '.qqqqqqqqqqKK...',
      '..KKKKKKKKKK....',
    ],
  },
  phoenix: {
    liquid: '#f05a2a',
    art: [
      '................',
      '...........yyx..',
      '.........yyyxx..',
      '........yyqqx...',
      '.......yqqqqx...',
      '......yqqqqqx...',
      '.....yqqqKqqx...',
      '....yqqqKqqx....',
      '....qqqKqqqx....',
      '...xqqKqqxx.....',
      '...qqKqqxx......',
      '...xKqxx........',
      '...XK...........',
      '..XX............',
      '.XX.............',
    ],
  },
};

const POTION_EXTRA: Record<PotionId, Record<string, string>> = {
  insight: {},
  fortune: { x: '#fff2a8', y: '#ffffff', X: '#c08a2b' },
  luck: { x: '#5ac85a', y: '#b8f0a8', X: '#2e7a3a' },
  fury: { x: '#8a8a9a' },
  giant: { x: '#b0d8e8' },
  phoenix: { x: '#c02a2a', y: '#ffe060', X: '#f0e6c8' },
};

/** Visual tier band: potions only change look at a few thresholds, so huge tiers cost nothing. */
function potionBand(tier: number): 0 | 1 | 2 {
  const t = Number.isFinite(tier) ? tier : tier > 0 ? Infinity : 0;
  return t >= 10 ? 2 : t >= 5 ? 1 : 0;
}

export function potionIconPix(potion: PotionId, tier: number): Pix {
  const look = POTIONS[potion] ?? POTIONS.insight;
  const q = look.liquid;
  const map: Record<string, Color> = {
    q,
    Q: shade(q, 0.4),
    K: shade(q, -0.32),
    c: '#c08a5a',
    C: '#8a5a34',
    g: '#bcd8e8',
    w: '#ffffff',
    ...(POTION_EXTRA[potion] ?? {}),
  };
  const p = new Pix(16, 16).art(look.art, map);
  const band = potionBand(tier);
  if (band >= 1) {
    // ribbon tied around the neck (or quill); ultra tiers get a royal ribbon and a second sparkle
    const rib = band === 2 ? '#c050e0' : potion === 'fortune' || potion === 'giant' ? '#d8405a' : '#e0b040';
    const [x0, x1, y] = RIBBON_AT[potion] ?? RIBBON_AT.insight;
    p.rect(x0, y, x1 - x0 + 1, 1, rib).set(x1, y, shade(rib, -0.3)).set(x0, y, shade(rib, 0.3));
  }
  p.outline(OUTLINE);
  for (let i = 0; i < band; i++) sparkleFree(p);
  return p;
}

/** Ribbon span [x0, x1, y] across each bottle's neck. */
const RIBBON_AT: Record<PotionId, [number, number, number]> = {
  insight: [6, 9, 4],
  fortune: [5, 10, 3],
  luck: [5, 10, 6],
  fury: [6, 9, 3],
  giant: [4, 9, 3],
  phoenix: [2, 5, 12],
};

const SPARKLE_SPOTS: [number, number][] = [[13, 2], [2, 2], [13, 13], [2, 13], [13, 7], [2, 7], [14, 1], [1, 1], [14, 14], [1, 14]];

/** Plus-shaped glint drawn after outlining so it stays crisp. */
function sparkle(p: Pix, x: number, y: number) {
  p.set(x, y, '#ffffff');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) p.set(x + dx, y + dy, '#fff2a8');
}

/** Put a sparkle in the first corner that is fully clear, so it never touches the sprite (or an earlier sparkle). */
function sparkleFree(p: Pix) {
  for (const [x, y] of SPARKLE_SPOTS) {
    let clear = true;
    for (let dy = -2; dy <= 2 && clear; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (Math.abs(dx) + Math.abs(dy) <= 2 && p.get(x + dx, y + dy)) {
          clear = false;
          break;
        }
    if (clear) {
      sparkle(p, x, y);
      return;
    }
  }
}

export function potionIconUrl(potion: PotionId, tier: number): string {
  return spriteUrl(`potion:${potion}:${potionBand(tier)}`, () => potionIconPix(potion, tier));
}

// ------------------------------------------------------------------ chests

/** Band/lock tint per rarity (Common → Divine). */
export const CHEST_TINTS = ['#a8a8b8', '#5ac85a', '#4a8ae8', '#b05ae8', '#f0a030', '#e8486a', '#f8f0b0'] as const;

function rarityIndex(rarity: number): number {
  if (!Number.isFinite(rarity)) return rarity > 0 ? CHEST_TINTS.length - 1 : 0;
  return Math.max(0, Math.min(CHEST_TINTS.length - 1, Math.floor(rarity)));
}

const CHEST_CLOSED = [
  '................',
  '................',
  '................',
  '...bbbbbbbbbb...',
  '..bBBtBBBBtBBb..',
  '.bBbbtbbbbtbbbn.',
  '.bBbbtbbbbtbbbn.',
  '.ttttttyyttttTT.',
  '.bBbbtbyYtbbbbn.',
  '.bBbbtbYYtbbbbn.',
  '.bbbbtbbbbtbbbn.',
  '.bbbbtbbbbtbbbn.',
  '.ttttttttttttTT.',
  '.nnnnnnnnnnnnnn.',
];

const CHEST_OPEN = [
  '................',
  '...nnnnnnnnnn...',
  '..nbbtbbbbtbbn..',
  '..nbbtbbbbtbbn..',
  '..ttttttttttTT..',
  '.ooooooooooooo..',
  '.oossosssossoo..',
  '.tssSssWsSsssTT.',
  '.ttttttyyttttTT.',
  '.bBbbtbyYtbbbbn.',
  '.bBbbtbYYtbbbbn.',
  '.bbbbtbbbbtbbbn.',
  '.bbbbtbbbbtbbbn.',
  '.ttttttttttttTT.',
  '.nnnnnnnnnnnnnn.',
];

export function chestPix(rarity: number, open: boolean): Pix {
  const r = rarityIndex(rarity);
  const tint = CHEST_TINTS[r];
  const wood = r >= 4 ? '#6a3a2a' : r >= 2 ? '#7a4a2a' : '#8f563b';
  const map: Record<string, Color> = {
    b: wood,
    B: shade(wood, 0.25),
    n: shade(wood, -0.3),
    t: tint,
    T: shade(tint, -0.3),
    y: r >= 4 ? '#ffffff' : '#f2c94c',
    Y: r >= 4 ? '#fff2a8' : '#c08a2b',
    o: '#2a1420',
    s: '#f2c94c',
    S: '#fff2a8',
    W: '#ffffff',
  };
  const p = new Pix(16, 16).art(open ? CHEST_OPEN : CHEST_CLOSED, map).outline(OUTLINE);
  if (open) {
    // extra glints on the hoard for the fancier chests
    if (r >= 3) p.set(4, 7, '#ffffff').set(9, 6, '#ffffff');
  } else if (r >= 5) sparkleFree(p);
  return p;
}

export function chestUrl(rarity: number, open: boolean): string {
  return spriteUrl(`chest:${rarityIndex(rarity)}:${open ? 1 : 0}`, () => chestPix(rarity, open));
}

// ------------------------------------------------------------------ bosses

const BOSS_OUTLINE = '#07040b';

/** Crown seat (x center on the 20px grid) per archetype; the crown drops onto the topmost pixel there. */
const CROWN_X: Record<string, number> = {
  slime: 9.5,
  goblin: 9.5,
  wolf: 3.5,
  bat: 9.5,
  skeleton: 8.5,
  mushroom: 9.5,
  crab: 8.5,
  ghost: 8.5,
  rat: 3.5,
  spider: 9,
  eye: 9,
  golem: 9,
  imp: 7,
  snake: 4.5,
  scorpion: 7,
  frog: 7,
  wisp: 8,
  mimic: 9.5,
  yeti: 8,
  dragon: 4,
  beetle: 11,
};

const CROWN = ['L...Y...Y', 'LL.YYY.YY', 'LYYYYYYYY', 'YrYYbYYrY', 'OOOOOOOOO'];

function normHue(hue: number): number {
  return Number.isFinite(hue) ? ((Math.round(hue) % 360) + 360) % 360 : 0;
}

/** Boss variant: archetype art doubled to 40x40, re-lit at full res, crowned, with a heavier outline. */
export function bossPix(monsterId: string, hue: number): Pix {
  const m = MONSTER_BY_ID[monsterId] ?? MONSTERS[0];
  const h = normHue(hue);
  const map: Record<string, Color> = {};
  for (const [k, v] of Object.entries(m.pal)) {
    const keep = v === MONSTER_EYE || v === '#ffffff' || k === 'e' || k === 'w';
    map[k] = keep || h === 0 ? v : hueRotate(v, h);
  }
  const small = new Pix(20, 20).art(m.art, map, 0, 20 - m.art.length);
  const p = new Pix(40, 40);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const c = small.get(x, y);
      if (c) p.rect(x * 2, y * 2, 2, 2, c);
    }
  p.autoShade(-0.22);
  rimLight(p, 0.18);

  // crown sits on the highest pixel under its seat
  const cx = Math.round((CROWN_X[m.id] ?? 9.5) * 2);
  let top = 40;
  for (let x = cx - 2; x <= cx + 2; x++)
    for (let y = 0; y < 40; y++)
      if (p.get(x, y)) {
        top = Math.min(top, y);
        break;
      }
  if (top === 40) top = p.bounds().y;
  const cw = CROWN[0].length;
  const oy = Math.max(1, top - CROWN.length + 1);
  p.art(CROWN, { Y: '#f2c94c', L: '#fff2a8', O: '#b8862b', r: '#e04a5a', b: '#5fcde4' }, cx - (cw >> 1), oy);
  return p.outline(BOSS_OUTLINE);
}

/** Brighten silhouette pixels facing the top-left light. */
function rimLight(p: Pix, amt: number) {
  const src = p.clone();
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = src.get(x, y);
      if (c && (!src.get(x - 1, y) || !src.get(x, y - 1)) && c !== MONSTER_EYE) p.set(x, y, shade(c, amt));
    }
}

export function bossUrl(monsterId: string, hue: number): string {
  const id = MONSTER_BY_ID[monsterId] ? monsterId : MONSTERS[0].id;
  return spriteUrl(`boss:${id}:${normHue(hue)}`, () => bossPix(id, hue));
}

// ------------------------------------------------------------------ merchant

const MERCHANT_LOOK: Appearance = {
  race: 'dwarf',
  skin: 1,
  hair: 'bald',
  hairColor: '#b8682a',
  eyes: '#4a3020',
  beard: 'long',
  outfit: '#3a7a5a',
  pants: '#5a3a2a',
};

/** Friendly dwarf shopkeeper: hero rig + felt cap, apron and a coin pouch. */
export function merchantPix(): Pix {
  const p = heroPix(MERCHANT_LOOK);
  const extra = new Pix(40, 40);
  // felt cap with a feather
  const cap = '#8a3a4a';
  extra.rect(15, 12, 10, 2, cap).rect(14, 13, 12, 1, cap).rect(16, 11, 8, 1, cap);
  extra.rect(12, 14, 16, 1, shade(cap, -0.25)).rect(16, 12, 3, 1, shade(cap, 0.25));
  extra.rect(15, 13, 10, 1, '#e0b040');
  extra.set(24, 10, '#f0e6c8').set(25, 9, '#f0e6c8').set(26, 8, '#f0e6c8').set(25, 10, '#c8b890');
  // apron below the beard
  const apron = '#e8dcc0';
  extra.rect(17, 29, 6, 4, apron).rect(16, 31, 8, 3, apron).rect(17, 29, 1, 4, shade(apron, 0.2));
  extra.rect(16, 33, 8, 1, shade(apron, -0.2));
  // coin pouch hanging from the right hand
  const sack = '#c8904a';
  extra.rect(25, 31, 4, 3, sack).rect(26, 30, 2, 1, '#8a5a34').rect(26, 34, 3, 1, shade(sack, -0.25));
  extra.set(25, 31, shade(sack, 0.25)).set(27, 32, '#f2c94c').set(28, 32, '#c08a2b');
  p.blit(extra.outline(MONSTER_EYE)); // same ink as the hero rig
  return p;
}

export function merchantUrl(): string {
  return spriteUrl('merchant', merchantPix);
}
