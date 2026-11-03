import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from '../../state/store';
import type { Appearance } from '../../pixel/sprites/hero';
import type { Repeat, Task } from '../../core/types';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const at = (m: number, d: number, h: number, mi = 0) => vi.setSystemTime(new Date(2026, m, d, h, mi));
const charged = () => Object.keys(st().hero!.penalties ?? {}).map((k) => new Date(Number(k.split('@')[1])).toString().slice(0, 21));

function quest(title: string, extra: Partial<Task> = {}, repeat: Repeat = { kind: 'daily' }) {
  const daily = visibleLists(st()).find((l) => l.type === 'daily')!;
  st().addTask(daily.id, title);
  const id = Object.values(st().tasks).find((t) => t.title === title && !t.deleted)!.id;
  st().updateTask(id, { repeat, ...extra });
  return id;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(9, 21, 8);
  st().resetAll();
  st().createHero('Kenny', app, 'mage');
  for (const t of Object.values(st().tasks)) st().deleteTask(t.id);
  st().updateSettings({ dayStartHour: 0, weekStart: 1 });
  useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, test: 2000 } } }));
});
afterEach(() => vi.useRealTimers());

const daysDone = (id: string, from: number, to: number, m = 9) => {
  for (let d = from; d <= to; d++) {
    at(m, d, 19);
    st().toggleTask(id);
    st().checkDeadlines();
  }
};

describe('changing how a quest repeats, or the day / week start', () => {
  it('daily -> every 2 days (anchored today): the days before were done, nothing is charged', () => {
    const id = quest('Workout');
    daysDone(id, 21, 29); // done every day up to Thu Oct 29
    at(9, 30, 9); // Fri Oct 30 morning, before doing it: switch to every 2 days
    st().checkDeadlines();
    expect(charged()).toEqual([]);
    st().updateTask(id, { repeat: { kind: 'interval', every: 2, anchor: '2026-10-30' } });
    st().checkDeadlines();
    expect(charged()).toEqual([]);
  });

  it('daily -> weekly mid-week: last week was done every day, nothing is charged', () => {
    const id = quest('Tidy up');
    daysDone(id, 21, 31); // every day, Oct 21 - 31
    daysDone(id, 1, 4, 10); // and Nov 1 - Wed Nov 4
    expect(charged()).toEqual([]);
    at(10, 4, 20);
    st().updateTask(id, { repeat: { kind: 'weekly' } });
    st().checkDeadlines();
    expect(charged()).toEqual([]);
  });

  it('day starts at 4 -> midnight, changed at 1 AM: yesterday (done at 7 PM) is not charged', () => {
    st().updateSettings({ dayStartHour: 4 });
    const id = quest('Read');
    daysDone(id, 21, 28); // done 7 PM each day
    at(9, 29, 1); // 1 AM on the 29th (still the 28th for a 4 AM day start)
    st().checkDeadlines();
    expect(charged()).toEqual([]);
    st().updateSettings({ dayStartHour: 0 });
    st().checkDeadlines();
    expect(charged()).toEqual([]);
  });

  it('week starts Monday -> Sunday: last week (done on Wednesday) is not charged', () => {
    const id = quest('Laundry', { stakes: 'flexible' }, { kind: 'weekly' });
    at(9, 21, 19); // Wed Oct 21
    st().toggleTask(id);
    at(9, 28, 19); // Wed Oct 28
    st().toggleTask(id);
    st().checkDeadlines();
    expect(charged()).toEqual([]);
    st().updateSettings({ weekStart: 0 });
    st().checkDeadlines();
    expect(charged()).toEqual([]);
  });

  it('day start 0 -> 4 in the afternoon, after a 1 AM tick: that day is charged at most once', () => {
    const id = quest('Read');
    daysDone(id, 21, 26);
    at(9, 28, 0, 30);
    st().checkDeadlines(); // the 27th was missed: charged once
    expect(charged()).toHaveLength(1);
    at(9, 28, 1);
    st().toggleTask(id); // done at 1 AM (the 28th for a midnight day start; the 27th for a 4 AM one)
    at(9, 28, 15);
    st().updateSettings({ dayStartHour: 4 });
    st().checkDeadlines();
    expect(charged()).toHaveLength(1);
  });
});
