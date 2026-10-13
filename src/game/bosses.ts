// Infinite boss ladder: deterministic names and HP per index, plus the damage a completed task deals.
import { hashStr } from '../core/rng';
import { SLOTS } from '../core/types';
import type { Difficulty, Hero } from '../core/types';
import { MONSTER_BY_ID } from '../pixel/sprites/monsters';
import { basePower, bossChestRarity, familyOf, numeral, tierForIlvl } from './loot';
import { DIFFICULTY, sum } from './progression';

/*
 * Balance model (asserted in bosses.test.ts)
 * - damage per task = (10 + 3 * level) * difficulty mult * gear factor * (1 + boss% / 100) * (crit ? 2 : 1).
 * - The gear factor compares Power with expectedPower(level), a full Common/Uncommon kit of that item level:
 *   0.5x with no gear, 1x for a level-appropriate kit, approaching 2x for far better gear.
 * - Reference hero: completes Normal tasks, levels on the real XP curve, starts with a starter kit and grows into
 *   level-appropriate gear over the first ~15 bosses. HP(i) = bossTasks(i) * rank mult * that hero's damage per task
 *   at bossLevel(i), so HP depends on the index only.
 * - Targets: boss 1 takes ~10-14 Normal tasks with a starter kit at levels 1-3; regular bosses 20-100 take ~25-40
 *   with level-appropriate gear; milestone ranks add up to +25% but no boss needs more than ~45. XP and damage share
 *   the difficulty and crit multipliers, so the pace holds for any mix of task difficulties.
 * - Index 1e6 and beyond stays finite (HP is clamped to MAX_SAFE_INTEGER).
 */

const MAX = Number.MAX_SAFE_INTEGER;
const posInt = (n: number, min: number) => (Number.isFinite(n) ? Math.min(MAX, Math.max(min, Math.floor(n))) : min);
const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

// ---------------------------------------------------------------- ranks

export type BossRank = 'boss' | 'warlord' | 'calamity' | 'worldbreaker' | 'unmaker';

export interface BossRankDef {
  id: BossRank;
  label: string;
  every: number; // every Nth boss holds this rank (highest matching rank wins)
  hp: number; // HP multiplier over the design task count
  gold: number; // reward gold multiplier
}

/** Highest rank first. */
export const BOSS_RANKS: readonly BossRankDef[] = [
  { id: 'unmaker', label: 'Unmaker', every: 1000, hp: 1.25, gold: 8 },
  { id: 'worldbreaker', label: 'Worldbreaker', every: 100, hp: 1.2, gold: 5 },
  { id: 'calamity', label: 'Calamity', every: 50, hp: 1.15, gold: 3 },
  { id: 'warlord', label: 'Warlord', every: 10, hp: 1.1, gold: 1.75 },
  { id: 'boss', label: 'Boss', every: 1, hp: 1, gold: 1 },
];

export function bossRankDef(index: number): BossRankDef {
  const i = posInt(index, 1);
  return BOSS_RANKS.find((r) => i % r.every === 0) ?? BOSS_RANKS[BOSS_RANKS.length - 1];
}

export const bossRank = (index: number): BossRank => bossRankDef(index).id;

// ---------------------------------------------------------------- damage

/** ln 1.5, so a level-appropriate kit (ratio 1) gives exactly 1x. */
const GEAR_K = Math.log(1.5);

/** Power of a full Common/Uncommon kit at item level `level`: the "level-appropriate" baseline. */
export function expectedPower(level: number): number {
  const lv = posInt(level, 1);
  let p = 0;
  for (const slot of SLOTS) {
    const tier = tierForIlvl(familyOf(slot), lv);
    p += (basePower(slot, lv, 0, tier) + basePower(slot, lv, 1, tier)) / 2;
  }
  return Math.max(1, p);
}

/** 0.5 with no gear, 1 for a level-appropriate kit, approaching 2 for far better gear. */
export function gearFactor(power: number, level: number): number {
  return 2 - 1.5 * Math.exp((-GEAR_K * nonNeg(power)) / expectedPower(level));
}

/** Hit at `level` before difficulty, gear, boss% and crit; accepts fractional levels for the HP model. */
export const baseDamage = (level: number): number => 10 + 3 * Math.max(1, level);

