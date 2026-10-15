// Pure reward pipeline for completing a task: stats -> XP/gold/crit -> loot -> boss -> achievements.
// The store applies the outcome; keeping this pure makes it testable and deterministic per seed.
import type { Counter, Hero, Item, LogEntry, PotionId, Task, TaskList } from '../core/types';
import { Rng } from '../core/rng';
import { dateKey, parseDateKey, streak, todayKey, type TimeCfg } from '../core/time';
import { heroLevel, heroSkill, sum, taskGold, taskXp } from '../game/progression';
import { SKILL_BY_ID, spawnMonster } from '../game/catalog';
import { applyBuffs, computeStats } from '../game/stats';
import { chestLoot, itemDisplayName, rollDrop, sellPrice } from '../game/loot';
import { potionName, tickBuffs } from '../game/potions';
import { bossFor, bossReward, damageForTask } from '../game/bosses';
import { achievementStatus } from '../game/achievements';
import { THEME_BY_ID } from '../pixel/themes';
import type { FxEvent } from './fx';

export interface RewardOutcome {
  hero: Hero;
  items: Item[]; // new items for the bag
  potions: { potion: PotionId; tier: number }[];
  events: FxEvent[];
  log: { kind: LogEntry['kind']; text: string }[];
}

/** Seeds are 32-bit hashes; salting ids with the drop time keeps two drops from ever sharing an id. */
const uniqueId = (item: Item, now: number, salt: string): Item => ({ ...item, id: `${item.id}-${now.toString(36)}${salt}` });

export const inc = (c: Counter | undefined, dev: string, n: number): Counter => ({ ...(c ?? {}), [dev]: ((c ?? {})[dev] ?? 0) + n });

/** Unequipped, non-deleted items count against the bag. */
export function bagCount(items: Record<string, Item>, hero: Hero): number {
  const eq = new Set(Object.values(hero.equipped));
  return Object.values(items).filter((i) => !i.deleted && !eq.has(i.id)).length;
}

/** Longest run of consecutive days in a set of day keys. */
export function bestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = parseDateKey(k);
    run = prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function streakDays(hero: Hero): string[] {
  return [...hero.activeDays, ...(hero.savedDays ?? [])];
}

/** Best streak ever: the stored record, or the best run still inside the (capped) day history. */
export function heroBestStreak(hero: Hero): number {
  return Math.max(hero.bestStreak ?? 0, bestStreak(streakDays(hero)));
}

export function achievementCtx(hero: Hero) {
  return { bestStreak: heroBestStreak(hero), level: heroLevel(hero).level };
}

/** Emit events for achievement tiers newly reached between two hero snapshots. */
export function achievementEvents(before: Hero, after: Hero): { events: FxEvent[]; log: RewardOutcome['log'] } {
  const a = new Map(achievementStatus(before, achievementCtx(before)).map((x) => [x.id, x.tierReached]));
  const events: FxEvent[] = [];
  const log: RewardOutcome['log'] = [];
  for (const s of achievementStatus(after, achievementCtx(after))) {
    if (s.tierReached > (a.get(s.id) ?? 0)) {
      events.push({ type: 'achievement', name: s.name, tier: s.tierReached });
      log.push({ kind: 'achievement', text: `Achievement: ${s.name} (tier ${s.tierReached}) — claim it on your Hero page!` });
    }
  }
  return { events, log };
}

/** Undead perk: one missed day per week is forgiven automatically. */
export function undeadSave(hero: Hero, now: number, cfg: TimeCfg): string[] {
  if (hero.appearance.race !== 'undead') return hero.savedDays ?? [];
  const days = new Set(streakDays(hero));
  const today = parseDateKey(todayKey(now, cfg));
  const back = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return dateKey(d);
  };
  const yesterday = back(1);
  if (days.has(yesterday) || !days.has(back(2))) return hero.savedDays ?? [];
  const recent = (hero.savedDays ?? []).some((k) => {
    const diff = (today.getTime() - parseDateKey(k).getTime()) / 86400000;
    return diff <= 7;
  });
  return recent ? hero.savedDays ?? [] : [...(hero.savedDays ?? []), yesterday].slice(-400);
}

