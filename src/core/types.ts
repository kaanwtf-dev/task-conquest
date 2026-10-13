import type { Appearance } from '../pixel/sprites/hero';
import type { ThemeId } from '../pixel/themes';

/** Per-device grow-only counter (merge = max per device) so offline devices never lose progress. */
export type Counter = Record<string, number>;

export interface Meta {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export type ListType = 'daily' | 'weekly' | 'quests' | 'supply' | 'custom';

export type Repeat =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'monthly' }
  | { kind: 'days'; days: number[] } // 0=Sun..6=Sat
  | { kind: 'interval'; every: number; anchor: string };

/** 0 trivial, 1 easy, 2 normal, 3 hard, 4 epic */
export type Difficulty = 0 | 1 | 2 | 3 | 4;

export type SkillId =
  | 'athletics'
  | 'hearthcraft'
  | 'mercantile'
  | 'lore'
  | 'smithing'
  | 'alchemy'
  | 'speech'
  | 'restoration'
  | 'artistry'
  | 'wayfaring';

export interface TaskList extends Meta {
  name: string;
  ownerId?: string; // set once synced (Supabase user id of the creator)
  icon?: string; // emoji, pixelized on render
  color: string;
  theme: ThemeId;
  type: ListType;
  skill: SkillId;
  order: number;
  createdAt: number;
  shared?: boolean;
  chestFor?: string; // period key of the last quest-complete chest (one chest per list per period)
}

export interface Task extends Meta {
  listId: string;
  title: string;
  notes?: string;
  difficulty: Difficulty;
  repeat: Repeat;
  due?: string; // YYYY-MM-DD
  doneFor?: string | null; // period key this task is completed for
  rewardedFor?: string | null; // prevents farming by toggling
  doneAt?: number;
  doneBy?: string; // display name of whoever completed it (shared lists)
  createdBy?: string;
  order: number;
  icon?: string;
  createdAt: number;
  timesDone: number;
  // supply-list extras
  qty?: string;
  aisle?: string;
  staple?: boolean;
}

export type ClassId = 'knight' | 'mage' | 'ranger' | 'rogue' | 'berserker';

// ---------------------------------------------------------------- loot

export type Slot = 'weapon' | 'head' | 'body' | 'offhand' | 'cape' | 'trinket';
export const SLOTS: Slot[] = ['weapon', 'head', 'body', 'offhand', 'cape', 'trinket'];

/** Item bases per slot. Visual bases map 1:1 onto hero sprite kinds (see pixel/sprites/hero.ts). */
export const BASES = {
  weapon: ['sword', 'axe', 'dagger', 'staff', 'bow', 'mace', 'spear', 'hammer', 'wand'],
  head: ['helm', 'hood', 'hat', 'crown', 'circlet', 'horned'],
  body: ['leather', 'chain', 'plate', 'robe'],
  offhand: ['shield', 'buckler', 'tome', 'orb'],
  cape: ['cape'],
  trinket: ['ring', 'amulet', 'charm'],
} as const satisfies Record<Slot, readonly string[]>;
export type BaseId = (typeof BASES)[Slot][number];

/** 0 Common, 1 Uncommon, 2 Rare, 3 Epic, 4 Legendary, 5 Mythic, 6 Divine */
export type Rarity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Percent-point bonuses from gear affixes (before soft caps):
 * xp/gold: +% rewards · find: +% chance of loot drops · crit: +% crit chance (crit = double rewards)
 * boss: +% boss damage · luck: shifts rarity rolls · skill: +% skill XP · potion: +% potion duration
 */
export type StatId = 'xp' | 'gold' | 'find' | 'crit' | 'boss' | 'luck' | 'skill' | 'potion';

export interface Affix {
  stat: StatId;
  value: number;
}

export interface Item extends Meta {
  slot: Slot;
  base: BaseId;
  material: number; // material tier index, unbounded (tier names cycle with numerals past the table)
  rarity: Rarity;
  ilvl: number; // item level = hero level when it dropped
  power: number; // base power before upgrades; contributes to hero Power (boss damage)
  upgrade: number; // blacksmith +N, unbounded
  affixes: Affix[];
  name: string; // generated, e.g. "Rare Steel Sword of Insight" or a unique legendary name
  seed: number;
  locked?: boolean;
  source?: 'drop' | 'boss' | 'chest' | 'shop' | 'starter';
  createdAt: number;
}

export type PotionId = 'insight' | 'fortune' | 'luck' | 'fury' | 'giant' | 'phoenix';

/** A stack of identical potions in the bag (id = `${potion}:${tier}`). */
export interface PotionStack extends Meta {
  potion: PotionId;
  tier: number;
  count: number;
}

/** Active potion effect; counts down per completed task (phoenix is used instantly). */
export interface Buff {
  id: string;
  potion: PotionId;
  tier: number;
  value: number; // percent bonus (or flat effect) while active
  remaining: number; // completed tasks left
}

export interface Hero extends Meta {
  name: string;
  appearance: Appearance;
  classId: ClassId;
  xp: Counter;
  gold: Counter;
  goldSpent: Counter;
  kills: Counter;
  tasksDone: Counter;
  skillXp: Partial<Record<SkillId, Counter>>;
  activeDays: string[];
  createdAt: number;
  // ---- added with the loot/boss update (filled by store migration for older saves) ----
  equipped: Partial<Record<Slot, string>>; // item ids
  buffs: Buff[];
  bagSize: number;
  bossIndex: number; // 1-based boss ladder position, unbounded
  bossDamage: Counter; // damage dealt to boss `bossIndex` (per device)
  bossesSlain: Counter;
  itemsFound: Counter;
  potionsUsed: Counter;
  questsCleared: Counter; // whole lists cleared for a period
  achievements: Record<string, number>; // achievement id -> highest tier claimed
  title?: string; // chosen display title (from achievements / levels)
  owned: string[]; // purchased cosmetics + unlocks (e.g. 'theme:castle', 'dye:outfit:#ff00aa')
  streakSaves: number; // phoenix feathers applied (keeps the streak alive)
  savedDays: string[]; // days covered by a streak save / undead perk
  capeDye?: string; // purchased dye overriding the equipped cape color
}

/** Combined effective stats (after soft caps) derived from equipped gear + race/class. */
export interface HeroStats {
  power: number;
  xp: number;
  gold: number;
  find: number;
  crit: number;
  boss: number;
  luck: number;
  skill: number;
  potion: number;
}

export type AnimMode = 'full' | 'quick' | 'off';

export interface Settings {
  anim: AnimMode;
  sfx: number; // 0..1
  music: number; // 0..1
  haptics: boolean;
  dayStartHour: number;
  weekStart: number; // 0=Sun, 1=Mon
  taskFont: 'pixel' | 'clean';
  cornerHero: 'big' | 'small' | 'hidden';
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  kind: 'kill' | 'level' | 'loot' | 'skill' | 'info' | 'quest' | 'boss' | 'achievement' | 'party';
}
