// Layered, palette-driven hero sprite (front-facing chibi), 40x40 frame.
import { Pix, shade } from '../pix';
import { MATERIALS, WEAPON_GRIP, heldBowPix, shieldPix, weaponPix, type MaterialPalette } from './gear';

export type RaceId = 'human' | 'elf' | 'dwarf' | 'orc' | 'imp' | 'undead' | 'catfolk' | 'lizardfolk';
export type HairStyle = 'short' | 'long' | 'spiky' | 'mohawk' | 'ponytail' | 'bob' | 'bun' | 'bald';
export type BeardStyle = 'none' | 'short' | 'long';
export type BodyKind = 'tunic' | 'leather' | 'chain' | 'plate' | 'robe';
export type HeadKind = 'none' | 'helm' | 'hood' | 'hat' | 'crown' | 'circlet' | 'horned';

export interface Appearance {
  race: RaceId;
  skin: number;
  hair: HairStyle;
  hairColor: string;
  eyes: string;
  beard: BeardStyle;
  outfit: string;
  pants: string;
}

export interface GearLook {
  weapon?: { kind: string; mat: MaterialPalette };
  offhand?: { kind: string; mat: MaterialPalette };
  body?: { kind: BodyKind; mat: MaterialPalette };
  head?: { kind: HeadKind; mat: MaterialPalette };
  cape?: string;
}

export type Pose = 'idle' | 'windup' | 'swing';

export interface RaceDef {
  id: RaceId;
  name: string;
  skins: string[];
  ty: number; // torso top (smaller = taller)
  blurb: string;
  perk: string;
  defaultEyes: string;
}

export const RACES: RaceDef[] = [
  { id: 'human', name: 'Human', skins: ['#f6d3b3', '#e8b48a', '#c98b5c', '#8d5a3b', '#5a3a26'], ty: 17, defaultEyes: '#3a5a9a', blurb: 'Adaptable and driven.', perk: '+10% XP from every task' },
  { id: 'elf', name: 'Elf', skins: ['#fbe3cc', '#eac4a0', '#c9b2e0', '#8fa3c9'], ty: 16, defaultEyes: '#2a8a5a', blurb: 'Keen-eyed and ancient.', perk: '+15% loot find' },
  { id: 'dwarf', name: 'Dwarf', skins: ['#f6d3b3', '#e8b48a', '#c98b5c', '#8d5a3b'], ty: 19, defaultEyes: '#4a3020', blurb: 'Stout, stubborn, rich.', perk: '+15% gold' },
  { id: 'orc', name: 'Orc', skins: ['#7aa33a', '#5f8a3a', '#8a9a5a', '#4f6b2f'], ty: 17, defaultEyes: '#c03020', blurb: 'Raw strength and fury.', perk: '+8% critical hit chance' },
  { id: 'imp', name: 'Imp', skins: ['#d0453a', '#e0703a', '#9a4ab0', '#4a5a8a'], ty: 18, defaultEyes: '#ffd23a', blurb: 'Small, sly, magical.', perk: 'Potions last 30% longer' },
  { id: 'undead', name: 'Undead', skins: ['#b5c4a8', '#c8c8c0', '#9aa8a0', '#a8b0c8'], ty: 17, defaultEyes: '#5ff0f0', blurb: 'Death was just a setback.', perk: 'Streak survives 1 missed day per week' },
  { id: 'catfolk', name: 'Catfolk', skins: ['#e8a050', '#b8b0a8', '#f0e0c8', '#5a4a40'], ty: 17, defaultEyes: '#7ad040', blurb: 'Nimble and lucky.', perk: '+Luck: rarer loot drops' },
  { id: 'lizardfolk', name: 'Lizardfolk', skins: ['#4aa860', '#3a9a9a', '#7a9a3a', '#8a6ac0'], ty: 17, defaultEyes: '#f0b020', blurb: 'Patient and resilient.', perk: '+20% XP on daily tasks' },
];

export const RACE_BY_ID: Record<RaceId, RaceDef> = Object.fromEntries(RACES.map((r) => [r.id, r])) as Record<RaceId, RaceDef>;

