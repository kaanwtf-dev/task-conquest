// Infinite boss ladder: deterministic names and HP per index, plus the damage a completed task deals.
import { hashStr } from '../core/rng';
import { t, tk } from '../i18n';
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
  { id: 'unmaker', label: tk('Unmaker'), every: 1000, hp: 1.25, gold: 8 },
  { id: 'worldbreaker', label: tk('Worldbreaker'), every: 100, hp: 1.2, gold: 5 },
  { id: 'calamity', label: tk('Calamity'), every: 50, hp: 1.15, gold: 3 },
  { id: 'warlord', label: tk('Warlord'), every: 10, hp: 1.1, gold: 1.75 },
  { id: 'boss', label: tk('Boss'), every: 1, hp: 1, gold: 1 },
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
  ['slime', [tk('Goo'), tk('Ooze'), tk('Gloop'), tk('Slop'), tk('Bog'), tk('Mire')]],
  ['goblin', [tk('Snag'), tk('Grub'), tk('Sneak'), tk('Wart'), tk('Grot'), tk('Scrap')]],
  ['wolf', [tk('Howl'), tk('Grim'), tk('Moon'), tk('Ruff'), tk('Snarl'), tk('Prowl')]],
  ['bat', [tk('Flap'), tk('Dusk'), tk('Squeak'), tk('Night'), tk('Shriek'), tk('Vesper')]],
  ['skeleton', [tk('Rattle'), tk('Marrow'), tk('Clatter'), tk('Grave'), tk('Crypt'), tk('Rib')]],
  ['mushroom', [tk('Moss'), tk('Spore'), tk('Mildew'), tk('Truffle'), tk('Morel'), tk('Puff')]],
  ['crab', [tk('Pinch'), tk('Shell'), tk('Brine'), tk('Clack'), tk('Tide'), tk('Barnacle')]],
  ['ghost', [tk('Wail'), tk('Gloom'), tk('Mist'), tk('Murmur'), tk('Shroud'), tk('Hush')]],
  ['rat', [tk('Whisker'), tk('Gnaw'), tk('Scurry'), tk('Nibble'), tk('Sewer'), tk('Cheddar')]],
  ['spider', [tk('Silk'), tk('Skitter'), tk('Cobweb'), tk('Tangle'), tk('Venom'), tk('Lurk')]],
  ['eye', [tk('Glare'), tk('Stare'), tk('Squint'), tk('Blink'), tk('Gaze'), tk('Leer')]],
  ['golem', [tk('Rubble'), tk('Granite'), tk('Boulder'), tk('Clay'), tk('Crag'), tk('Pebble')]],
  ['imp', [tk('Cinder'), tk('Smolder'), tk('Brimstone'), tk('Mischief'), tk('Ember'), tk('Snicker')]],
  ['snake', [tk('Hiss'), tk('Coil'), tk('Slither'), tk('Sly'), tk('Asp'), tk('Viper')]],
  ['scorpion', [tk('Sting'), tk('Dune'), tk('Barb'), tk('Scuttle'), tk('Sirocco'), tk('Dust')]],
  ['frog', [tk('Croak'), tk('Ribbit'), tk('Lily'), tk('Puddle'), tk('Murk'), tk('Swamp')]],
  ['wisp', [tk('Flicker'), tk('Glimmer'), tk('Lantern'), tk('Glow'), tk('Wane'), tk('Shimmer')]],
  ['mimic', [tk('Lid'), tk('Hinge'), tk('Coffer'), tk('Latch'), tk('Trunk'), tk('Padlock')]],
  ['yeti', [tk('Frost'), tk('Rime'), tk('Hail'), tk('Sleet'), tk('Shiver'), tk('Blizzard')]],
  ['dragon', [tk('Scorch'), tk('Wyrm'), tk('Ash'), tk('Blaze'), tk('Char'), tk('Hoard')]],
  ['beetle', [tk('Chitin'), tk('Dung'), tk('Burrow'), tk('Click'), tk('Husk'), tk('Scarab')]],
];
const PAIRS: [archetype: string, stem: string][] = STEMS.flatMap(([id, stems]) => stems.map((s): [string, string] => [id, s]));

const TAILS = [
  tk('jaw'), tk('belly'), tk('bones'), tk('fang'), tk('tooth'), tk('maw'), tk('gut'), tk('tusk'), tk('claw'), tk('hide'),
  tk('back'), tk('beard'), tk('brow'), tk('nose'), tk('tongue'), tk('grin'), tk('snout'), tk('skull'), tk('horn'), tk('knuckle'),
  tk('toes'), tk('chin'), tk('rump'), tk('cheeks'), tk('gob'), tk('shanks'), tk('gizzard'), tk('wing'), tk('foot'), tk('tail'),
];

// [name template, regal]: regal ones may already carry a dynasty numeral on the first lap of the ladder
const HONORIFICS: [string, boolean][] = [
  [tk('Sir {name}'), true], [tk('Lady {name}'), true], [tk('Baron {name}'), true], [tk('Duchess {name}'), true], [tk('King {name}'), true],
  [tk('Queen {name}'), true], [tk('Count {name}'), true], [tk('Prince {name}'), true], [tk('Archduke {name}'), true], [tk('Empress {name}'), true],
  [tk('Mother {name}'), false], [tk('Old {name}'), false], [tk('Granny {name}'), false], [tk('Uncle {name}'), false], [tk('Big {name}'), false],
  [tk('Little {name}'), false], [tk('Captain {name}'), false], [tk('Mayor {name}'), false], [tk('Brother {name}'), false], [tk('Madame {name}'), false],
];

