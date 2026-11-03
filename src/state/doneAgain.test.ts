// A quest done in one period and done again in the next was charged for the first one: the single "done for"
// mark was overwritten by the second tick, so the miss check thought the earlier period was never done.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from './store';
import type { Appearance } from '../pixel/sprites/hero';
import type { Repeat, Task } from '../core/types';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const at = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 9, d, h, m)); // October 2026
const at11 = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 10, d, h, m)); // November 2026
const charged = () => Object.keys(st().hero!.penalties ?? {});

function quest(title: string, extra: Partial<Task> = {}, repeat: Repeat = { kind: 'daily' }) {
  const daily = visibleLists(st()).find((l) => l.type === 'daily')!;
  st().addTask(daily.id, title);
  const id = Object.values(st().tasks).find((t) => t.title === title && !t.deleted)!.id;
  st().updateTask(id, { repeat, ...extra });
  return id;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(26, 8);
  st().resetAll();
  st().createHero('Kenny', app, 'mage');
  for (const t of Object.values(st().tasks)) st().deleteTask(t.id); // only the quests made here
  useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, test: 2000 } } }));
});
afterEach(() => vi.useRealTimers());

describe('a quest done again in the next period', () => {
  it('a daily done yesterday and ticked again today is not charged for yesterday', () => {
    const id = quest('Drink water');
    at(28, 14, 15);
    st().toggleTask(id); // done on the 28th
    at(29, 9);
    st().checkDeadlines(); // nothing missed
    st().toggleTask(id); // done again on the 29th
    st().checkDeadlines(); // (runs after every sync, so right after the tick)
    expect(charged()).toEqual([]);
    expect(st().tasks[id].pendingMiss ?? null).toBeNull();
    expect(st().tasks[id].misses ?? 0).toBe(0);
  });

  it('…also when it is ticked again before the check runs at all', () => {
    const id = quest('Drink water');
    at(28, 14, 15);
    st().toggleTask(id);
    at(29, 9);
    st().toggleTask(id);
    st().checkDeadlines();
    expect(charged()).toEqual([]);
  });

  it('a "done by" daily, a weekly and an every-3-days quest are not charged for a period they were done in', () => {
    const meds = quest('Take meds', { byTime: '21:30', stakes: 'must' });
    const laundry = quest('Laundry', { stakes: 'flexible' }, { kind: 'weekly' });
    const workout = quest('Workout', { stakes: 'must' }, { kind: 'interval', every: 3, anchor: '2026-10-26' });
    at(28, 20); // Wednesday the 28th: all done in time
    for (const id of [meds, laundry, workout]) st().toggleTask(id);
    at(29, 10); // meds again on the 29th (the 28th's 21:30 has passed)
    st().toggleTask(meds);
    st().checkDeadlines();
    at11(2, 10); // Monday Nov 2nd: a new week, and a new 3-day period (Oct 29 - 31 was the second)
    st().toggleTask(laundry);
    st().checkDeadlines();
    expect(charged().filter((k) => k.startsWith(laundry))).toEqual([]);
    expect(charged().filter((k) => k.startsWith(meds) && k.endsWith(`@${new Date(2026, 9, 28, 21, 30).getTime()}`))).toEqual([]);
    // the workout period Oct 26 - 28 was done; Oct 29 - 31 was not: only that one is charged
    expect(charged().filter((k) => k.startsWith(workout))).toEqual([`${workout}@${new Date(2026, 10, 1).getTime()}`]);
  });

  it('a day really missed is still charged, once, even when the quest is done the day after', () => {
    const id = quest('Read');
    at(27, 20);
    st().toggleTask(id); // done on the 27th, not on the 28th
    at(29, 9);
    st().toggleTask(id); // done on the 29th
    st().checkDeadlines();
    expect(charged()).toEqual([`${id}@${new Date(2026, 9, 29).getTime()}`]);
    st().checkDeadlines();
    expect(charged()).toHaveLength(1);
  });

  it('a tick taken back is not a completion', () => {
    const id = quest('Read');
    at(28, 20);
    st().toggleTask(id);
    st().toggleTask(id); // oops, untick
    at(29, 9);
    st().toggleTask(id);
    st().checkDeadlines();
    expect(charged()).toEqual([`${id}@${new Date(2026, 9, 29).getTime()}`]);
  });

  it('saves from before the fix: a completion that was overwritten is never charged for', () => {
    const id = quest('Brush teeth');
    const old = quest('Floss');
    // done on the 28th and again this morning, by the old version: only this morning's mark is left
    st().updateTask(id, { doneFor: '2026-10-29', doneAt: new Date(2026, 9, 29, 8).getTime(), timesDone: 2 });
    // last done on the 27th: the 28th really was missed
    st().updateTask(old, { doneFor: '2026-10-27', doneAt: new Date(2026, 9, 27, 8).getTime(), timesDone: 1 });
    at(29, 9);
    st().checkDeadlines();
    expect(charged()).toEqual([`${old}@${new Date(2026, 9, 29).getTime()}`]);
  });
});