export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'spiky', 'mohawk', 'ponytail', 'bob', 'bun', 'bald'];
export const HAIR_COLORS = ['#2a1e1a', '#5a3a22', '#8a5a2a', '#d8a040', '#f0e0a0', '#c04a2a', '#e8e8e8', '#5a6ad0', '#c050a0', '#40a070'];
export const EYE_COLORS = ['#3a5a9a', '#2a8a5a', '#4a3020', '#c03020', '#ffd23a', '#5ff0f0', '#9a4ad0', '#1a1022'];
export const OUTFIT_COLORS = ['#3a6ad0', '#c0392b', '#2e8b57', '#8a4ac0', '#e0a030', '#3a3a4a', '#e8e0d0', '#d06a9a', '#1a8a9a', '#7a4a2a'];

const OUTLINE = '#1a1022';
const BOOT = '#5a3a28';
const BELT = '#4a2e1c';

export const FRAME = 40;
const OX = 4;
const OY = 6;

function mirrorX(x: number) {
  return 31 - x;
}

export function heroPix(app: Appearance, gear: GearLook = {}, pose: Pose = 'idle', bob = 0, blink = false): Pix {
  const race = RACE_BY_ID[app.race] ?? RACES[0];
  const skin = race.skins[app.skin % race.skins.length];
  const skinDark = shade(skin, -0.22);
  const ty = race.ty;
  const hy = ty - 11;
  const hand: [number, number] = [21, ty + 5];

  // ---------- lower body (does not bob) ----------
  const lower = new Pix(32, 32);
  const robe = gear.body?.kind === 'robe';
  lower.rect(12, 24, 8, 2, app.pants).rect(12, 26, 3, 2, app.pants).rect(17, 26, 3, 2, app.pants);
  lower.rect(11, 28, 4, 2, BOOT).rect(17, 28, 4, 2, BOOT);
  lower.set(11, 28, shade(BOOT, 0.25)).set(17, 28, shade(BOOT, 0.25));
  if (robe) {
    const m = gear.body!.mat;
    for (let y = 24; y <= 27; y++) lower.rect(12 - (y - 24 >> 1), y, 8 + 2 * (y - 24 >> 1), 1, m.main);
    lower.rect(15, 24, 2, 4, m.trim);
  }
  lower.autoShade(-0.18);

  // ---------- upper body (bobs) ----------
  const back = new Pix(32, 32); // cape + tail, behind everything
  const up = new Pix(32, 32);

  if (gear.cape) {
    const c = gear.cape;
    for (let y = ty; y <= ty + 10; y++) {
      const spread = y > ty + 7 ? 2 : y > ty + 4 ? 1 : 0;
      back.rect(11 - spread, y, 10 + spread * 2, 1, y > ty + 8 ? shade(c, -0.25) : c);
    }
  }

  // tails
  const tail = (pts: [number, number][], col: string) => pts.forEach(([x, y]) => back.set(x, y, col));
  if (app.race === 'imp')
    tail([[21, 23], [22, 23], [23, 22], [24, 21], [24, 20], [25, 19], [25, 18], [24, 17], [26, 17], [25, 16]], skinDark);
  if (app.race === 'catfolk')
    tail([[21, 24], [22, 24], [23, 23], [23, 22], [24, 21], [24, 20], [24, 19], [23, 18]], skinDark);
  if (app.race === 'lizardfolk')
    tail([[20, 24], [21, 24], [21, 25], [22, 25], [22, 26], [23, 26], [23, 27], [24, 27], [25, 28], [21, 26], [22, 27]], skinDark);

  // torso + arms
  const body = new Pix(32, 32);
  const bodyKind = gear.body?.kind ?? 'tunic';
  const mat = gear.body?.mat;
  const torsoCol = bodyKind === 'tunic' ? app.outfit : mat!.main;
  body.rect(12, ty, 8, 24 - ty, torsoCol);
  // sleeves + hands
  const sleeve = bodyKind === 'plate' || bodyKind === 'chain' ? mat!.main : bodyKind === 'leather' ? app.outfit : torsoCol;
  body.rect(10, ty, 2, 5, sleeve).rect(20, ty, 2, 5, sleeve);
  body.rect(11, ty, 1, 5, shade(sleeve, -0.3)).rect(20, ty, 1, 5, shade(sleeve, -0.3));
  const handCol = bodyKind === 'plate' ? mat!.dark : skin;
  body.rect(10, ty + 5, 2, 2, handCol).rect(20, ty + 5, 2, 2, handCol);

  if (bodyKind === 'tunic') {
    body.set(15, ty, skin).set(16, ty, skin).set(15, ty + 1, skinDark).set(16, ty + 1, skinDark);
    body.rect(12, 23, 8, 1, BELT).set(15, 23, '#e0b040').set(16, 23, '#e0b040');
  } else if (bodyKind === 'leather') {
    for (let i = 0; i < 6; i++) body.set(13 + i, ty + i, mat!.dark);
    body.rect(10, ty, 2, 1, mat!.light).rect(20, ty, 2, 1, mat!.light);
    body.rect(12, 23, 8, 1, BELT).set(15, 23, '#c0c0c0').set(16, 23, '#c0c0c0');
  } else if (bodyKind === 'chain') {
    for (let y = ty; y < 24; y++)
      for (let x = 10; x < 22; x++) if (body.get(x, y) === mat!.main && (x + y) % 2) body.set(x, y, mat!.dark);
    body.rect(12, 23, 8, 1, BELT).set(15, 23, mat!.trim).set(16, 23, mat!.trim);
  } else if (bodyKind === 'plate') {
    body.rect(13, ty + 1, 1, 4, mat!.light).rect(18, ty + 1, 1, 5, mat!.dark);
    body.rect(14, ty + 3, 4, 1, mat!.dark);
    body.rect(9, ty, 4, 2, mat!.light).rect(19, ty, 4, 2, mat!.light);
    body.set(9, ty + 1, mat!.main).set(22, ty + 1, mat!.dark);
    body.rect(12, 23, 8, 1, mat!.trim);
  } else if (bodyKind === 'robe') {
    body.rect(15, ty, 2, 24 - ty, mat!.trim);
    body.rect(9, ty + 3, 3, 2, mat!.main).rect(20, ty + 3, 3, 2, mat!.main);
    body.set(15, ty, skin).set(16, ty, skin);
  }
  body.autoShade(-0.15);
  up.blit(body);

  // head
  const head = new Pix(32, 32);
  head.rect(10, hy, 12, 11, skin);
  for (const [x, y] of [[10, hy], [11, hy], [10, hy + 1], [21, hy], [20, hy], [21, hy + 1], [10, hy + 10], [21, hy + 10]] as const)
    head.set(x, y, null);
  head.rect(21, hy + 2, 1, 8, skinDark).rect(11, hy + 10, 10, 1, skinDark);

  // race features that sit beside/below hair
  const both = (pts: [number, number][], col: string) =>
    pts.forEach(([x, y]) => {
      head.set(x, y, col);
      head.set(mirrorX(x), y, col);
    });
  if (app.race === 'elf') both([[9, hy + 5], [9, hy + 6], [8, hy + 4], [8, hy + 5], [7, hy + 3], [6, hy + 2]], skin);
  if (app.race === 'orc' || app.race === 'imp') both([[9, hy + 5], [9, hy + 6], [8, hy + 4]], skin);
  if (app.race === 'undead') both([[9, hy + 6]], skinDark);

  // face
  const eyeTop = blink ? skinDark : app.eyes;
  const eyeBot = blink ? skinDark : shade(app.eyes, -0.55);
  const eyeY = hy + 6;
  if (app.race === 'undead') {
    head.rect(12, eyeY - 1, 3, 3, shade(skin, -0.45)).rect(17, eyeY - 1, 3, 3, shade(skin, -0.45));
  }
  if (!blink) {
    head.set(13, eyeY, eyeTop).set(13, eyeY + 1, eyeBot).set(18, eyeY, eyeTop).set(18, eyeY + 1, eyeBot);
  } else {
    head.set(13, eyeY + 1, eyeBot).set(18, eyeY + 1, eyeBot);
  }

  const blushy = ['human', 'elf', 'dwarf', 'catfolk'].includes(app.race);
  if (blushy) {
    const blush = mixHex(skin, '#ff6a6a', 0.35);
    head.set(12, hy + 8, blush).set(19, hy + 8, blush);
  }
  const mouth = shade(skin, -0.38);
  switch (app.race) {
    case 'orc':
      head.rect(14, hy + 9, 4, 1, mouth);
      head.set(13, hy + 8, '#f4ecd0').set(13, hy + 9, '#f4ecd0').set(18, hy + 8, '#f4ecd0').set(18, hy + 9, '#f4ecd0');
      head.rect(12, hy + 5, 3, 1, shade(skin, -0.3)).rect(17, hy + 5, 3, 1, shade(skin, -0.3));
      break;
    case 'undead':
      head.set(14, hy + 9, '#f0eadc').set(15, hy + 9, mouth).set(16, hy + 9, '#f0eadc').set(17, hy + 9, mouth);
      head.set(19, hy + 8, mouth).set(20, hy + 9, mouth);
      break;
    case 'catfolk':
      head.set(15, hy + 8, '#e88a9a').set(16, hy + 8, '#e88a9a');
      head.set(14, hy + 9, mouth).set(17, hy + 9, mouth);
      break;
    case 'lizardfolk':
      head.set(14, hy + 8, mouth).set(17, hy + 8, mouth);
      head.rect(12, hy + 9, 8, 1, mouth);
      break;
    case 'imp':
      head.set(15, hy + 9, mouth).set(16, hy + 9, '#f4ecd0').set(17, hy + 9, mouth);
      break;
    default:
      head.set(15, hy + 9, mouth).set(16, hy + 9, mouth);
  }

  up.blit(head);

  // beard
  const hc = app.hairColor;
  const hcd = shade(hc, -0.28);
  if (app.beard !== 'none' && app.race !== 'lizardfolk') {
    const beard = new Pix(32, 32);
    beard.rect(10, hy + 7, 1, 3, hc).rect(21, hy + 7, 1, 3, hcd);
    beard.rect(11, hy + 8, 10, 3, hc);
    beard.set(15, hy + 9, mouth).set(16, hy + 9, mouth);
    beard.set(12, hy + 8, null).set(19, hy + 8, null).set(13, hy + 8, null).set(18, hy + 8, null);
    if (app.beard === 'long') {
      beard.rect(12, hy + 11, 8, 2, hc).rect(13, hy + 13, 6, 1, hc).rect(14, hy + 14, 4, 1, hcd);
    }
    beard.autoShade(-0.15);
    up.blit(beard);
  }

  // hair
  const headKind = gear.head?.kind ?? 'none';
  const covers = headKind === 'helm' || headKind === 'hood' || headKind === 'hat' || headKind === 'horned';
  if (app.race !== 'lizardfolk') {
    const hair = hairPix(app.hair, hy, hc);
    if (covers) for (let y = 0; y < hy + 4; y++) for (let x = 0; x < 32; x++) hair.set(x, y, null);
    up.blit(hair);
  } else {
    const crest = new Pix(32, 32);
    crest.art(['x..xx..x', '.xxxxxx.'], { x: hc }, 12, hy - 2);
    if (!covers) up.blit(crest);
  }

  // race features on top of hair
  const top = (pts: [number, number][], col: string, mirror = true) =>
    pts.forEach(([x, y]) => {
      up.set(x, y, col);
      if (mirror) up.set(mirrorX(x), y, col);
    });
  if (app.race === 'imp' && headKind !== 'helm' && headKind !== 'horned') {
    top([[12, hy], [12, hy - 1], [11, hy - 1], [11, hy - 2], [10, hy - 3]], '#f0e6c8');
    top([[11, hy - 2], [10, hy - 3]], '#c8b890');
  }
  if (app.race === 'catfolk' && !covers) {
    top([[11, hy], [12, hy], [13, hy], [11, hy - 1], [12, hy - 1], [11, hy - 2]], skin);
    top([[12, hy]], '#e88a9a');
  }

  // head gear
  if (gear.head && headKind !== 'none') up.blit(headgearPix(headKind, gear.head.mat, hy));

  // offhand (left hand)
  if (gear.offhand) {
    const sp = shieldPix(gear.offhand.kind, gear.offhand.mat);
    up.blit(sp, Math.round(10.5 - sp.w / 2), ty + 6 - Math.round(sp.h / 2));
  }

  // compose
  const out = new Pix(FRAME, FRAME);
  out.blit(back, OX, OY + bob);
  out.blit(lower, OX, OY);
  out.blit(up, OX, OY + bob);

  // weapon (right hand)
  if (gear.weapon?.kind === 'bow') {
    out.blit(heldBowPix(gear.weapon.mat), OX + hand[0] - 6, OY + bob + hand[1] - 8);
    out.rect(OX + hand[0] - 1, OY + bob + hand[1], 2, 1, handCol);
  } else if (gear.weapon) {
    let wp = weaponPix(gear.weapon.kind, gear.weapon.mat);
    let [gx, gy] = WEAPON_GRIP[gear.weapon.kind] ?? WEAPON_GRIP.sword;
    const last = wp.w - 1;
    if (pose === 'swing') {
      wp = wp.rot90(1);
      [gx, gy] = [last - gy, gx];
    } else if (pose === 'windup') {
      wp = wp.rot90(3);
      [gx, gy] = [gy, last - gx];
    }
    out.blit(wp, OX + hand[0] - gx, OY + bob + hand[1] - gy);
    // hand over grip
    out.rect(OX + hand[0] - 1, OY + bob + hand[1], 2, 1, handCol);
  }

  out.outline(OUTLINE);

  // post-outline fine details
  if (app.race === 'catfolk') {
    const wc = '#f8f0e0';
    for (const [x, y] of [[8, hy + 7], [9, hy + 8], [8, hy + 9]] as const) {
      out.set(OX + x, OY + bob + y, wc);
      out.set(OX + mirrorX(x), OY + bob + y, wc);
    }
  }
  return out;
}

