// Conflict resolution for synced docs. Pure and deterministic: every device resolves the same
// inputs to the same result, whatever order they arrive in.
import type { Counter, Hero, Meta, SkillId } from '../core/types';

/** Days of activity history kept on the hero (matches the store's own cap). */
export const DAYS_KEPT = 400;

/**
 * Canonical JSON: sorted keys, undefined dropped, and a top-level `deleted: false` treated as absent.
 * Docs that are equal after a trip through Postgres jsonb (which reorders keys) encode identically.
 */
export function canon(v: unknown): string {
  return enc(v, true);
}

function enc(v: unknown, root: boolean): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
    return JSON.stringify(v) ?? 'null';
  }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : enc(x, false))).join(',')}]`;
  const parts: string[] = [];
  for (const k of Object.keys(v).sort()) {
    const x = (v as Record<string, unknown>)[k];
    if (x === undefined || typeof x === 'function' || (root && k === 'deleted' && !x)) continue;
    parts.push(`${JSON.stringify(k)}:${enc(x, false)}`);
  }
  return `{${parts.join(',')}}`;
}

export const sameDoc = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

const stamp = (d: Meta): number => (Number.isFinite(d.updatedAt) ? d.updatedAt : 0);

/** Last write wins by updatedAt; equal stamps fall back to comparing canonical content. */
export function newer<T extends Meta>(a: T, b: T): T {
  const ta = stamp(a);
  const tb = stamp(b);
  if (ta !== tb) return ta > tb ? a : b;
  return canon(b) > canon(a) ? b : a;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Grow-only counter join: per-key maximum. Also used for achievement tiers. */
export function mergeCounter(a: Counter | undefined, b: Counter | undefined): Counter {
  const out: Counter = {};
  for (const src of [a, b]) {
    if (!isObj(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      if (k === '__proto__') continue;
      const n = num(v);
      out[k] = Object.hasOwn(out, k) ? Math.max(out[k], n) : n;
    }
  }
  return out;
}

function mergeSkills(a: Hero['skillXp'] | undefined, b: Hero['skillXp'] | undefined): Hero['skillXp'] {
  const out: Hero['skillXp'] = {};
  const keys = new Set([...Object.keys(isObj(a) ? a : {}), ...Object.keys(isObj(b) ? b : {})]);
  for (const k of keys) {
    if (k === '__proto__') continue;
    const id = k as SkillId;
    out[id] = mergeCounter(a?.[id], b?.[id]);
  }
  return out;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Sorted set union, optionally keeping only the last `keep` entries (date keys sort chronologically). */
export function unionSorted(a: unknown, b: unknown, keep = Infinity): string[] {
  const all = [...new Set([...strings(a), ...strings(b)])].sort();
  return all.length > keep ? all.slice(all.length - keep) : all;
}

// Fields merged as a CRDT; everything else on the hero is last-write-wins as a block.
const HERO_CRDT_KEYS = [
  'xp', 'gold', 'goldSpent', 'kills', 'tasksDone', 'skillXp', 'bossesSlain', 'itemsFound', 'potionsUsed', 'questsCleared',
  'activeDays', 'savedDays', 'owned', 'achievements', 'bossIndex', 'bossDamage', 'bagSize', 'streakSaves', 'createdAt', 'updatedAt',
] as const;

function lwwPart(h: Hero): string {
  const o: Record<string, unknown> = { ...h };
  for (const k of HERO_CRDT_KEYS) delete o[k];
  return canon(o);
}

/** The side whose name/appearance/class/equipment/buffs/title win. */
function heroWinner(a: Hero, b: Hero): Hero {
  const ta = stamp(a);
  const tb = stamp(b);
  if (ta !== tb) return ta > tb ? a : b;
  return lwwPart(b) > lwwPart(a) ? b : a;
}

const finiteOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A hero's lineage id (its createdAt): saves of the same lineage merge, different ones replace each other. */
export const lineage = (h: Pick<Hero, 'createdAt'>): number => finiteOr(h.createdAt, 0);

/**
 * Hero CRDT join (commutative, associative, idempotent):
 * - progress counters: per-device max, so offline progress on every device adds up
 * - day lists / owned unlocks: set union (days sorted, last 400 kept); achievements: per-key max
 * - boss ladder: highest bossIndex wins and brings its damage (per-device max on a tie)
 * - bagSize, streakSaves: max; createdAt: min; updatedAt: max
 * - name, appearance, class, equipped, buffs, title, dyes: from the newer side
 */
export function mergeHero(a: Hero, b: Hero): Hero {
  const win = heroWinner(a, b);
  const ia = Math.max(1, finiteOr(a.bossIndex, 1));
  const ib = Math.max(1, finiteOr(b.bossIndex, 1));
  const bossDamage = ia === ib ? mergeCounter(a.bossDamage, b.bossDamage) : mergeCounter(ia > ib ? a.bossDamage : b.bossDamage, undefined);
  return {
    ...win,
    updatedAt: Math.max(stamp(a), stamp(b)),
    createdAt: Math.min(lineage(a), lineage(b)),
    xp: mergeCounter(a.xp, b.xp),
    gold: mergeCounter(a.gold, b.gold),
    goldSpent: mergeCounter(a.goldSpent, b.goldSpent),
    kills: mergeCounter(a.kills, b.kills),
    tasksDone: mergeCounter(a.tasksDone, b.tasksDone),
    skillXp: mergeSkills(a.skillXp, b.skillXp),
    bossesSlain: mergeCounter(a.bossesSlain, b.bossesSlain),
    itemsFound: mergeCounter(a.itemsFound, b.itemsFound),
    potionsUsed: mergeCounter(a.potionsUsed, b.potionsUsed),
    questsCleared: mergeCounter(a.questsCleared, b.questsCleared),
    activeDays: unionSorted(a.activeDays, b.activeDays, DAYS_KEPT),
    savedDays: unionSorted(a.savedDays, b.savedDays, DAYS_KEPT),
    owned: unionSorted(a.owned, b.owned),
    achievements: mergeCounter(a.achievements, b.achievements),
    bossIndex: Math.max(ia, ib),
    bossDamage,
    bagSize: Math.max(finiteOr(a.bagSize, 0), finiteOr(b.bagSize, 0)),
    streakSaves: Math.max(finiteOr(a.streakSaves, 0), finiteOr(b.streakSaves, 0)),
  };
}

/**
 * What the engine applies when a remote hero arrives. Heroes of the same lineage (same createdAt) merge
 * as a CRDT. A different lineage is a different save (a hero re-created, or "overwrite the cloud" chosen
 * on another device): the newest lineage replaces the other wholesale, even against later offline edits.
 */
export function resolveHero(local: Hero, remote: Hero): Hero {
  const cl = lineage(local);
  const cr = lineage(remote);
  if (cl === cr) return mergeHero(local, remote);
  return cr > cl ? remote : local;
}
