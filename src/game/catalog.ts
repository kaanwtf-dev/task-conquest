// Static game catalog: skills, classes, monster naming.
import type { ClassId, SkillId } from '../core/types';
import { MATERIALS } from '../pixel/sprites/gear';
import type { GearLook } from '../pixel/sprites/hero';
import { Rng } from '../core/rng';
import { t, tk } from '../i18n';
import { MONSTER_BY_ID } from '../pixel/sprites/monsters';
import { roman } from './progression';

export const SKILLS: { id: SkillId; name: string; emoji: string; hint: string }[] = [
  { id: 'athletics', name: tk('Athletics'), emoji: '🏃', hint: tk('Fitness, sports, movement') },
  { id: 'hearthcraft', name: tk('Hearthcraft'), emoji: '🧹', hint: tk('Chores and home') },
  { id: 'mercantile', name: tk('Mercantile'), emoji: '🛒', hint: tk('Shopping and money') },
  { id: 'lore', name: tk('Lore'), emoji: '📚', hint: tk('Study and reading') },
  { id: 'smithing', name: tk('Smithing'), emoji: '💼', hint: tk('Work and projects') },
  { id: 'alchemy', name: tk('Alchemy'), emoji: '🍳', hint: tk('Cooking and nutrition') },
  { id: 'speech', name: tk('Speech'), emoji: '💬', hint: tk('Social, calls, email') },
  { id: 'restoration', name: tk('Restoration'), emoji: '🧘', hint: tk('Self-care and health') },
  { id: 'artistry', name: tk('Artistry'), emoji: '🎨', hint: tk('Creative hobbies') },
  { id: 'wayfaring', name: tk('Wayfaring'), emoji: '🗺️', hint: tk('Errands and travel') },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, (typeof SKILLS)[number]>;

export const CLASSES: { id: ClassId; name: string; weapon: string; blurb: string; look: GearLook }[] = [
  {
    id: 'knight',
    name: tk('Knight'),
    weapon: 'sword',
    blurb: tk('Sword and shield. Steady and reliable.'),
    look: { weapon: { kind: 'sword', mat: MATERIALS.iron }, offhand: { kind: 'shield', mat: { ...MATERIALS.wood, trim: '#9aa4ae', gem: '#d95763' } } },
  },
  {
    id: 'mage',
    name: tk('Mage'),
    weapon: 'staff',
    blurb: tk('Hurls fireballs at your chores.'),
    look: {
      weapon: { kind: 'staff', mat: MATERIALS.wood },
      head: { kind: 'hat', mat: { ...MATERIALS.wood, main: '#4a3aa0', dark: '#2a1e6a', light: '#6a5ad0', trim: '#e0b040', gem: '#5fcde4' } },
    },
  },
  {
    id: 'ranger',
    name: tk('Ranger'),
    weapon: 'bow',
    blurb: tk('Picks off tasks from afar.'),
    look: { weapon: { kind: 'bow', mat: MATERIALS.wood }, cape: '#2e6b3a' },
  },
  {
    id: 'rogue',
    name: tk('Rogue'),
    weapon: 'dagger',
    blurb: tk('Fast, sneaky, criticals galore.'),
    look: {
      weapon: { kind: 'dagger', mat: MATERIALS.steel },
      head: { kind: 'hood', mat: { ...MATERIALS.wood, main: '#3a3a4a', dark: '#22222e', light: '#5a5a6a' } },
    },
  },
  {
    id: 'berserker',
    name: tk('Berserker'),
    weapon: 'axe',
    blurb: tk('Big axe. Big swings. No plan.'),
    look: { weapon: { kind: 'axe', mat: MATERIALS.iron } },
  },
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<ClassId, (typeof CLASSES)[number]>;

// ----- monsters: infinite variants via tier palette swaps + name prefixes -----
const TIER_PREFIX = [
  tk('Young {monster}'), tk('Wild {monster}'), tk('Feral {monster}'), tk('Savage {monster}'), tk('Dire {monster}'), tk('Elder {monster}'), tk('Ancient {monster}'),
  tk('Dread {monster}'), tk('Mythic {monster}'), tk('Abyssal {monster}'), tk('Celestial {monster}'), tk('Eternal {monster}'), tk('Primordial {monster}'), tk('Cosmic {monster}'),
];
/** Past the last tier prefix: "Cosmic II Wolf". */
const TIER_NUMBERED = tk('Cosmic {numeral} {monster}');
const ZONE_ADJ: Record<string, string[]> = {
  tavern: [tk('Tipsy {monster}'), tk('Cellar {monster}'), tk('Ale {monster}'), tk('Rowdy {monster}')],
  forest: [tk('Moss {monster}'), tk('Thorn {monster}'), tk('Oak {monster}'), tk('Fern {monster}')],
  beach: [tk('Tide {monster}'), tk('Coral {monster}'), tk('Salt {monster}'), tk('Reef {monster}')],
  dungeon: [tk('Crypt {monster}'), tk('Shadow {monster}'), tk('Bone {monster}'), tk('Gloom {monster}')],
  snow: [tk('Frost {monster}'), tk('Ice {monster}'), tk('Rime {monster}'), tk('Glacier {monster}')],
  desert: [tk('Sand {monster}'), tk('Dune {monster}'), tk('Sun {monster}'), tk('Dust {monster}')],
  castle: [tk('Royal {monster}'), tk('Throne {monster}'), tk('Banner {monster}'), tk('Gilded {monster}')],
  volcano: [tk('Ember {monster}'), tk('Magma {monster}'), tk('Ash {monster}'), tk('Cinder {monster}')],
};

export interface MonsterSpawn {
  id: string; // archetype
  name: string; // in the player's language
  level: number;
  hue: number;
  elite: boolean;
}

export function spawnMonster(pool: string[], zone: string, level: number, seed: number): MonsterSpawn {
  const rng = new Rng(seed);
  const id = rng.pick(pool);
  const tier = Math.floor((level - 1) / 8);
  const adj = rng.pick(ZONE_ADJ[zone] ?? [tk('Wild {monster}')]);
  const elite = rng.chance(0.08);
  // each tier gets its own palette swap; tier 0 keeps the classic colors
  const hue = tier === 0 ? 0 : ((tier * 137) % 360);
  // "Young Moss Slime", in the player's language
  const monster = t(adj, { monster: t(MONSTER_BY_ID[id]?.name ?? tk('Slime')) });
  const named =
    tier < TIER_PREFIX.length ? t(TIER_PREFIX[tier], { monster }) : t(TIER_NUMBERED, { numeral: roman(tier - TIER_PREFIX.length + 2), monster });
  return { id, name: `${elite ? '★ ' : ''}${named}`, level, hue, elite };
}