function hairPix(style: HairStyle, hy: number, hc: string): Pix {
  const p = new Pix(32, 32);
  const hl = shade(hc, 0.3);
  const cap = () => {
    p.rect(12, hy - 1, 8, 1, hc);
    p.rect(11, hy, 10, 1, hc);
    p.rect(10, hy + 1, 12, 3, hc);
    p.rect(13, hy, 3, 1, hl);
  };
  switch (style) {
    case 'bald':
      break;
    case 'short':
      cap();
      p.set(10, hy + 4, hc).set(11, hy + 4, hc).set(14, hy + 4, hc).set(15, hy + 4, hc).set(20, hy + 4, hc).set(21, hy + 4, hc);
      p.rect(10, hy + 5, 1, 2, hc).rect(21, hy + 5, 1, 2, hc);
      break;
    case 'long':
      cap();
      p.rect(10, hy + 4, 12, 1, hc);
      p.set(13, hy + 4, null).set(17, hy + 4, null);
      p.rect(9, hy + 2, 2, 12, hc).rect(21, hy + 2, 2, 12, hc);
      break;
    case 'spiky':
      cap();
      for (const sx of [10, 13, 16, 19]) {
        p.set(sx + 1, hy - 3, hc).rect(sx, hy - 2, 3, 1, hc).rect(sx, hy - 1, 3, 1, hc);
      }
      p.set(10, hy + 4, hc).set(12, hy + 4, hc).set(15, hy + 4, hc).set(19, hy + 4, hc).set(21, hy + 4, hc);
      p.set(9, hy + 2, hc).set(22, hy + 2, hc).set(9, hy + 4, hc).set(22, hy + 4, hc);
      break;
    case 'mohawk':
      p.rect(14, hy - 3, 4, 6, hc);
      p.rect(15, hy - 3, 1, 3, hl);
      break;
    case 'ponytail':
      cap();
      p.set(10, hy + 4, hc).set(11, hy + 4, hc).set(13, hy + 4, hc).set(20, hy + 4, hc).set(21, hy + 4, hc);
      p.rect(22, hy + 2, 2, 3, hc).rect(23, hy + 5, 2, 4, hc).rect(24, hy + 9, 1, 2, hc);
      break;
    case 'bob':
      cap();
      p.rect(10, hy + 4, 12, 1, hc);
      p.rect(9, hy + 3, 2, 7, hc).rect(21, hy + 3, 2, 7, hc);
      break;
    case 'bun':
      cap();
      p.rect(14, hy - 4, 4, 3, hc).set(14, hy - 4, null).set(17, hy - 4, null);
      p.set(15, hy - 3, hl);
      p.set(10, hy + 4, hc).set(21, hy + 4, hc).set(16, hy + 4, hc);
      break;
  }
  return p.autoShade(-0.2);
}

