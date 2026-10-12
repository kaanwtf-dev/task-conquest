// Small hand-drawn UI sprites (fill-only; outlined automatically).
import { Pix, spriteUrl, type Color } from '../pix';

const ART: Record<string, { art: string[]; pal: Record<string, Color>; outline?: boolean }> = {
  coin: {
    art: ['..yyyy..', '.yYYYYy.', 'yYyyyYoy', 'yYyYyYoy', 'yYyYyYoy', 'yYyyyYoy', '.yooooy.', '..yyyy..'],
    pal: { y: '#f2c94c', Y: '#fff2a8', o: '#c08a2b' },
  },
  xp: {
    art: ['...yy...', '...yy...', 'yyyYYyyy', '.yyYYyy.', '..yyyy..', '.yyooyy.', '.yo..oy.', 'o......o'],
    pal: { y: '#5fcde4', Y: '#e0faff', o: '#306082' },
  },
  flame: {
    art: ['...r....', '..rr..r.', '..rrr.rr', '.rrorrrr', '.roooorr', 'rooyyoor', 'rooyyyor', '.rooyor.'],
    pal: { r: '#d9442a', o: '#ff9a2a', y: '#fff060' },
  },
  heart: {
    art: ['.rr.rr.', 'rWrrrrr', 'rWrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    pal: { r: '#e04a5a', W: '#ffd0d8' },
  },
  sword: {
    art: ['.......ww', '......wwB', '.....wwB.', '....wwB..', 'g..wwB...', '.gwwB....', '..gB.....', '.h.g.....', 'h........'],
    pal: { w: '#e8eef2', B: '#8a9aa8', g: '#e0b040', h: '#8a5a34' },
  },
  helm: {
    art: ['..mmmmm..', '.mMmmmmm.', 'mMmmmmmmm', 'mmmmmmmmm', 'mmdddddmm', 'mmd.d.dmm', 'mmd.d.dmm', '.mm...mm.'],
    pal: { m: '#b8c0c8', M: '#ffffff', d: '#3a3a4a' },
  },
  bag: {
    art: ['...bb...', '..b..b..', '.ssssss.', 'sSssssss', 'sSssyyss', 'sSssyyss', 'ssssssss', '.ssssss.'],
    pal: { b: '#8f563b', s: '#d9a066', S: '#eec39a', y: '#f2c94c' },
  },
  party: {
    art: ['.aa....bb.', 'aAaa..bBbb', 'aaaa..bbbb', '.aa....bb.', 'cccc..dddd', 'cccccddddd', 'cccccddddd'],
    pal: { a: '#eec39a', A: '#ffffff', b: '#d9a066', B: '#eec39a', c: '#5b6ee1', d: '#d95763' },
  },
  gear: {
    art: ['...gg...', '.g.gg.g.', '..gggg..', 'gggddggg', 'gggddggg', '..gggg..', '.g.gg.g.', '...gg...'],
    pal: { g: '#9badb7', d: '#222034' },
  },
  scroll: {
    art: ['.pppppp.', 'pPPPPPPp', '.PllllP.', '.PPPPPP.', '.PlllP..', '.PPPPPP.', 'pPPPPPPp', '.pppppp.'],
    pal: { p: '#8f563b', P: '#eec39a', l: '#8a6f30' },
  },
  plus: {
    art: ['..ww..', '..ww..', 'wwwwww', 'wwwwww', '..ww..', '..ww..'],
    pal: { w: '#ffffff' },
  },
  check: {
    art: ['.......g', '......gg', 'g....gg.', 'gg..gg..', '.gggg...', '..gg....'],
    pal: { g: '#99e550' },
  },
  skull: {
    art: ['.wwwww.', 'wwwwwww', 'wddwddw', 'wddwddw', 'wwwdwww', '.wwwww.', '.w.w.w.'],
    pal: { w: '#f0eadc', d: '#222034' },
  },
  chest: {
    art: ['.bbbbbbbb.', 'bBBBBBBBBb', 'bBbbbbbbBb', 'gggggggggg', 'bbbbyybbbb', 'bBbbyybbBb', 'bBbbbbbbBb', 'bbbbbbbbbb'],
    pal: { b: '#8f563b', B: '#d9a066', g: '#f2c94c', y: '#fff2a8' },
  },
  repeat: {
    art: ['.wwww.', 'w....w', 'w...www', '......w', 'ww.....', '.www..w', '..w...w', '...www.'],
    pal: { w: '#cbdbfc' },
  },
  star: {
    art: ['...y...', '...y...', 'yyyYyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.'],
    pal: { y: '#fbf236', Y: '#ffffff' },
  },
  potion: {
    art: ['..cc..', '..kk..', '.a..a.', 'aLaaaa', 'aLaaaa', 'aaaaDa', '.aaaa.'],
    pal: { c: '#eec39a', k: '#8f563b', a: '#d95763', L: '#ffb0b8', D: '#ac3232' },
  },
};

export type UiSprite = keyof typeof ART;

export function uiPix(name: UiSprite): Pix {
  const def = ART[name];
  const w = Math.max(...def.art.map((r) => r.length));
  const p = new Pix(w + 2, def.art.length + 2).art(def.art, def.pal, 1, 1);
  return def.outline === false ? p : p.outline('#140c1c');
}

export function uiUrl(name: UiSprite): string {
  return spriteUrl(`ui:${name}`, () => uiPix(name));
}
