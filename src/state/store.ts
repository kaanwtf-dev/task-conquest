import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClassId, Difficulty, Hero, ListType, LogEntry, Repeat, Settings, SkillId, Task, TaskList } from '../core/types';
import type { Appearance } from '../pixel/sprites/hero';
import type { ThemeId } from '../pixel/themes';
import { THEME_BY_ID } from '../pixel/themes';
import { isActiveToday, isDone, periodKey, todayKey } from '../core/time';
import { heroLevel, heroSkill, sum, taskGold, taskXp } from '../game/progression';
import { spawnMonster, SKILL_BY_ID } from '../game/catalog';
import { guessAisle } from '../pixel/keywords';
import { hashStr } from '../core/rng';
import { fx } from './fx';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type Tab = 'quests' | 'hero' | 'shop' | 'party' | 'settings';

export const DEFAULT_SETTINGS: Settings = {
  anim: 'full',
  sfx: 0.6,
  music: 0,
  haptics: true,
  dayStartHour: 0,
  weekStart: 1,
  taskFont: 'pixel',
};

export const LIST_TYPE_INFO: Record<ListType, { label: string; repeat: Repeat; hint: string }> = {
  daily: { label: 'Daily', repeat: { kind: 'daily' }, hint: 'Resets every day' },
  weekly: { label: 'Weekly', repeat: { kind: 'weekly' }, hint: 'Resets every week' },
  quests: { label: 'Quests', repeat: { kind: 'none' }, hint: 'No time limit' },
  supply: { label: 'Supply', repeat: { kind: 'none' }, hint: 'Remembers items, restock anytime' },
  custom: { label: 'Custom', repeat: { kind: 'none' }, hint: 'Set repeat per task' },
};

interface State {
  deviceId: string;
  hero: Hero | null;
  lists: Record<string, TaskList>;
  tasks: Record<string, Task>;
  settings: Settings;
  log: LogEntry[];
  tab: Tab;
  activeListId: string | null;

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
  updateSettings(patch: Partial<Settings>): void;
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

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      deviceId: uid(),
      hero: null,
      lists: {},
      tasks: {},
      settings: DEFAULT_SETTINGS,
      log: [],
      tab: 'quests',
      activeListId: null,

      createHero(name, appearance, classId) {
        const t = now();
        const hero: Hero = {
          id: 'hero', name: name.trim() || 'Hero', appearance, classId,
          xp: {}, gold: {}, goldSpent: {}, kills: {}, tasksDone: {}, skillXp: {}, activeDays: [],
          createdAt: t, updatedAt: t,
        };
        const seeded = Object.keys(get().lists).length ? { lists: get().lists, tasks: get().tasks } : seedLists();
        const first = Object.values(seeded.lists).sort((a, b) => a.order - b.order)[0];
        set({ hero, ...seeded, activeListId: first?.id ?? null, tab: 'quests' });
        pushLog(set, get, 'info', `${hero.name} sets out on an adventure!`);
      },

      setTab: (tab) => set({ tab }),
      setActiveList: (id) => set({ activeListId: id, tab: 'quests' }),

      addList(p) {
        const t = now();
        const order = Math.max(-1, ...Object.values(get().lists).map((l) => l.order)) + 1;
        const list: TaskList = {
          id: uid(), name: p.name.trim() || 'New List', type: p.type, theme: p.theme, skill: p.skill,
          icon: p.icon, color: p.color ?? '#5b6ee1', order, createdAt: t, updatedAt: t,
        };
        set((s) => ({ lists: { ...s.lists, [list.id]: list }, activeListId: list.id }));
        return list.id;
      },

      updateList(id, patch) {
        set((s) => ({ lists: { ...s.lists, [id]: { ...s.lists[id], ...patch, updatedAt: now() } } }));
      },

      deleteList(id) {
        set((s) => {
          const lists = { ...s.lists, [id]: { ...s.lists[id], deleted: true, updatedAt: now() } };
          const tasks = { ...s.tasks };
          for (const tk of Object.values(tasks)) if (tk.listId === id) tasks[tk.id] = { ...tk, deleted: true, updatedAt: now() };
          const next = Object.values(lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order)[0];
          return { lists, tasks, activeListId: next?.id ?? null };
        });
      },

      addTask(listId, title, extra = {}) {
        const list = get().lists[listId];
        const clean = title.trim();
        if (!list || !clean) return null;
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
        const order = Math.min(0, ...Object.values(get().tasks).filter((x) => x.listId === listId).map((x) => x.order)) - 1;
        const task: Task = {
          id: uid(), listId, title: clean, difficulty: list.type === 'supply' ? 0 : 2,
          repeat: LIST_TYPE_INFO[list.type].repeat, order, createdAt: t, updatedAt: t, timesDone: 0,
          ...(list.type === 'supply' ? { aisle: guessAisle(clean) } : {}),
          ...extra,
        };
        set((s) => ({ tasks: { ...s.tasks, [task.id]: task } }));
        return task.id;
      },

