import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClassId, Difficulty, Hero, Item, ListType, LogEntry, PotionId, PotionStack, Repeat, Settings, SkillId, Slot, Task, TaskList,
} from '../core/types';
import type { TimeCfg } from '../core/time';
import type { Appearance } from '../pixel/sprites/hero';
import type { ThemeId } from '../pixel/themes';
import { dateKey, isActiveToday, isDone, parseDateKey, periodKey, todayKey } from '../core/time';
import { heroLevel, sum } from '../game/progression';
import { guessAisle } from '../pixel/keywords';
import { hashStr } from '../core/rng';
import { itemDisplayName, sellPrice, starterItems, upgradeCost } from '../game/loot';
import { makeBuff, potionName, potionStackId } from '../game/potions';
import { applyBuffs, computeStats } from '../game/stats';
import { claimRewards } from '../game/achievements';
import { BAG_MAX, BAG_STEP, dyeKey, themeKey, type ShopOffer } from '../game/shop';
import { fx } from './fx';
import { achievementCtx, bagCount, inc, questChestRewards, streakDays, taskRewards, type RewardOutcome } from './rewards';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type Tab = 'quests' | 'hero' | 'shop' | 'party' | 'settings';

/** Pseudo-list id for the cross-list "Today" view. */
export const TODAY_ID = '__today';

export const DEFAULT_SETTINGS: Settings = {
  // players who asked their device for less motion start with battle animations off (they can turn them on)
  anim: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'full',
  sfx: 0.6,
  music: 0,
  haptics: true,
  dayStartHour: 0,
  weekStart: 1,
  taskFont: 'pixel',
  cornerHero: 'big',
  introSeen: false,
};

/** Fields added after v1; also used to upgrade older saves. */
export function heroDefaults(): Pick<
  Hero,
  'equipped' | 'buffs' | 'bagSize' | 'bossIndex' | 'bossDamage' | 'bossesSlain' | 'itemsFound' | 'potionsUsed' | 'questsCleared' | 'achievements' | 'owned' | 'streakSaves' | 'savedDays'
> {
  return {
    equipped: {}, buffs: [], bagSize: 24, bossIndex: 1, bossDamage: {}, bossesSlain: {}, itemsFound: {},
    potionsUsed: {}, questsCleared: {}, achievements: {}, owned: [], streakSaves: 0, savedDays: [],
  };
}

export const LIST_TYPE_INFO: Record<ListType, { label: string; repeat: Repeat; hint: string }> = {
  daily: { label: 'Daily', repeat: { kind: 'daily' }, hint: 'Resets every day' },
  weekly: { label: 'Weekly', repeat: { kind: 'weekly' }, hint: 'Resets every week' },
  quests: { label: 'Quests', repeat: { kind: 'none' }, hint: 'No time limit' },
  supply: { label: 'Supply', repeat: { kind: 'none' }, hint: 'Remembers items, restock anytime' },
  custom: { label: 'Custom', repeat: { kind: 'none' }, hint: 'Set repeat per task' },
};

/**
 * When a task's period definition changes (its repeat, or the day/week start settings), carry its
 * completion into the new period instead of silently reopening it — reopening would let a task pay
 * out again (and would make honest users redo work).
 */
export function remapPeriod(task: Task, oldRepeat: Repeat, oldCfg: TimeCfg, newRepeat: Repeat, newCfg: TimeCfg, now: number): Partial<Task> {
  const oldPk = periodKey(oldRepeat, now, oldCfg);
  const newPk = periodKey(newRepeat, now, newCfg);
  const patch: Partial<Task> = {};
  if (oldPk === newPk) return patch;
  if (task.doneFor === oldPk) patch.doneFor = newPk;
  if (task.rewardedFor === oldPk) patch.rewardedFor = newPk;
  // supply items are rewarded once per logical day
  const oldDay = `s${todayKey(now, oldCfg)}`;
  if (task.rewardedFor === oldDay) patch.rewardedFor = `s${todayKey(now, newCfg)}`;
  return patch;
}

/** One quest chest per list per period; lists without a cadence get one per day. */
function chestPeriod(list: TaskList, now: number, cfg: TimeCfg): string {
  const r = LIST_TYPE_INFO[list.type].repeat;
  return r.kind === 'none' ? `d${todayKey(now, cfg)}` : periodKey(r, now, cfg);
}