export function damageForTask(opts: { difficulty: Difficulty; power: number; level: number; bossPct: number; crit: boolean }): number {
  const level = posInt(opts.level, 1);
  const mult = (DIFFICULTY[opts.difficulty] ?? DIFFICULTY[2]).mult;
  const raw = baseDamage(level) * mult * gearFactor(opts.power, level) * (1 + nonNeg(opts.bossPct) / 100) * (opts.crit ? 2 : 1);
  return Math.max(1, Math.min(MAX, Math.round(raw)));
}

// ---------------------------------------------------------------- HP model

const TASKS_START = 11.5; // boss 1, starter kit
const TASKS_END = 34; // asymptote with a level-appropriate kit
const TASKS_RAMP = 16; // bosses
const GEAR_START = 0.7; // gear factor of a typical starter kit around level 2
const GEAR_RAMP = 5; // bosses until the reference hero's kit is ~level-appropriate
const NORMAL = DIFFICULTY[2].mult;

/** Normal tasks the reference hero needs for boss `index`, before its rank multiplier. */
export function bossTasks(index: number): number {
  const i = posInt(index, 1);
  return TASKS_END - (TASKS_END - TASKS_START) * Math.exp(-(i - 1) / TASKS_RAMP);
}

/** Normal tasks the reference hero completes before reaching boss `index` (closed-form sum of bossTasks). */
function tasksBefore(index: number): number {
  const n = posInt(index, 1) - 1;
  const q = Math.exp(-1 / TASKS_RAMP);
  return n * TASKS_END - ((TASKS_END - TASKS_START) * (1 - Math.pow(q, n))) / (1 - q);
}

/**
 * Normal tasks needed to reach `level` from level 1: a continuous fit of progression.ts, where one level takes
 * xpToNext(l) / taskXp(l, Normal) = (6 + 4 * sqrt(l)) / 1.6 tasks (midpoint rule).
 */
export function tasksToLevel(level: number): number {
  const l = Math.max(1, level);
  return 3.75 * (l - 1) + (5 / 3) * (Math.pow(l - 0.5, 1.5) - Math.pow(0.5, 1.5));
}

