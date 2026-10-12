import { useEffect, useRef } from 'react';
import { heroPix, RACES, HAIR_STYLES, HAIR_COLORS, STARTER_GEAR, type Appearance } from '../pixel/sprites/hero';
import { MONSTERS, monsterPix } from '../pixel/sprites/monsters';
import { THEMES, sceneCanvas } from '../pixel/themes';
import { iconFor } from '../pixel/iconGen';
import { uiPix } from '../pixel/sprites/ui';
import { WEAPON_KINDS, weaponPix, MATERIALS } from '../pixel/sprites/gear';
import type { Pix } from '../pixel/pix';

function Sprite({ pix, scale = 4 }: { pix: Pix; scale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = pix.toCanvas(scale);
    ref.current!.innerHTML = '';
    ref.current!.appendChild(c);
  }, [pix, scale]);
  return <div ref={ref} style={{ display: 'inline-block', margin: 4, background: '#2a2a3a' }} />;
}

const base: Appearance = { race: 'human', skin: 1, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };

export default function SpriteLab() {
  const items = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Coffee', 'Toilet paper', 'Run 5k', 'Reply emails', 'Laundry', 'Call mom', 'Pay rent', 'Dentist', 'Feed the cat', 'Zorblax ritual', 'Sync with Bob', 'Avocado', 'Chicken', 'Pasta'];
  return (
    <div style={{ padding: 12, color: '#fff', fontFamily: 'monospace', background: '#111' }}>
      <h3>Races</h3>
      {RACES.map((r, i) => (
        <Sprite key={r.id} pix={heroPix({ ...base, race: r.id, eyes: r.defaultEyes, skin: 0, hair: HAIR_STYLES[i % 7], hairColor: HAIR_COLORS[i], beard: r.id === 'dwarf' ? 'long' : 'none' }, Object.values(STARTER_GEAR)[i % 5])} />
      ))}
      <h3>Poses</h3>
      <Sprite pix={heroPix(base, STARTER_GEAR.knight, 'idle', 0)} />
      <Sprite pix={heroPix(base, STARTER_GEAR.knight, 'idle', 1, true)} />
      <Sprite pix={heroPix(base, STARTER_GEAR.knight, 'windup')} />
      <Sprite pix={heroPix(base, STARTER_GEAR.knight, 'swing')} />
      <Sprite pix={heroPix(base, { body: { kind: 'plate', mat: MATERIALS.steel }, head: { kind: 'helm', mat: MATERIALS.steel }, weapon: { kind: 'hammer', mat: MATERIALS.gold }, cape: '#a02a3a' })} />
      <Sprite pix={heroPix({ ...base, race: 'elf' }, { body: { kind: 'robe', mat: { ...MATERIALS.elven, main: '#4a3aa0', trim: '#e0b040' } }, head: { kind: 'circlet', mat: MATERIALS.gold }, weapon: { kind: 'wand', mat: MATERIALS.elven } })} />
      <Sprite pix={heroPix({ ...base, race: 'orc' }, { body: { kind: 'chain', mat: MATERIALS.iron }, head: { kind: 'horned', mat: MATERIALS.iron }, weapon: { kind: 'axe', mat: MATERIALS.ebony } })} />
      <Sprite pix={heroPix({ ...base, race: 'catfolk', hair: 'bob' }, { body: { kind: 'leather', mat: MATERIALS.wood }, head: { kind: 'crown', mat: MATERIALS.gold }, weapon: { kind: 'spear', mat: MATERIALS.glass } })} />
      <h3>Hair</h3>
      {HAIR_STYLES.map((h) => <Sprite key={h} scale={3} pix={heroPix({ ...base, hair: h })} />)}
      <h3>Weapons</h3>
      {WEAPON_KINDS.map((k, i) => <Sprite key={k} pix={weaponPix(k, Object.values(MATERIALS)[i % 8])} />)}
      <h3>Monsters</h3>
      {MONSTERS.map((m) => <Sprite key={m.id} pix={monsterPix(m.id)} />)}
      {MONSTERS.slice(0, 4).map((m) => <Sprite key={m.id + 'v'} pix={monsterPix(m.id, 140)} />)}
      <h3>UI</h3>
      {(['coin', 'xp', 'flame', 'heart', 'sword', 'helm', 'bag', 'party', 'gear', 'scroll', 'plus', 'check', 'skull', 'chest', 'repeat', 'star', 'potion'] as const).map((n) => <Sprite key={n} pix={uiPix(n)} />)}
      <h3>Item icons</h3>
      <div>{items.map((t) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 6 }}><img src={iconFor(t)} style={{ width: 48, imageRendering: 'pixelated' }} />{t}</span>)}</div>
      <h3>Scenes</h3>
      {THEMES.map((t) => <SceneView key={t.id} id={t.id} />)}
    </div>
  );
}

function SceneView({ id }: { id: (typeof THEMES)[number]['id'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const src = sceneCanvas(id, 160, 64);
    const c = document.createElement('canvas');
    c.width = 480; c.height = 192;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, 480, 192);
    ref.current!.innerHTML = '';
    ref.current!.appendChild(c);
  }, [id]);
  return <div ref={ref} style={{ display: 'inline-block', margin: 4 }} />;
}