/**
 * A list someone else owns that we joined: we can leave it, never delete it for the whole party.
 * Without a known account (a device that never synced) nothing counts as foreign.
 */
export const isForeignList = (list: TaskList, accountId: string | null): boolean => !!accountId && !!list.ownerId && list.ownerId !== accountId;

/** Set by the sync layer. */
export const syncHooks: {
  /** We left a party list: tell the server (now, or once back online). */
  leave?: (listId: string) => void;
  /** Start over dropped the hero of this lineage: delete it in the cloud as well. */
  heroReset?: (lineage: number) => void;
} = {};

/** Before the store remembered its account, the sync layer kept the last synced user here. */
const LEGACY_LAST_USER_KEY = 'questlog-sync-last-user';

export interface State {
  deviceId: string;
  /** Account this device's data belongs to (set when it syncs); null if it never has. */
  accountId: string | null;
  hero: Hero | null;
  lists: Record<string, TaskList>;
  tasks: Record<string, Task>;
  items: Record<string, Item>;
  potions: Record<string, PotionStack>;
  settings: Settings;
  log: LogEntry[];
  tab: Tab;
  activeListId: string | null;
  shopDay: { date: string; bought: string[] };

  createHero(name: string, appearance: Appearance, classId: ClassId): void;
  setTab(t: Tab): void;
  setActiveList(id: string): void;
  addList(p: { name: string; type: ListType; theme: ThemeId; skill: SkillId; icon?: string; color?: string }): string;
  updateList(id: string, patch: Partial<TaskList>): void;
  deleteList(id: string): void;
  /** Leave a joined party list: removed from this device only, the party keeps it. */
  leaveList(id: string): void;
  addTask(listId: string, title: string, extra?: Partial<Task>): string | null;
  updateTask(id: string, patch: Partial<Task>): void;
  deleteTask(id: string): void;
  toggleTask(id: string): void;
  restockStaples(listId: string): number;
  reorderTasks(orderedIds: string[]): void;
  reorderLists(orderedIds: string[]): void;
  moveTask(id: string, listId: string): void;
  updateSettings(patch: Partial<Settings>): void;
  // hero & loot
  equip(itemId: string): void;
  unequip(slot: Slot): void;
  sellItem(itemId: string): number;
  toggleLock(itemId: string): void;
  upgradeItem(itemId: string): boolean;
  usePotion(stackId: string): boolean;
  buyOffer(offer: ShopOffer): boolean;
  claimAchievements(): { gold: number; newTitles: string[] };
  setTitle(title: string | undefined): void;
  updateHero(patch: Partial<Pick<Hero, 'name' | 'appearance' | 'capeDye'>>): void;
  exportData(): string;
  importData(json: string): boolean;
  resetAll(): void;
}

const now = () => Date.now();

function seedLists(): { lists: Record<string, TaskList>; tasks: Record<string, Task> } {
  const t = now();
  const mk = (name: string, type: ListType, theme: ThemeId, skill: SkillId, icon: string, color: string, order: number): TaskList => ({
    id: uid(), name, type, theme, skill, icon, color, order, createdAt: t, updatedAt: t,
  });
  const daily = mk('Daily Quests', 'daily', 'forest', 'restoration', '☀️', '#6abe30', 0);
  const weekly = mk('Weekly Quests', 'weekly', 'dungeon', 'hearthcraft', '📅', '#5b6ee1', 1);
  const side = mk('Side Quests', 'quests', 'beach', 'smithing', '⚔️', '#df7126', 2);
  const groceries = mk('Groceries', 'supply', 'tavern', 'mercantile', '🛒', '#d9a066', 3);
  const lists = Object.fromEntries([daily, weekly, side, groceries].map((l) => [l.id, l]));
  const tasks: Record<string, Task> = {};
  let order = 0;
  const add = (l: TaskList, title: string, difficulty: Difficulty, extra: Partial<Task> = {}) => {
    const task: Task = {
      id: uid(), listId: l.id, title, difficulty, repeat: LIST_TYPE_INFO[l.type].repeat,
      order: order++, createdAt: t, updatedAt: t, timesDone: 0, ...extra,
    };
    if (l.type === 'supply') task.aisle = guessAisle(title);
    tasks[task.id] = task;
  };
  add(daily, 'Brush teeth', 0);
  add(daily, 'Drink water', 1);
  add(daily, 'Workout', 3);
  add(daily, 'Read 20 pages', 2);
  add(weekly, 'Laundry', 2);
  add(weekly, 'Clean the kitchen', 2);
  add(weekly, 'Call mom', 1);
  add(side, 'Fix the bike', 3);
  add(side, 'Book dentist appointment', 1);
  for (const g of ['Milk', 'Eggs', 'Bread', 'Bananas', 'Coffee']) add(groceries, g, 0, { staple: true });
  for (const g of ['Chicken', 'Avocado', 'Toilet paper', 'Pasta', 'Cheese'])
    add(groceries, g, 0, { doneFor: 'once', rewardedFor: 'once', timesDone: 1 });
  return { lists, tasks };
}