/** Inverse of tasksToLevel (fractional level), by bisection. */
export function levelAfterTasks(tasks: number): number {
  const n = nonNeg(tasks);
  let lo = 1;
  let hi = Math.pow(0.6 * n + 2, 2 / 3) + 2;
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (tasksToLevel(mid) < n) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The reference hero's (fractional) level halfway through boss `index`. */
export function bossLevel(index: number): number {
  return levelAfterTasks(tasksBefore(index) + bossTasks(index) / 2);
}

function bossMaxHp(index: number): number {
  const i = posInt(index, 1);
  const gear = 1 - (1 - GEAR_START) * Math.exp(-(i - 1) / GEAR_RAMP);
  const perTask = baseDamage(bossLevel(i)) * NORMAL * gear;
  return Math.max(1, Math.min(MAX, Math.round(bossTasks(i) * bossRankDef(i).hp * perTask)));
}

// ---------------------------------------------------------------- names

const CORE_ARCHETYPES = ['slime', 'goblin', 'wolf', 'bat', 'skeleton', 'mushroom', 'crab', 'ghost', 'rat'];

// Name stems themed per archetype; every stem is unique so compound names never collide.
const STEMS: [string, string[]][] = [
  ['slime', ['Goo', 'Ooze', 'Gloop', 'Slop', 'Bog', 'Mire']],
  ['goblin', ['Snag', 'Grub', 'Knob', 'Wart', 'Grot', 'Scrap']],
  ['wolf', ['Howl', 'Grim', 'Moon', 'Shag', 'Snarl', 'Prowl']],
  ['bat', ['Flap', 'Dusk', 'Squeak', 'Night', 'Shriek', 'Vesper']],
  ['skeleton', ['Rattle', 'Marrow', 'Clatter', 'Grave', 'Crypt', 'Rib']],
  ['mushroom', ['Moss', 'Spore', 'Mildew', 'Truffle', 'Morel', 'Puff']],
  ['crab', ['Pinch', 'Shell', 'Brine', 'Clack', 'Tide', 'Barnacle']],
  ['ghost', ['Wail', 'Gloom', 'Mist', 'Murmur', 'Shroud', 'Hush']],
  ['rat', ['Whisker', 'Gnaw', 'Scurry', 'Nibble', 'Sewer', 'Cheddar']],
  ['spider', ['Silk', 'Skitter', 'Cobweb', 'Tangle', 'Venom', 'Lurk']],
  ['eye', ['Glare', 'Stare', 'Squint', 'Blink', 'Gaze', 'Leer']],
  ['golem', ['Rubble', 'Granite', 'Boulder', 'Clay', 'Crag', 'Pebble']],
  ['imp', ['Cinder', 'Smolder', 'Brimstone', 'Mischief', 'Ember', 'Snicker']],
  ['snake', ['Hiss', 'Coil', 'Slither', 'Sly', 'Asp', 'Viper']],
  ['scorpion', ['Sting', 'Dune', 'Barb', 'Scuttle', 'Sirocco', 'Dust']],
  ['frog', ['Croak', 'Ribbit', 'Lily', 'Puddle', 'Murk', 'Swamp']],
  ['wisp', ['Flicker', 'Glimmer', 'Lantern', 'Glow', 'Wane', 'Shimmer']],
  ['mimic', ['Lid', 'Hinge', 'Coffer', 'Latch', 'Trunk', 'Padlock']],
  ['yeti', ['Frost', 'Rime', 'Hail', 'Sleet', 'Shiver', 'Blizzard']],
  ['dragon', ['Scorch', 'Wyrm', 'Ash', 'Blaze', 'Char', 'Hoard']],
  ['beetle', ['Chitin', 'Dung', 'Burrow', 'Click', 'Husk', 'Scarab']],
];
const PAIRS: [archetype: string, stem: string][] = STEMS.flatMap(([id, stems]) => stems.map((s): [string, string] => [id, s]));

const TAILS = [
  'jaw', 'belly', 'bones', 'fang', 'tooth', 'maw', 'gut', 'tusk', 'claw', 'hide',
  'back', 'beard', 'brow', 'nose', 'tongue', 'grin', 'snout', 'skull', 'horn', 'knuckle',
  'toes', 'chin', 'rump', 'cheeks', 'gob', 'shanks', 'gizzard', 'wing', 'foot', 'tail',
];

// [honorific, regal]: regal ones may already carry a dynasty numeral on the first lap of the ladder
const HONORIFICS: [string, boolean][] = [
  ['Sir', true], ['Lady', true], ['Baron', true], ['Duchess', true], ['King', true],
  ['Queen', true], ['Count', true], ['Prince', true], ['Archduke', true], ['Empress', true],
  ['Mother', false], ['Old', false], ['Granny', false], ['Uncle', false], ['Big', false],
  ['Little', false], ['Captain', false], ['Mayor', false], ['Brother', false], ['Madame', false],
];

const EPITHETS = [
  'Unending', 'Unwashed', 'Overdue', 'Insatiable', 'Relentless', 'Procrastinator', 'Unbothered', 'Sleepless',
  'Many-Chinned', 'Petty', 'Magnificent', 'Moist', 'Bottomless', 'Unyielding', 'Lingering', 'Ever-Late',
  'Unfolded', 'Ravenous', 'Dreadful', 'Pungent', 'Undying', 'Belated', 'Smug', 'Uninvited',
  'Tardy', 'Grumbling', 'Untidy', 'Immovable', 'Forgotten', 'Wretched', 'Snoring', 'Bloated',
  'Accursed', 'Whispering', 'Restless', 'Sticky', 'Gloating', 'Half-Finished', 'Unread', 'Eternal',
];

const ROLES = [
  'Tyrant', 'Lurker', 'Hoarder', 'Keeper', 'Terror', 'Bane', 'Scourge',
  'Warden', 'Despot', 'Menace', 'Glutton', 'Squatter', 'Haunter', 'Gatekeeper',
];

const PLACES = [
  'the Sunken Mire', 'the Unwashed Dishes', 'the Overflowing Inbox', 'the Laundry Heap', 'the Dusty Attic',
  'the Forgotten Errands', 'the Unpaid Bills', 'the Endless Meeting', 'the Cluttered Desk', 'the Sock Abyss',
  'the Snooze Button', 'the Leaky Faucet', 'the Back of the Fridge', 'the Junk Drawer', 'the Tangled Cables',
  'the Unmade Bed', 'the Gloomy Cellar', 'the Mildewed Shower', 'the Crumbling Keep', 'the Ashen Wastes',
  'the Whispering Bog', 'the Shattered Peaks', 'the Hollow Moon', 'the Rusted Gate', 'the Long Monday',
  'the Last Minute', 'the Pending Pile', 'the Unread Scrolls', 'the Weedy Garden', 'the Overdue Library',
  'the Empty Pantry', 'the Lost Receipts', 'the Shadowed Stair', 'the Drafty Hall', 'the Bottomless Hamper',
];

// a few classic palettes, kept small so boss sprites cache well
const HUES = [0, 25, 50, 90, 140, 180, 210, 250, 290, 320];

const FORMS = HONORIFICS.length + EPITHETS.length;
/** Distinct base names per lap of the ladder; later laps add a generation numeral. */
export const BOSS_NAME_CYCLE = PAIRS.length * TAILS.length * FORMS;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
// multiplier of the affine permutation that scatters consecutive bosses across the name space
const STRIDE = (() => {
  let a = 1_000_003;
  while (gcd(a, BOSS_NAME_CYCLE) !== 1) a += 2;
  return a % BOSS_NAME_CYCLE;
})();

const encodeName = (pair: number, tail: number, form: number) => pair + PAIRS.length * (tail + TAILS.length * form);
// the ladder opens with Mother Mossbelly
const FIRST = encodeName(
  Math.max(0, PAIRS.findIndex(([, s]) => s === 'Moss')),
  Math.max(0, TAILS.indexOf('belly')),
  Math.max(0, HONORIFICS.findIndex(([h]) => h === 'Mother')),
);

const compound = (stem: string, tail: string) => (stem.endsWith(tail[0]) ? `${stem}-${tail}` : stem + tail);

function bossName(index: number): { name: string; archetype: string } {
  const j = (index - 1) % BOSS_NAME_CYCLE;
  const generation = Math.floor((index - 1) / BOSS_NAME_CYCLE);
  const code = (j * STRIDE + FIRST) % BOSS_NAME_CYCLE;
  const [archetype, stem] = PAIRS[code % PAIRS.length];
  const tail = TAILS[Math.floor(code / PAIRS.length) % TAILS.length];
  const form = Math.floor(code / (PAIRS.length * TAILS.length));
  const core = compound(stem, tail);
  let name: string;
  let regnal = generation + 1;
  if (form < HONORIFICS.length) {
    const [hon, regal] = HONORIFICS[form];
    name = `${hon} ${core}`;
    if (regal) regnal += hashStr(`boss-dynasty|${code}`) % 4;
  } else {
    name = `${core} the ${EPITHETS[form - HONORIFICS.length]}`;
  }
  if (regnal > 1) name += ` ${numeral(regnal)}`;
  return { name, archetype };
}

/** Archetype art for the boss; ids missing from the sprite table fall back to a core monster. */
function resolveArchetype(id: string, index: number): string {
  if (MONSTER_BY_ID[id]) return id;
  const core = CORE_ARCHETYPES.filter((c) => MONSTER_BY_ID[c]);
  return core.length ? core[hashStr(`boss-arch|${index}`) % core.length] : 'slime';
}

// ---------------------------------------------------------------- public API

export interface Boss {
  index: number; // 1-based ladder position
  name: string; // unique per index
  title: string; // flavor line, e.g. "Warlord of the Laundry Heap"
  archetype: string; // MONSTERS id
  hue: number; // palette rotation in degrees
  maxHp: number;
  rank: BossRank;
}

export function bossFor(index: number): Boss {
  const i = posInt(index, 1);
  const { name, archetype } = bossName(i);
  const rank = bossRankDef(i);
  const h = hashStr(`boss|${i}`);
  const place = PLACES[h % PLACES.length];
  const role = rank.id === 'boss' ? ROLES[(h >>> 8) % ROLES.length] : rank.label;
  return {
    index: i,
    name,
    title: `${role} of ${place}`,
    archetype: resolveArchetype(archetype, i),
    hue: i === 1 ? 0 : HUES[(h >>> 16) % HUES.length],
    maxHp: bossMaxHp(i),
    rank: rank.id,
  };
}

/** Gold scales with hero level (like task gold) and boss rank; chests: Epic, Legendary every 5th, Mythic every 25th, Divine every 100th. */
export function bossReward(index: number, level: number): { gold: number; chestMinRarity: 3 | 4 | 5 | 6 } {
  const gold = Math.min(MAX, Math.round((40 + 8 * posInt(level, 1)) * bossRankDef(index).gold));
  return { gold, chestMinRarity: Math.max(3, bossChestRarity(posInt(index, 1))) as 3 | 4 | 5 | 6 };
}

export function bossProgress(hero: Pick<Hero, 'bossIndex' | 'bossDamage'>): { boss: Boss; hp: number; dealt: number } {
  const boss = bossFor(hero.bossIndex);
  const dealt = Math.min(boss.maxHp, nonNeg(sum(hero.bossDamage)));
  return { boss, hp: boss.maxHp - dealt, dealt };
}
