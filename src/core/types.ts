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
  /** when its owner disbanded the party (the list is private again; members kept their own copies) */
  disbandedAt?: number;
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
  // time-sensitive quests (game/deadlines.ts)
  /** one-off quests: must be done by this moment (ms) */
  deadline?: number;
  /** when the deadline was set (start of the countdown bar) */
  deadlineSetAt?: number;
  /** repeating quests: must be done by this time of day ("HH:MM") */
  byTime?: string;
  /** what missing it costs: a little (flexible) or more (must do); none when unset */
  stakes?: 'flexible' | 'must' | 'none';
  /** the last missed window that was counted (period key, or 'deadline') */
  missedFor?: string;
  /** when that window ended (ms); windows ending up to then are counted already */
  missedEnd?: number;
  /** a repeating quest's window ended undone and the player hasn't said what happened yet */
  pendingMiss?: {
    key: string;
    end: number;
    /** gold the hero already lost for it (the hit lands right away; "What happened?" can give it back) */
    paid?: number;
    /** misses in a row before this one (restored if the player says it was done after all) */
    prevMisses?: number;
  } | null;
  /** "more time" for a repeating quest's "done by" time: that period's window ends at `until` instead */
  extendFor?: { key: string; until: number } | null;
  /** misses in a row (reset by doing it) and ever */
  misses?: number;
  missTotal?: number;
  /** when we last asked "what happened?" (a closed question waits a while), and a one-off's answer */
  askedAt?: number;
  deadlineOutcome?: 'done' | 'missed';
  /** extra completions of a repeating task within one period: { period key, count } */
  again?: { period: string; n: number };
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
  /** the settings that follow the account (state/syncedSettings.ts), and when they last changed */
  prefs?: { at: number; values: Record<string, unknown> };
  xp: Counter;
  gold: Counter;
  goldSpent: Counter;
  /**
   * Gold lost to missed quests, one entry per miss ("<task>@<window end>"): two devices that both notice the
   * same miss write the same entry, so it is only ever charged once. `refunds` gives some or all of it back.
   */
  penalties?: Counter;
  refunds?: Counter;
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
  bestStreak?: number; // longest streak ever (day history is capped, this is not)
  loginDays?: string[]; // logical days the app was opened (daily check-in reward), last 400
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
  /** 'auto' (or unset): from the phone's language, or Turkish in Turkey's time zone */
  lang?: 'auto' | 'en' | 'tr';
  weekStart: number; // 0=Sun, 1=Mon
  taskFont: 'pixel' | 'clean';
  /** Phone hero window: floating (big/small, draggable), a full-width bar under the HUD, or hidden. */
  cornerHero: 'big' | 'small' | 'bar' | 'hidden';
  /** Where the floating hero window was left (this device only). */
  heroDock?: HeroDock;
  /** The welcome walkthrough was seen (or skipped). */
  introSeen?: boolean;
  /** Reward pop-ups stay until cleared (default), or hide by themselves after a few seconds. */
  popups?: 'stay' | 'auto';
  /** Reminder notifications: when they go out and which kinds are off (on/off is the device's subscription). */
  push?: { morningHour: number; eveningHour: number; off: ('plan' | 'evening' | 'comeback' | 'party' | 'deadline')[] };
  /** When the in-app "want reminders?" card was last answered with Not now (or the system prompt refused). */
  pushAskedAt?: number;
  /** when "back up your save" was last put off (this device) */
  backupAskedAt?: number;
  /** when the "put it on your Home Screen" card was last put off (this device) */
  installAskedAt?: number;
  /** the "enjoying Task Conquest? tip the developer" card: when it was last put off, and whether it is done for good */
  tipAskedAt?: number;
  tipDone?: boolean;
  /** the newest "what's new" this device has shown (src/whatsNew.ts) */
  seenVersion?: string;
  /**
   * The account that turned reminders on here (and has not turned them off or signed out): while it is
   * signed in, a subscription the system dropped is quietly renewed. Another account never inherits it.
   */
  pushAccount?: string;
  /** Grocery categories the player picked by hand, by item name (lower case): next time it goes there. */
  aisleMemory?: Record<string, string>;
  /** Difficulties the player set by hand, by quest name (lower case): used instead of the automatic guess. */
  difficultyMemory?: Record<string, number>;
  /** when the account-wide settings this device has were last changed (hero.prefs.at); newer ones are taken in */
  prefsAt?: number;
}

export interface HeroDock {
  side: 'left' | 'right';
  /** Distance above its home spot (just over the tab bar), in CSS px. */
  lift: number;
  /** Pushed off the screen edge: only a small handle shows. */
  tucked: boolean;
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  kind: 'kill' | 'level' | 'loot' | 'skill' | 'info' | 'quest' | 'boss' | 'achievement' | 'party';
}
