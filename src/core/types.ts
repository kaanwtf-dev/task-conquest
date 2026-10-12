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
  icon?: string; // emoji, pixelized on render
  color: string;
  theme: ThemeId;
  type: ListType;
  skill: SkillId;
  order: number;
  createdAt: number;
  shared?: boolean;
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
  doneBy?: string;
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
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  kind: 'kill' | 'level' | 'loot' | 'skill' | 'info' | 'quest';
}