      updateTask(id, patch) {
        set((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...patch, updatedAt: now() } } }));
      },

      deleteTask(id) {
        get().updateTask(id, { deleted: true });
      },

      toggleTask(id) {
        const s = get();
        const task = s.tasks[id];
        const hero = s.hero;
        if (!task || !hero) return;
        const cfg = s.settings;
        const t = now();
        const pk = periodKey(task.repeat, t, cfg);
        if (isDone(task, t, cfg)) {
          s.updateTask(id, { doneFor: null });
          return;
        }
        const list = s.lists[task.listId];
        const patch: Partial<Task> = { doneFor: pk, doneAt: t, timesDone: task.timesDone + 1, doneBy: hero.name };
        const alreadyRewarded = task.rewardedFor === pk;
        patch.rewardedFor = pk;
        s.updateTask(id, patch);
        if (alreadyRewarded || !list) return;

        // ---- rewards ----
        const dev = s.deviceId;
        const { level } = heroLevel(hero);
        const race = hero.appearance.race;
        const seed = hashStr(`${id}:${pk}:${t}`);
        const roll = (seed % 1000) / 1000;
        let xp = taskXp(level, task.difficulty);
        let gold = taskGold(level, task.difficulty, roll);
        if (race === 'human') xp *= 1.1;
        if (race === 'dwarf') gold *= 1.15;
        if (race === 'lizardfolk' && task.repeat.kind === 'daily') xp *= 1.2;
        const critChance = 0.05 + (race === 'orc' ? 0.08 : 0) + (hero.classId === 'rogue' ? 0.05 : 0);
        const crit = ((seed >>> 10) % 1000) / 1000 < critChance;
        if (crit) {
          xp *= 2;
          gold *= 2;
        }
        xp = Math.round(xp);
        gold = Math.round(gold);

        const inc = (c: Record<string, number>, n: number) => ({ ...c, [dev]: (c[dev] ?? 0) + n });
        const skillBefore = heroSkill(hero, list.skill).level;
        const day = todayKey(t, cfg);
        const nextHero: Hero = {
          ...hero,
          xp: inc(hero.xp, xp),
          gold: inc(hero.gold, gold),
          kills: inc(hero.kills, 1),
          tasksDone: inc(hero.tasksDone, 1),
          skillXp: { ...hero.skillXp, [list.skill]: inc(hero.skillXp[list.skill] ?? {}, xp) },
          activeDays: hero.activeDays.includes(day) ? hero.activeDays : [...hero.activeDays.slice(-400), day],
          updatedAt: t,
        };
        set({ hero: nextHero });

        const theme = THEME_BY_ID[list.theme] ?? THEME_BY_ID.forest;
        const monster = spawnMonster(theme.monsters, theme.id, level, seed);
        fx.emit({ type: 'kill', monster, xp, gold, crit, theme: theme.id, listId: list.id });
        pushLog(set, get, 'kill', `Slew a Lv${level} ${monster.name} — "${task.title}" (+${xp} XP, +${gold}g${crit ? ', CRIT!' : ''})`);

        const after = heroLevel(nextHero).level;
        if (after > level) {
          fx.emit({ type: 'levelUp', level: after });
          pushLog(set, get, 'level', `LEVEL UP! ${hero.name} reached level ${after}.`);
        }
        const skillAfter = heroSkill(nextHero, list.skill).level;
        if (skillAfter > skillBefore) {
          const sk = SKILL_BY_ID[list.skill];
          fx.emit({ type: 'skillUp', skill: sk.name, level: skillAfter });
          pushLog(set, get, 'skill', `${sk.name} increased to ${skillAfter}.`);
        }

        // whole list cleared for this period -> quest complete bonus
        if (list.type !== 'supply') {
          const all = Object.values(get().tasks).filter((x) => x.listId === list.id && !x.deleted && isActiveToday(x, t, cfg));
          if (all.length >= 2 && all.every((x) => isDone(x, t, cfg))) {
            const bonus = Math.round(5 + level * 2);
            set((st) => ({ hero: st.hero && { ...st.hero, gold: inc(st.hero.gold, bonus) } }));
            fx.emit({ type: 'questComplete', listName: list.name });
            pushLog(set, get, 'quest', `QUEST COMPLETE: ${list.name}! Found a chest with ${bonus} gold.`);
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

      updateSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      resetAll() {
        set({ hero: null, lists: {}, tasks: {}, log: [], activeListId: null, tab: 'quests' });
      },
    }),
    { name: 'questlog-v1', version: 1 },
  ),
);

function pushLog(set: (p: Partial<State>) => void, get: () => State, kind: LogEntry['kind'], text: string) {
  set({ log: [{ id: uid(), at: now(), text, kind }, ...get().log].slice(0, 200) });
}

// ----- selectors -----
export const visibleLists = (s: State) => Object.values(s.lists).filter((l) => !l.deleted).sort((a, b) => a.order - b.order);
export const listTasks = (s: State, listId: string) =>
  Object.values(s.tasks).filter((t) => t.listId === listId && !t.deleted).sort((a, b) => a.order - b.order);
export const heroStats = (h: Hero) => ({ ...heroLevel(h), kills: sum(h.kills), tasks: sum(h.tasksDone) });