export function addItemOrSell(
  hero: Hero,
  items: Record<string, Item>,
  pending: Item[],
  item: Item,
  dev: string,
): { hero: Hero; kept: boolean; soldFor: number } {
  if (bagCount(items, hero) + pending.length < hero.bagSize) return { hero, kept: true, soldFor: 0 };
  const g = sellPrice(item);
  return { hero: { ...hero, gold: inc(hero.gold, dev, g) }, kept: false, soldFor: g };
}

export function taskRewards(p: {
  hero: Hero;
  items: Record<string, Item>;
  task: Task;
  list: TaskList;
  dev: string;
  now: number;
  seed: number;
  cfg: TimeCfg;
}): RewardOutcome {
  const { task, list, dev, now, seed, cfg, items } = p;
  const before = p.hero;
  const rng = new Rng(seed);
  const { level } = heroLevel(before);
  const stats = applyBuffs(computeStats(before, items), before.buffs ?? []);
  const events: FxEvent[] = [];
  const log: RewardOutcome['log'] = [];
  const newItems: Item[] = [];
  const potions: RewardOutcome['potions'] = [];

  // ---- XP / gold / crit ----
  let xp = taskXp(level, task.difficulty) * (1 + stats.xp / 100);
  if (before.appearance.race === 'lizardfolk' && (task.repeat.kind === 'daily' || task.repeat.kind === 'days')) xp *= 1.2;
  let gold = taskGold(level, task.difficulty, rng.float()) * (1 + stats.gold / 100);
  const crit = rng.chance(stats.crit / 100);
  if (crit) {
    xp *= 2;
    gold *= 2;
  }
  xp = Math.max(1, Math.round(xp));
  gold = Math.max(1, Math.round(gold));
  const skillGain = Math.max(1, Math.round(xp * (1 + stats.skill / 100)));

  const theme = THEME_BY_ID[list.theme] ?? THEME_BY_ID.forest;
  const monster = spawnMonster(theme.monsters, theme.id, level, seed);
  const day = todayKey(now, cfg);
  const skillBefore = heroSkill(before, list.skill).level;

  let hero: Hero = {
    ...before,
    xp: inc(before.xp, dev, xp),
    gold: inc(before.gold, dev, gold),
    kills: inc(before.kills, dev, 1),
    tasksDone: inc(before.tasksDone, dev, 1),
    skillXp: { ...before.skillXp, [list.skill]: inc(before.skillXp[list.skill], dev, skillGain) },
    activeDays: before.activeDays.includes(day) ? before.activeDays : [...before.activeDays, day].slice(-400),
    buffs: tickBuffs(before.buffs ?? []),
    updatedAt: now,
  };
  hero = { ...hero, savedDays: undeadSave(hero, now, cfg) };
  hero = { ...hero, bestStreak: Math.max(before.bestStreak ?? 0, streak(streakDays(hero), now, cfg)) };
  events.push({ type: 'kill', monster, xp, gold, crit, theme: theme.id, listId: list.id });
  log.push({ kind: 'kill', text: `Slew a Lv${level} ${monster.name} — "${task.title}" (+${xp} XP, +${gold}g${crit ? ', CRIT!' : ''})` });

  // ---- loot ----
  const drop = rollDrop({ seed: (seed ^ 0x9e3779b9) >>> 0, level, stats, elite: monster.elite, now });
  if (drop.item) drop.item = uniqueId(drop.item, now, 'd');
  if (drop.item) {
    const r = addItemOrSell(hero, items, newItems, drop.item, dev);
    hero = { ...r.hero, itemsFound: inc(r.hero.itemsFound, dev, 1) };
    if (r.kept) newItems.push(drop.item);
    events.push({ type: 'loot', item: drop.item, soldFor: r.kept ? undefined : r.soldFor });
    log.push({ kind: 'loot', text: r.kept ? `Found ${itemDisplayName(drop.item)}!` : `Bag full — sold ${itemDisplayName(drop.item)} for ${r.soldFor}g.` });
  }
  if (drop.potion) {
    potions.push(drop.potion);
    events.push({ type: 'loot', potion: drop.potion });
    log.push({ kind: 'loot', text: `Found ${potionName(drop.potion.potion, drop.potion.tier)}.` });
  }

  // ---- boss ----
  const boss = bossFor(hero.bossIndex);
  const dmg = damageForTask({ difficulty: task.difficulty, power: stats.power, level, bossPct: stats.boss, crit });
  const dealt = sum(hero.bossDamage) + dmg;
  if (dealt >= boss.maxHp) {
    const reward = bossReward(boss.index, level);
    const chest = uniqueId(chestLoot({ seed: (seed * 31 + 7) >>> 0, level, stats, kind: 'boss', bossIndex: boss.index, now }), now, 'b');
    hero = {
      ...hero,
      bossIndex: hero.bossIndex + 1,
      bossDamage: {},
      bossesSlain: inc(hero.bossesSlain, dev, 1),
      gold: inc(hero.gold, dev, reward.gold),
    };
    const r = addItemOrSell(hero, items, newItems, chest, dev);
    hero = { ...r.hero, itemsFound: inc(r.hero.itemsFound, dev, 1) };
    if (r.kept) newItems.push(chest);
    events.push({ type: 'bossHit', damage: dmg, hp: 0, maxHp: boss.maxHp, crit });
    events.push({ type: 'bossDefeated', name: boss.name, index: boss.index, gold: reward.gold, item: chest });
    log.push({ kind: 'boss', text: `BOSS DEFEATED: ${boss.name}! +${reward.gold}g and ${itemDisplayName(chest)}${r.kept ? '' : ` (sold for ${r.soldFor}g, bag full)`}.` });
  } else {
    hero = { ...hero, bossDamage: inc(hero.bossDamage, dev, dmg) };
    events.push({ type: 'bossHit', damage: dmg, hp: boss.maxHp - dealt, maxHp: boss.maxHp, crit });
  }

  // ---- level / skill ups ----
  const after = heroLevel(hero).level;
  if (after > level) {
    events.push({ type: 'levelUp', level: after });
    log.push({ kind: 'level', text: `LEVEL UP! ${hero.name} reached level ${after}.` });
  }
  const skillAfter = heroSkill(hero, list.skill).level;
  if (skillAfter > skillBefore) {
    const sk = SKILL_BY_ID[list.skill];
    events.push({ type: 'skillUp', skill: sk.name, level: skillAfter });
    log.push({ kind: 'skill', text: `${sk.name} increased to ${skillAfter}.` });
  }

  const ach = achievementEvents(before, hero);
  events.push(...ach.events);
  log.push(...ach.log);
  return { hero, items: newItems, potions, events, log };
}