const EPITHETS = [
  tk('{name} the Unending'), tk('{name} the Unwashed'), tk('{name} the Overdue'), tk('{name} the Insatiable'), tk('{name} the Relentless'), tk('{name} the Procrastinator'), tk('{name} the Unbothered'), tk('{name} the Sleepless'),
  tk('{name} the Many-Chinned'), tk('{name} the Petty'), tk('{name} the Magnificent'), tk('{name} the Moist'), tk('{name} the Bottomless'), tk('{name} the Unyielding'), tk('{name} the Lingering'), tk('{name} the Ever-Late'),
  tk('{name} the Unfolded'), tk('{name} the Ravenous'), tk('{name} the Dreadful'), tk('{name} the Pungent'), tk('{name} the Undying'), tk('{name} the Belated'), tk('{name} the Smug'), tk('{name} the Uninvited'),
  tk('{name} the Tardy'), tk('{name} the Grumbling'), tk('{name} the Untidy'), tk('{name} the Immovable'), tk('{name} the Forgotten'), tk('{name} the Wretched'), tk('{name} the Snoring'), tk('{name} the Bloated'),
  tk('{name} the Accursed'), tk('{name} the Whispering'), tk('{name} the Restless'), tk('{name} the Sticky'), tk('{name} the Gloating'), tk('{name} the Half-Finished'), tk('{name} the Unread'), tk('{name} the Eternal'),
];

const ROLES = [
  tk('Tyrant of {place}'), tk('Lurker of {place}'), tk('Hoarder of {place}'), tk('Keeper of {place}'), tk('Terror of {place}'), tk('Bane of {place}'), tk('Scourge of {place}'),
  tk('Warden of {place}'), tk('Despot of {place}'), tk('Menace of {place}'), tk('Glutton of {place}'), tk('Squatter of {place}'), tk('Haunter of {place}'), tk('Gatekeeper of {place}'),
];

/** Titles of the milestone ranks ("Warlord of the Laundry Heap"). */
const RANK_ROLES: Record<Exclude<BossRank, 'boss'>, string> = {
  warlord: tk('Warlord of {place}'),
  calamity: tk('Calamity of {place}'),
  worldbreaker: tk('Worldbreaker of {place}'),
  unmaker: tk('Unmaker of {place}'),
};

const PLACES = [
  tk('the Sunken Mire'), tk('the Unwashed Dishes'), tk('the Overflowing Inbox'), tk('the Laundry Heap'), tk('the Dusty Attic'),
  tk('the Forgotten Errands'), tk('the Unpaid Bills'), tk('the Endless Meeting'), tk('the Cluttered Desk'), tk('the Sock Abyss'),
  tk('the Snooze Button'), tk('the Leaky Faucet'), tk('the Back of the Fridge'), tk('the Junk Drawer'), tk('the Tangled Cables'),
  tk('the Unmade Bed'), tk('the Gloomy Cellar'), tk('the Mildewed Shower'), tk('the Crumbling Keep'), tk('the Ashen Wastes'),
  tk('the Whispering Bog'), tk('the Shattered Peaks'), tk('the Hollow Moon'), tk('the Rusted Gate'), tk('the Long Monday'),
  tk('the Last Minute'), tk('the Pending Pile'), tk('the Unread Scrolls'), tk('the Weedy Garden'), tk('the Overdue Library'),
  tk('the Empty Pantry'), tk('the Lost Receipts'), tk('the Shadowed Stair'), tk('the Drafty Hall'), tk('the Bottomless Hamper'),
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
  Math.max(0, HONORIFICS.findIndex(([h]) => h === 'Mother {name}')),
);

const compound = (stem: string, tail: string) => (stem.endsWith(tail[0]) ? `${stem}-${tail}` : stem + tail);

/** In the player's language: stems and tails are translated too ("Mossbelly"), so names make sense in Turkish. */
function nameParts(index: number): { name: string; archetype: string } {
  const j = (index - 1) % BOSS_NAME_CYCLE;
  const generation = Math.floor((index - 1) / BOSS_NAME_CYCLE);
  const code = (j * STRIDE + FIRST) % BOSS_NAME_CYCLE;
  const [archetype, stem] = PAIRS[code % PAIRS.length];
  const tail = TAILS[Math.floor(code / PAIRS.length) % TAILS.length];
  const form = Math.floor(code / (PAIRS.length * TAILS.length));
  const core = compound(t(stem), t(tail));
  let name: string;
  let regnal = generation + 1;
  if (form < HONORIFICS.length) {
    const [hon, regal] = HONORIFICS[form];
    name = t(hon, { name: core });
    if (regal) regnal += hashStr(`boss-dynasty|${code}`) % 4;
  } else {
    name = t(EPITHETS[form - HONORIFICS.length], { name: core });
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
  name: string; // unique per index (in English), in the player's language
  title: string; // flavor line, e.g. "Warlord of the Laundry Heap", in the player's language
  archetype: string; // MONSTERS id
  hue: number; // palette rotation in degrees
  maxHp: number;
  rank: BossRank;
}

export function bossFor(index: number): Boss {
  const i = posInt(index, 1);
  const { name, archetype } = nameParts(i);
  const rank = bossRankDef(i);
  const h = hashStr(`boss|${i}`);
  const place = PLACES[h % PLACES.length];
  const role = rank.id === 'boss' ? ROLES[(h >>> 8) % ROLES.length] : RANK_ROLES[rank.id];
  return {
    index: i,
    name,
    title: t(role, { place: t(place) }),
    archetype: resolveArchetype(archetype, i),
    hue: i === 1 ? 0 : HUES[(h >>> 16) % HUES.length],
    maxHp: bossMaxHp(i),
    rank: rank.id,
  };
}

/** Just the name (cheap: no HP model). */
export const bossName = (index: number): string => nameParts(posInt(index, 1)).name;

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