/** Starter kit for a class, equipped. */
function starterKit(classId: ClassId, t: number): { items: Record<string, Item>; equipped: Hero['equipped'] } {
  const kit = starterItems(classId, t);
  return {
    items: Object.fromEntries(kit.map((i) => [i.id, i])),
    equipped: Object.fromEntries(kit.map((i) => [i.slot, i.id])) as Hero['equipped'],
  };
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const log = (kind: LogEntry['kind'], text: string) =>
        set((s) => ({ log: [{ id: uid(), at: now(), text, kind }, ...s.log].slice(0, 200) }));

      /** Apply a pure reward outcome: hero, new loot, potions, log lines, then fire effects. */
      const apply = (o: RewardOutcome) => {
        const t = now();
        set((s) => {
          const items = { ...s.items };
          for (const it of o.items) items[it.id] = { ...it, updatedAt: t };
          const potions = { ...s.potions };
          for (const p of o.potions) {
            const id = potionStackId(p.potion, p.tier);
            const cur = potions[id];
            potions[id] = { id, potion: p.potion, tier: p.tier, count: (cur && !cur.deleted ? cur.count : 0) + 1, updatedAt: t };
          }
          const entries = o.log.map((l, i) => ({ id: uid(), at: t + i, ...l })).reverse();
          return { hero: o.hero, items, potions, log: [...entries, ...s.log].slice(0, 200) };
        });
        o.events.forEach((e) => fx.emit(e));
      };

      const spend = (amount: number): boolean => {
        const hero = get().hero;
        if (!hero || amount < 0) return false;
        if (sum(hero.gold) - sum(hero.goldSpent) < amount) {
          fx.emit({ type: 'toast', text: 'Not enough gold!' });
          return false;
        }
        set({ hero: { ...hero, goldSpent: inc(hero.goldSpent, get().deviceId, amount), updatedAt: now() } });
        return true;
      };

      const patchItem = (id: string, patch: Partial<Item>) =>
        set((s) => ({ items: { ...s.items, [id]: { ...s.items[id], ...patch, updatedAt: now() } } }));

      return {
        deviceId: uid(),
        accountId: null,
        hero: null,
        lists: {},
        tasks: {},
        items: {},
        potions: {},
        settings: DEFAULT_SETTINGS,
        log: [],
        tab: 'quests',
        activeListId: null,
        shopDay: { date: '', bought: [] },

        createHero(name, appearance, classId) {
          const t = now();
          const kit = starterKit(classId, t);
          const hero: Hero = {
            id: 'hero', name: name.trim() || 'Hero', appearance, classId,
            xp: {}, gold: {}, goldSpent: {}, kills: {}, tasksDone: {}, skillXp: {}, activeDays: [],
            createdAt: t, updatedAt: t, ...heroDefaults(), equipped: kit.equipped,
          };
          // keep tombstones (they still need to sync); only seed when no live list exists
          const hasLive = Object.values(get().lists).some((l) => !l.deleted);
          const seeded = hasLive
            ? { lists: get().lists, tasks: get().tasks }
            : (() => {
                const fresh = seedLists();
                return { lists: { ...get().lists, ...fresh.lists }, tasks: { ...get().tasks, ...fresh.tasks } };
              })();
          const first = Object.values(seeded.lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order)[0];
          set((s) => ({ hero, ...seeded, items: { ...s.items, ...kit.items }, activeListId: first?.id ?? null, tab: 'quests' }));
          log('info', `${hero.name} sets out on an adventure!`);
        },

        setTab: (tab) => set({ tab }),
        setActiveList: (id) => set({ activeListId: id, tab: 'quests' }),

        addList(p) {
          const t = now();
          const order = Math.max(-1, ...Object.values(get().lists).filter((l) => !l.deleted).map((l) => l.order)) + 1;
          const list: TaskList = {
            id: uid(), name: p.name.trim() || 'New List', type: p.type, theme: p.theme, skill: p.skill,
            icon: p.icon, color: p.color ?? '#5b6ee1', order, createdAt: t, updatedAt: t,
          };
          set((s) => ({ lists: { ...s.lists, [list.id]: list }, activeListId: list.id }));
          return list.id;
        },

        updateList(id, patch) {
          if (!get().lists[id]) return;
          set((s) => ({ lists: { ...s.lists, [id]: { ...s.lists[id], ...patch, updatedAt: now() } } }));
        },

        deleteList(id) {
          const list = get().lists[id];
          if (!list) return;
          if (isForeignList(list, get().accountId)) return get().leaveList(id);
          const t = now();
          set((s) => {
            const lists = { ...s.lists, [id]: { ...s.lists[id], deleted: true, updatedAt: t } };
            const tasks = { ...s.tasks };
            for (const tk of Object.values(tasks)) if (tk.listId === id && !tk.deleted) tasks[tk.id] = { ...tk, deleted: true, updatedAt: t };
            const next = Object.values(lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order)[0];
            return { lists, tasks, activeListId: s.activeListId === id ? next?.id ?? null : s.activeListId };
          });
        },

        addTask(listId, title, extra = {}) {
          const list = get().lists[listId];
          const clean = title.trim();
          if (!list || list.deleted || !clean) return null;
          // supply lists remember items: re-adding a known item just puts it back on the list
          if (list.type === 'supply') {
            const known = Object.values(get().tasks).find(
              (t) => t.listId === listId && !t.deleted && t.title.toLowerCase() === clean.toLowerCase(),
            );
            if (known) {
              get().updateTask(known.id, { doneFor: null, ...extra });
              return known.id;
            }
          }
          const t = now();
          const order = Math.min(0, ...Object.values(get().tasks).filter((x) => x.listId === listId && !x.deleted).map((x) => x.order)) - 1;
          const task: Task = {
            id: uid(), listId, title: clean, difficulty: list.type === 'supply' ? 0 : 2,
            repeat: LIST_TYPE_INFO[list.type].repeat, order, createdAt: t, updatedAt: t, timesDone: 0,
            createdBy: get().hero?.name,
            ...(list.type === 'supply' ? { aisle: guessAisle(clean) } : {}),
            ...extra,
          };
          set((s) => ({ tasks: { ...s.tasks, [task.id]: task } }));
          return task.id;
        },

        updateTask(id, patch) {
          const cur = get().tasks[id];
          if (!cur) return;
          let full = patch;
          if (patch.repeat && JSON.stringify(patch.repeat) !== JSON.stringify(cur.repeat) && !('doneFor' in patch)) {
            const cfg = get().settings;
            full = { ...remapPeriod(cur, cur.repeat, cfg, patch.repeat, cfg, now()), ...patch };
          }
          set((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...full, updatedAt: now() } } }));
        },

        deleteTask(id) {
          get().updateTask(id, { deleted: true });
        },

        toggleTask(id) {
          const s = get();
          const task = s.tasks[id];
          const hero = s.hero;
          if (!task || task.deleted || !hero) return;
          const cfg = s.settings;
          const t = now();
          const pk = periodKey(task.repeat, t, cfg);
          if (isDone(task, t, cfg)) {
            s.updateTask(id, { doneFor: null });
            return;
          }
          const list = s.lists[task.listId];
          // re-checking within the same period never pays out twice (no farming by toggling);
          // supply items can be bought again any time but pay out at most once per logical day
          const rewardKey = list?.type === 'supply' ? `s${todayKey(t, cfg)}` : pk;
          const alreadyRewarded = task.rewardedFor === rewardKey;
          s.updateTask(id, { doneFor: pk, rewardedFor: rewardKey, doneAt: t, timesDone: task.timesDone + 1, doneBy: hero.name });
          if (alreadyRewarded || !list) return;

          const seed = hashStr(`${id}:${pk}:${t}:${s.deviceId}`);
          apply(taskRewards({ hero, items: s.items, task, list, dev: s.deviceId, now: t, seed, cfg }));

          // whole list cleared for this period -> quest chest
          if (list.type !== 'supply') {
            const all = Object.values(get().tasks).filter((x) => x.listId === list.id && !x.deleted && isActiveToday(x, t, cfg));
            const chestKey = chestPeriod(list, t, cfg);
            if (all.length >= 2 && all.every((x) => isDone(x, t, cfg)) && list.chestFor !== chestKey) {
              get().updateList(list.id, { chestFor: chestKey });
              const st = get();
              apply(questChestRewards({ hero: st.hero!, items: st.items, list, dev: st.deviceId, now: t, seed: hashStr(`chest:${list.id}:${pk}:${t}:${st.deviceId}`) }));
            }
          }
        },

        restockStaples(listId) {
          let n = 0;
          for (const tk of Object.values(get().tasks))
            if (tk.listId === listId && !tk.deleted && tk.staple && tk.doneFor) {
              get().updateTask(tk.id, { doneFor: null });
              n++;
            }
          return n;
        },

        reorderTasks(orderedIds) {
          const t = now();
          set((s) => {
            const tasks = { ...s.tasks };
            orderedIds.forEach((id, i) => {
              if (tasks[id] && tasks[id].order !== i) tasks[id] = { ...tasks[id], order: i, updatedAt: t };
            });
            return { tasks };
          });
        },

        reorderLists(orderedIds) {
          const t = now();
          set((s) => {
            const lists = { ...s.lists };
            orderedIds.forEach((id, i) => {
              if (lists[id] && lists[id].order !== i) lists[id] = { ...lists[id], order: i, updatedAt: t };
            });
            return { lists };
          });
        },

        moveTask(id, listId) {
          const task = get().tasks[id];
          const list = get().lists[listId];
          const from = task ? get().lists[task.listId] : undefined;
          if (!task || !list || task.listId === listId) return;
          const order = Math.min(0, ...Object.values(get().tasks).filter((x) => x.listId === listId && !x.deleted).map((x) => x.order)) - 1;
          const patch: Partial<Task> = { listId, order };
          if (list.type === 'supply') patch.aisle = task.aisle ?? guessAisle(task.title);
          if (from?.shared || list.shared) {
            // crossing a sharing boundary: party members must see it disappear, so move = copy + tombstone
            const t = now();
            const copy: Task = { ...task, ...patch, id: uid(), createdAt: t, updatedAt: t };
            set((s) => ({ tasks: { ...s.tasks, [copy.id]: copy, [id]: { ...task, deleted: true, updatedAt: t } } }));
            return;
          }
          get().updateTask(id, patch);
        },

        updateSettings(patch) {
          const prev = get().settings;
          const next = { ...prev, ...patch };
          if (next.dayStartHour !== prev.dayStartHour || next.weekStart !== prev.weekStart) {
            const t = now();
            const tasks = { ...get().tasks };
            for (const tk of Object.values(tasks)) {
              if (tk.deleted) continue;
              const p = remapPeriod(tk, tk.repeat, prev, tk.repeat, next, t);
              if (Object.keys(p).length) tasks[tk.id] = { ...tk, ...p, updatedAt: t };
            }
            set({ settings: next, tasks });
            return;
          }
          set({ settings: next });
        },

        // ------------------------------------------------------------ hero & loot

        equip(itemId) {
          const { hero, items } = get();
          const item = items[itemId];
          if (!hero || !item || item.deleted) return;
          set({ hero: { ...hero, equipped: { ...hero.equipped, [item.slot]: item.id }, updatedAt: now() } });
        },

        unequip(slot) {
          const hero = get().hero;
          if (!hero || !hero.equipped[slot]) return;
          const equipped = { ...hero.equipped };
          delete equipped[slot];
          set({ hero: { ...hero, equipped, updatedAt: now() } });
        },

        sellItem(itemId) {
          const { hero, items, deviceId } = get();
          const item = items[itemId];
          if (!hero || !item || item.deleted || item.locked || Object.values(hero.equipped).includes(itemId)) return 0;
          const g = sellPrice(item);
          set({ hero: { ...hero, gold: inc(hero.gold, deviceId, g), updatedAt: now() } });
          patchItem(itemId, { deleted: true });
          log('loot', `Sold ${itemDisplayName(item)} for ${g}g.`);
          return g;
        },

        toggleLock(itemId) {
          const item = get().items[itemId];
          if (item) patchItem(itemId, { locked: !item.locked });
        },

        upgradeItem(itemId) {
          const item = get().items[itemId];
          if (!item || item.deleted) return false;
          if (!spend(upgradeCost(item))) return false;
          patchItem(itemId, { upgrade: item.upgrade + 1 });
          log('loot', `The blacksmith upgraded ${itemDisplayName({ ...item, upgrade: item.upgrade + 1 })}.`);
          return true;
        },

        usePotion(stackId) {
          const { hero, potions, items, settings, deviceId } = get();
          const stack = potions[stackId];
          if (!hero || !stack || stack.deleted || stack.count <= 0) return false;
          const t = now();
          let next: Hero = { ...hero, potionsUsed: inc(hero.potionsUsed, deviceId, 1), updatedAt: t };
          if (stack.potion === 'phoenix') {
            // fill the gap since the last active day (up to a week) so the streak survives
            const days = new Set(streakDays(hero));
            const today = parseDateKey(todayKey(t, settings));
            const missing: string[] = [];
            for (let back = 1; back <= 7; back++) {
              const d = new Date(today);
              d.setDate(d.getDate() - back);
              const k = dateKey(d);
              if (days.has(k)) break;
              missing.push(k);
            }
            const hadStreakBefore = missing.length < 7 && missing.length > 0;
            if (!hadStreakBefore) {
              fx.emit({ type: 'toast', text: missing.length === 0 ? 'Your streak is not broken!' : 'No streak to save.' });
              return false;
            }
            next = { ...next, savedDays: [...(hero.savedDays ?? []), ...missing].slice(-400), streakSaves: (hero.streakSaves ?? 0) + 1 };
            fx.emit({ type: 'toast', text: 'STREAK RESTORED!', small: 'The phoenix feather bursts into flame.' });
          } else {
            const stats = applyBuffs(computeStats(hero, items), hero.buffs ?? []);
            const buff = makeBuff(stack.potion, stack.tier, stats.potion, uid());
            // same potion AND tier extends the buff; a different tier runs as its own buff
            const same = (hero.buffs ?? []).find((b) => b.potion === stack.potion && b.tier === buff.tier);
            const buffs = same
              ? hero.buffs.map((b) => (b === same ? { ...b, remaining: b.remaining + buff.remaining } : b))
              : [...(hero.buffs ?? []), buff];
            next = { ...next, buffs };
            fx.emit({ type: 'toast', text: potionName(stack.potion, stack.tier).toUpperCase(), small: `Active for ${buff.remaining} quests` });
          }
          set((s) => ({
            hero: next,
            potions: { ...s.potions, [stackId]: { ...stack, count: stack.count - 1, deleted: stack.count - 1 <= 0, updatedAt: t } },
          }));
          log('loot', `Drank ${potionName(stack.potion, stack.tier)}.`);
          return true;
        },

        buyOffer(offer) {
          const st = get();
          const hero = st.hero;
          if (!hero) return false;
          const t = now();
          const day = todayKey(t, st.settings);
          const bought = st.shopDay.date === day ? st.shopDay.bought : [];
          if (offer.kind === 'item' && bought.includes(offer.id)) return false;
          if (offer.kind === 'item' && bagCount(st.items, hero) >= hero.bagSize) {
            fx.emit({ type: 'toast', text: 'Your bag is full!' });
            return false;
          }
          if (!spend(offer.price)) return false;
          const h = get().hero!;
          switch (offer.kind) {
            case 'item': {
              const item: Item = { ...offer.item!, id: uid(), source: 'shop', createdAt: t, updatedAt: t };
              set((s) => ({ items: { ...s.items, [item.id]: item }, shopDay: { date: day, bought: [...bought, offer.id] } }));
              break;
            }
            case 'potion': {
              const p = offer.potion!;
              const id = potionStackId(p.potion, p.tier);
              set((s) => {
                const cur = s.potions[id];
                return { potions: { ...s.potions, [id]: { id, potion: p.potion, tier: p.tier, count: (cur && !cur.deleted ? cur.count : 0) + 1, updatedAt: t } } };
              });
              break;
            }
            case 'bag':
              set({ hero: { ...h, bagSize: Math.min(BAG_MAX, h.bagSize + BAG_STEP), updatedAt: t } });
              break;
            case 'theme':
              set({ hero: { ...h, owned: [...new Set([...h.owned, themeKey(offer.theme!)])], updatedAt: t } });
              break;
            case 'dye': {
              const d = offer.dye!;
              const owned = [...new Set([...h.owned, dyeKey(d.target, d.color)])];
              const appearance = d.target === 'cape' ? h.appearance : { ...h.appearance, [d.target === 'hair' ? 'hairColor' : d.target]: d.color };
              set({ hero: { ...h, owned, appearance, capeDye: d.target === 'cape' ? d.color : h.capeDye, updatedAt: t } });
              break;
            }
          }
          log('loot', `Bought ${offer.label} for ${offer.price}g.`);
          return true;
        },

        claimAchievements() {
          const hero = get().hero;
          if (!hero) return { gold: 0, newTitles: [] };
          const r = claimRewards(hero, achievementCtx(hero));
          if (r.gold <= 0 && !r.newTitles.length) return { gold: 0, newTitles: [] };
          set({
            hero: { ...hero, achievements: { ...hero.achievements, ...r.tiers }, gold: inc(hero.gold, get().deviceId, r.gold), updatedAt: now() },
          });
          log('achievement', `Claimed achievement rewards: +${r.gold}g${r.newTitles.length ? `, new titles: ${r.newTitles.join(', ')}` : ''}.`);
          return { gold: r.gold, newTitles: r.newTitles };
        },

        setTitle(title) {
          const hero = get().hero;
          if (hero) set({ hero: { ...hero, title, updatedAt: now() } });
        },

        leaveList(id) {
          set((s) => {
            const lists = { ...s.lists };
            delete lists[id];
            // dropped without tombstones: those would delete the list for everyone in the party
            const tasks = Object.fromEntries(Object.entries(s.tasks).filter(([, tk]) => tk.listId !== id));
            const next = Object.values(lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order)[0];
            return { lists, tasks, activeListId: s.activeListId === id ? next?.id ?? null : s.activeListId };
          });
          syncHooks.leave?.(id);
        },

        updateHero(patch) {
          const hero = get().hero;
          if (hero) set({ hero: { ...hero, ...patch, updatedAt: now() } });
        },

        exportData() {
          const { hero, lists, tasks, items, potions, settings, log: entries } = get();
          const { accountId } = get();
          return JSON.stringify({ app: 'questlog', version: 3, exportedAt: now(), accountId, hero, lists, tasks, items, potions, settings, log: entries });
        },

        importData(json) {
          try {
            const d = JSON.parse(json);
            const isMap = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
            if (d?.app !== 'questlog' || !isMap(d.lists) || !isMap(d.tasks)) return false;
            const cur = get();
            const t = now();
            // whose save this is: this device's account, or on a device that never synced, the exporter's
            const acct = cur.accountId ?? (typeof d.accountId === 'string' ? d.accountId : null);
            const inLists = d.lists as Record<string, TaskList>;
            const all = [...Object.values(cur.lists), ...Object.values(inLists)].filter((l): l is TaskList => isMap(l));
            // joined lists aren't ours to restore or remove: the live copy stays, the backup's is ignored
            const foreign = new Set(all.filter((l) => isForeignList(l, acct)).map((l) => l.id));
            // our own party lists merge instead of being replaced: a restore must not undo what the party did since
            const party = new Set(all.filter((l) => l.shared && !foreign.has(l.id)).map((l) => l.id));
            const restore = <T extends { deleted?: boolean; updatedAt: number }>(
              live: Record<string, T>,
              incoming: unknown,
              listOf: (v: T) => string | undefined = () => undefined,
            ) => {
              const out: Record<string, T> = {};
              for (const [k, v] of Object.entries(isMap(incoming) ? (incoming as Record<string, T>) : {})) {
                if (!isMap(v)) continue;
                const l = listOf(v);
                if (l && foreign.has(l)) continue;
                // a party doc we lost comes back with its own stamp, so sync keeps whichever copy is newer
                if (l && party.has(l)) {
                  if (!live[k]) out[k] = v;
                  continue;
                }
                out[k] = { ...v, updatedAt: t }; // restamped so it beats newer cloud copies (last write wins)
              }
              // anything else not in the backup becomes a tombstone so the removal syncs too
              for (const [k, v] of Object.entries(live)) {
                if (k in out) continue;
                const l = listOf(v);
                out[k] = v.deleted || (l && (foreign.has(l) || party.has(l))) ? v : { ...v, deleted: true, updatedAt: t };
              }
              return out;
            };
            const lists = restore(cur.lists, inLists, (l) => l.id);
            let hero: Hero | null = d.hero ? { ...heroDefaults(), ...d.hero, updatedAt: t } : null;
            // a different hero than this device's replaces it on every synced device: give it the newer lineage
            if (hero && cur.hero && hero.createdAt !== cur.hero.createdAt)
              hero = { ...hero, createdAt: Math.max(hero.createdAt, cur.hero.createdAt + 1) };
            const first = Object.values(lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order)[0];
            set({
              accountId: acct,
              hero,
              lists,
              tasks: restore(cur.tasks, d.tasks, (tk) => tk.listId),
              items: restore(cur.items, d.items),
              potions: restore(cur.potions, d.potions),
              settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }, log: Array.isArray(d.log) ? d.log : [], activeListId: first?.id ?? null,
            });
            return true;
          } catch {
            return false;
          }
        },

        resetAll() {
          // party lists we joined are left, not deleted: they belong to their owner
          const s0 = get();
          for (const l of Object.values(s0.lists)) if (!l.deleted && isForeignList(l, s0.accountId)) get().leaveList(l.id);
          if (s0.hero) syncHooks.heroReset?.(s0.hero.createdAt); // and the hero goes in the cloud too
          // tombstone instead of wiping so a signed-in device deletes the old data in the cloud too
          const t = now();
          const kill = <T extends { deleted?: boolean; updatedAt: number }>(r: Record<string, T>) =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.deleted ? v : { ...v, deleted: true, updatedAt: t }]));
          set((s) => ({
            hero: null, lists: kill(s.lists), tasks: kill(s.tasks), items: kill(s.items), potions: kill(s.potions),
            log: [], activeListId: null, tab: 'quests', shopDay: { date: '', bought: [] },
          }));
        },
      };
    },
    {
      name: 'questlog-v1',
      version: 4,
      partialize: (s) => ({
        deviceId: s.deviceId, accountId: s.accountId, hero: s.hero, lists: s.lists, tasks: s.tasks, items: s.items, potions: s.potions,
        settings: s.settings, log: s.log, tab: s.tab, activeListId: s.activeListId, shopDay: s.shopDay,
      }),
      migrate: (persisted, version) => {
        const st = persisted as State;
        if (version < 2) st.settings = { ...DEFAULT_SETTINGS, ...st.settings };
        if (version < 3) {
          st.items = st.items ?? {};
          st.potions = st.potions ?? {};
          st.shopDay = st.shopDay ?? { date: '', bought: [] };
          if (st.hero) {
            st.hero = { ...heroDefaults(), ...st.hero };
            if (!Object.keys(st.hero.equipped).length) {
              const kit = starterKit(st.hero.classId, Date.now());
              st.items = { ...st.items, ...kit.items };
              st.hero.equipped = kit.equipped;
            }
          }
        }
        if (version < 4) {
          // the account this device's data belongs to used to live only in the sync layer's key
          try {
            st.accountId = st.accountId ?? localStorage.getItem(LEGACY_LAST_USER_KEY);
          } catch {
            st.accountId = st.accountId ?? null;
          }
        }
        return st;
      },
    },
  ),
);