/** Bonus chest for clearing every task in a list for the current period. */
export function questChestRewards(p: { hero: Hero; items: Record<string, Item>; list: TaskList; dev: string; now: number; seed: number }): RewardOutcome {
  const { list, dev, now, seed, items } = p;
  const before = p.hero;
  const { level } = heroLevel(before);
  const stats = applyBuffs(computeStats(before, items), before.buffs ?? []);
  const gold = Math.round((5 + level * 2) * (1 + stats.gold / 100));
  const chest = uniqueId(chestLoot({ seed, level, stats, kind: 'quest', now }), now, 'q');
  let hero: Hero = { ...before, gold: inc(before.gold, dev, gold), questsCleared: inc(before.questsCleared, dev, 1), updatedAt: now };
  const r = addItemOrSell(hero, items, [], chest, dev);
  hero = { ...r.hero, itemsFound: inc(r.hero.itemsFound, dev, 1) };
  const events: FxEvent[] = [{ type: 'questComplete', listName: list.name, item: chest, gold }];
  const log: RewardOutcome['log'] = [
    { kind: 'quest', text: `QUEST COMPLETE: ${list.name}! Chest: ${gold}g and ${itemDisplayName(chest)}${r.kept ? '' : ` (sold for ${r.soldFor}g, bag full)`}.` },
  ];
  const ach = achievementEvents(before, hero);
  return { hero, items: r.kept ? [chest] : [], potions: [], events: [...events, ...ach.events], log: [...log, ...ach.log] };
}
