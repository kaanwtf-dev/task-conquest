import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClassId, Difficulty, Hero, Item, ListType, LogEntry, PotionId, PotionStack, Repeat, Settings, SkillId, Slot, Task, TaskList,
} from '../core/types';
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
import type { ShopOffer } from '../game/shop';
import { fx } from './fx';
import { bagCount, bestStreak, inc, questChestRewards, streakDays, taskRewards, type RewardOutcome } from './rewards';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type Tab = 'quests' | 'hero' | 'shop' | 'party' | 'settings';

/** Pseudo-list id for the cross-list "Today" view. */
export const TODAY_ID = '__today';

export const DEFAULT_SETTINGS: Settings = {
  anim: 'full',
  sfx: 0.6,
  music: 0,
  haptics: true,
  dayStartHour: 0,
  weekStart: 1,
  taskFont: 'pixel',
  cornerHero: 'big',
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

export interface State {
  deviceId: string;
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
          const seeded = Object.keys(get().lists).length ? { lists: get().lists, tasks: get().tasks } : seedLists();
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
              get().updateTask(known.id, { doneFor: null, rewardedFor: null, ...extra });
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
          if (!get().tasks[id]) return;
          set((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...patch, updatedAt: now() } } }));
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
          const alreadyRewarded = task.rewardedFor === pk;
          s.updateTask(id, { doneFor: pk, rewardedFor: pk, doneAt: t, timesDone: task.timesDone + 1, doneBy: hero.name });
          // re-checking within the same period never pays out twice (no farming by toggling)
          if (alreadyRewarded || !list) return;

          const seed = hashStr(`${id}:${pk}:${t}:${s.deviceId}`);
          apply(taskRewards({ hero, items: s.items, task, list, dev: s.deviceId, now: t, seed, cfg }));

          // whole list cleared for this period -> quest chest
          if (list.type !== 'supply') {
            const all = Object.values(get().tasks).filter((x) => x.listId === list.id && !x.deleted && isActiveToday(x, t, cfg));
            if (all.length >= 2 && all.every((x) => isDone(x, t, cfg))) {
              const st = get();
              apply(questChestRewards({ hero: st.hero!, items: st.items, list, dev: st.deviceId, now: t, seed: hashStr(`chest:${list.id}:${pk}`) }));
            }
          }
        },

        restockStaples(listId) {
          let n = 0;
          for (const tk of Object.values(get().tasks))
            if (tk.listId === listId && !tk.deleted && tk.staple && tk.doneFor) {
              get().updateTask(tk.id, { doneFor: null, rewardedFor: null });
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
          if (!task || !list || task.listId === listId) return;
          const order = Math.min(0, ...Object.values(get().tasks).filter((x) => x.listId === listId && !x.deleted).map((x) => x.order)) - 1;
          const patch: Partial<Task> = { listId, order };
          if (list.type === 'supply') patch.aisle = task.aisle ?? guessAisle(task.title);
          get().updateTask(id, patch);
        },

        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
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
            const same = (hero.buffs ?? []).find((b) => b.potion === stack.potion);
            const buffs = same
              ? hero.buffs.map((b) => (b === same ? { ...b, value: Math.max(b.value, buff.value), remaining: b.remaining + buff.remaining } : b))
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
              set({ hero: { ...h, bagSize: h.bagSize + 6, updatedAt: t } });
              break;
            case 'theme':
              set({ hero: { ...h, owned: [...h.owned, `theme:${offer.theme}`], updatedAt: t } });
              break;
            case 'dye': {
              const d = offer.dye!;
              const owned = [...h.owned, `dye:${d.target}:${d.color}`];
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
          const ctx = { bestStreak: bestStreak(streakDays(hero)), level: heroLevel(hero).level };
          const r = claimRewards(hero, ctx);
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

        updateHero(patch) {
          const hero = get().hero;
          if (hero) set({ hero: { ...hero, ...patch, updatedAt: now() } });
        },

        exportData() {
          const { hero, lists, tasks, items, potions, settings, log: entries } = get();
          return JSON.stringify({ app: 'questlog', version: 3, exportedAt: now(), hero, lists, tasks, items, potions, settings, log: entries });
        },

        importData(json) {
          try {
            const d = JSON.parse(json);
            if (d?.app !== 'questlog' || typeof d.lists !== 'object' || typeof d.tasks !== 'object') return false;
            const hero = d.hero ? { ...heroDefaults(), ...d.hero } : null;
            const first = Object.values(d.lists as Record<string, TaskList>).filter((l) => !l.deleted).sort((a, b) => a.order - b.order)[0];
            set({
              hero, lists: d.lists, tasks: d.tasks, items: d.items ?? {}, potions: d.potions ?? {},
              settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }, log: d.log ?? [], activeListId: first?.id ?? null,
            });
            return true;
          } catch {
            return false;
          }
        },

        resetAll() {
          set({ hero: null, lists: {}, tasks: {}, items: {}, potions: {}, log: [], activeListId: null, tab: 'quests', shopDay: { date: '', bought: [] } });
        },
      };
    },
    {
      name: 'questlog-v1',
      version: 3,
      partialize: (s) => ({
        deviceId: s.deviceId, hero: s.hero, lists: s.lists, tasks: s.tasks, items: s.items, potions: s.potions,
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
