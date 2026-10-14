// Static game catalog: skills, classes, monster naming.
import type { ClassId, SkillId } from '../core/types';
import { MATERIALS } from '../pixel/sprites/gear';
import type { GearLook } from '../pixel/sprites/hero';
import { Rng } from '../core/rng';
import { MONSTER_BY_ID } from '../pixel/sprites/monsters';
import { roman } from './progression';

export const SKILLS: { id: SkillId; name: string; emoji: string; hint: string }[] = [
  { id: 'athletics', name: 'Athletics', emoji: '🏃', hint: 'Fitness, sports, movement' },
  { id: 'hearthcraft', name: 'Hearthcraft', emoji: '🧹', hint: 'Chores and home' },
  { id: 'mercantile', name: 'Mercantile', emoji: '🛒', hint: 'Shopping and money' },
  { id: 'lore', name: 'Lore', emoji: '📚', hint: 'Study and reading' },
  { id: 'smithing', name: 'Smithing', emoji: '💼', hint: 'Work and projects' },
  { id: 'alchemy', name: 'Alchemy', emoji: '🍳', hint: 'Cooking and nutrition' },
  { id: 'speech', name: 'Speech', emoji: '💬', hint: 'Social, calls, email' },
  { id: 'restoration', name: 'Restoration', emoji: '🧘', hint: 'Self-care and health' },
  { id: 'artistry', name: 'Artistry', emoji: '🎨', hint: 'Creative hobbies' },
  { id: 'wayfaring', name: 'Wayfaring', emoji: '🗺️', hint: 'Errands and travel' },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, (typeof SKILLS)[number]>;

export const CLASSES: { id: ClassId; name: string; weapon: string; blurb: string; look: GearLook }[] = [
  {
    id: 'knight',
    name: 'Knight',
    weapon: 'sword',
    blurb: 'Sword and shield. Steady and reliable.',
    look: { weapon: { kind: 'sword', mat: MATERIALS.iron }, offhand: { kind: 'shield', mat: { ...MATERIALS.wood, trim: '#9aa4ae', gem: '#d95763' } } },
  },
  {
    id: 'mage',
    name: 'Mage',
    weapon: 'staff',
    blurb: 'Hurls fireballs at your chores.',
    look: {
      weapon: { kind: 'staff', mat: MATERIALS.wood },
      head: { kind: 'hat', mat: { ...MATERIALS.wood, main: '#4a3aa0', dark: '#2a1e6a', light: '#6a5ad0', trim: '#e0b040', gem: '#5fcde4' } },
    },
  },
  {
    id: 'ranger',
    name: 'Ranger',
    weapon: 'bow',
    blurb: 'Picks off tasks from afar.',
    look: { weapon: { kind: 'bow', mat: MATERIALS.wood }, cape: '#2e6b3a' },
  },
  {
    id: 'rogue',
    name: 'Rogue',
    weapon: 'dagger',
    blurb: 'Fast, sneaky, criticals galore.',
    look: {
      weapon: { kind: 'dagger', mat: MATERIALS.steel },
      head: { kind: 'hood', mat: { ...MATERIALS.wood, main: '#3a3a4a', dark: '#22222e', light: '#5a5a6a' } },
    },
  },
  {
    id: 'berserker',
    name: 'Berserker',
    weapon: 'axe',
    blurb: 'Big axe. Big swings. No plan.',
    look: { weapon: { kind: 'axe', mat: MATERIALS.iron } },
  },
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<ClassId, (typeof CLASSES)[number]>;

// ----- monsters: infinite variants via tier palette swaps + name prefixes -----
const TIER_PREFIX = ['Young', 'Wild', 'Feral', 'Savage', 'Dire', 'Elder', 'Ancient', 'Dread', 'Mythic', 'Abyssal', 'Celestial', 'Eternal', 'Primordial', 'Cosmic'];
const ZONE_ADJ: Record<string, string[]> = {
  tavern: ['Tipsy', 'Cellar', 'Ale', 'Rowdy'],
  forest: ['Moss', 'Thorn', 'Oak', 'Fern'],
  beach: ['Tide', 'Coral', 'Salt', 'Reef'],
  dungeon: ['Crypt', 'Shadow', 'Bone', 'Gloom'],
  snow: ['Frost', 'Ice', 'Rime', 'Glacier'],
  desert: ['Sand', 'Dune', 'Sun', 'Dust'],
  castle: ['Royal', 'Throne', 'Banner', 'Gilded'],
  volcano: ['Ember', 'Magma', 'Ash', 'Cinder'],
};

export interface MonsterSpawn {
  id: string; // archetype
  name: string;
  level: number;
  hue: number;
  elite: boolean;
}

export function spawnMonster(pool: string[], zone: string, level: number, seed: number): MonsterSpawn {
  const rng = new Rng(seed);
  const id = rng.pick(pool);
  const tier = Math.floor((level - 1) / 8);
  const prefix = tier < TIER_PREFIX.length ? TIER_PREFIX[tier] : `${TIER_PREFIX[TIER_PREFIX.length - 1]} ${roman(tier - TIER_PREFIX.length + 2)}`;
  const adj = rng.pick(ZONE_ADJ[zone] ?? ['Wild']);
  const elite = rng.chance(0.08);
  // each tier gets its own palette swap; tier 0 keeps the classic colors
  const hue = tier === 0 ? 0 : ((tier * 137) % 360);
  const base = MONSTER_BY_ID[id]?.name ?? 'Slime';
  return { id, name: `${elite ? '★ ' : ''}${prefix} ${adj} ${base}`, level, hue, elite };
}