function headgearPix(kind: HeadKind, m: MaterialPalette, hy: number): Pix {
  const p = new Pix(32, 32);
  switch (kind) {
    case 'helm':
    case 'horned':
      p.rect(12, hy - 2, 8, 1, m.main).rect(11, hy - 1, 10, 1, m.main).rect(10, hy, 12, 4, m.main);
      p.rect(9, hy + 4, 14, 1, m.dark);
      p.rect(15, hy + 4, 2, 3, m.dark);
      p.rect(12, hy - 1, 2, 3, m.light);
      p.set(10, hy + 2, m.trim).set(21, hy + 2, m.trim);
      if (kind === 'horned')
        for (const [x, y] of [[9, hy], [8, hy - 1], [8, hy - 2], [7, hy - 3], [7, hy - 4], [8, hy - 5]]) {
          p.set(x, y, '#f0e6c8');
          p.set(mirrorX(x), y, '#d8ccb0');
        }
      break;
    case 'hood':
      p.rect(15, hy - 3, 2, 1, m.main);
      p.rect(12, hy - 2, 8, 1, m.main).rect(11, hy - 1, 10, 1, m.main).rect(10, hy, 12, 4, m.main);
      p.rect(9, hy + 2, 2, 10, m.main).rect(21, hy + 2, 2, 10, m.main);
      p.rect(10, hy + 4, 12, 1, m.dark);
      p.rect(11, hy, 3, 1, m.light);
      break;
    case 'hat':
      p.rect(7, hy + 2, 18, 1, m.dark);
      p.rect(10, hy + 1, 12, 1, m.trim);
      p.rect(11, hy, 10, 1, m.main);
      p.rect(12, hy - 1, 8, 1, m.main);
      p.rect(13, hy - 2, 6, 1, m.main);
      p.rect(14, hy - 3, 4, 1, m.main);
      p.rect(15, hy - 4, 3, 1, m.main);
      p.rect(16, hy - 5, 3, 1, m.main);
      p.rect(18, hy - 6, 2, 1, m.main);
      p.set(15, hy + 1, m.gem).set(16, hy + 1, m.gem);
      break;
    case 'crown':
      p.rect(11, hy, 10, 2, m.main);
      p.rect(11, hy, 10, 1, m.light);
      for (const x of [11, 15, 16, 20]) p.rect(x, hy - 2, 1, 2, m.main);
      p.set(13, hy - 1, m.main).set(18, hy - 1, m.main);
      p.set(13, hy + 1, m.gem).set(18, hy + 1, m.gem).set(15, hy, '#ffffff');
      break;
    case 'circlet':
      p.rect(10, hy + 3, 12, 1, m.main);
      p.set(15, hy + 3, m.gem).set(16, hy + 3, m.gem);
      break;
    default:
      break;
  }
  return p.autoShade(-0.15);
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round((((pa >> s) & 255) * (1 - t)) + (((pb >> s) & 255) * t));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

// Convenient presets for previews
export const STARTER_GEAR: Record<string, GearLook> = {
  knight: { weapon: { kind: 'sword', mat: MATERIALS.iron }, offhand: { kind: 'shield', mat: { ...MATERIALS.wood, trim: '#8a8a8a', gem: '#d95763' } } },
  mage: { weapon: { kind: 'staff', mat: MATERIALS.wood }, head: { kind: 'hat', mat: { ...MATERIALS.wood, main: '#4a3aa0', dark: '#2a1e6a', light: '#6a5ad0', trim: '#e0b040', gem: '#5fcde4' } } },
  ranger: { weapon: { kind: 'bow', mat: MATERIALS.wood }, cape: '#2e6b3a' },
  rogue: { weapon: { kind: 'dagger', mat: MATERIALS.steel }, head: { kind: 'hood', mat: { ...MATERIALS.wood, main: '#3a3a4a', dark: '#22222e', light: '#5a5a6a' } } },
  berserker: { weapon: { kind: 'axe', mat: MATERIALS.iron } },
};