// ----- selectors -----
export const visibleLists = (s: Pick<State, 'lists'>) => Object.values(s.lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order);
export const listTasks = (s: Pick<State, 'tasks'>, listId: string) =>
  Object.values(s.tasks).filter((t) => t.listId === listId && !t.deleted).sort((a, b) => a.order - b.order);
export const heroStats = (h: Hero) => ({ ...heroLevel(h), kills: sum(h.kills), tasks: sum(h.tasksDone) });
export const equippedItems = (s: Pick<State, 'hero' | 'items'>): Partial<Record<Slot, Item>> => {
  const out: Partial<Record<Slot, Item>> = {};
  if (!s.hero) return out;
  for (const [slot, id] of Object.entries(s.hero.equipped)) {
    const it = id ? s.items[id] : undefined;
    if (it && !it.deleted) out[slot as Slot] = it;
  }
  return out;
};
export const bagItems = (s: Pick<State, 'hero' | 'items'>): Item[] => {
  const eq = new Set(Object.values(s.hero?.equipped ?? {}));
  return Object.values(s.items).filter((i) => !i.deleted && !eq.has(i.id));
};
export const potionStacks = (s: Pick<State, 'potions'>): PotionStack[] =>
  Object.values(s.potions).filter((p) => !p.deleted && p.count > 0);
export type { PotionId };
