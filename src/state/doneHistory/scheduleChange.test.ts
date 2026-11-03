// Changing a quest's schedule: the period it lands in counts as done when it was done in it, and the old
// schedule's periods are not taken for the new one's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from '../../state/store';
import type { Appearance } from '../../pixel/sprites/hero';
import { isDone } from '../../core/time';
import { heroGold } from '../../game/progression';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const at = (m: number, d: number, h: number) => vi.setSystemTime(new Date(2026, m, d, h));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(10, 8, 8);
  st().resetAll();
  st().createHero('Kenny', app, 'mage');
  for (const t of Object.values(st().tasks)) st().deleteTask(t.id);
  st().updateSettings({ dayStartHour: 0, weekStart: 1 });
});
afterEach(() => vi.useRealTimers());

const quest = (title: string) => {
  const list = visibleLists(st()).find((l) => l.type === 'daily')!;
  st().addTask(list.id, title);
  return Object.values(st().tasks).find((t) => t.title === title && !t.deleted)!.id;
};

describe('a schedule change', () => {
  it('daily -> weekly on Saturday evening: the ticks of that week count for it', () => {
    at(10, 9, 8); // made on Monday Nov 9
    const id = quest('Stretch');
    st().updateTask(id, { stakes: 'must' });
    for (let d = 9; d <= 13; d++) { at(10, d, 9); st().toggleTask(id); st().checkDeadlines(); } // Mon Nov 9 - Fri 13
    at(10, 14, 20); // Sat: weekly from now on
    st().checkDeadlines();
    st().updateTask(id, { repeat: { kind: 'weekly' } });
    expect(isDone(st().tasks[id], Date.now(), st().settings)).toBe(true);
    at(10, 16, 9); // Mon Nov 16: the week of the 9th is over
    st().checkDeadlines();
    expect({ ...st().hero!.penalties }).toEqual({});
  });

  it('every 2 days -> every 3 days: an older period is not taken for a later one under the new schedule', () => {
    const id = quest('Run');
    st().updateTask(id, { repeat: { kind: 'interval', every: 2, anchor: '2026-11-01' } });
    at(10, 10, 9); // day 9: period 4 of every 2 days (days 8 - 9), done
    st().toggleTask(id);
    at(10, 11, 9); // day 10: period 5, not done; every 3 days from now on: period 3 (days 9 - 11), done on day 9
    st().updateTask(id, { repeat: { kind: 'interval', every: 3, anchor: '2026-11-01' } });
    expect(isDone(st().tasks[id], Date.now(), st().settings)).toBe(true);
    at(10, 13, 9); // day 12: period 4 of every 3 days (days 12 - 14), not done, and its tick pays
    expect(isDone(st().tasks[id], Date.now(), st().settings)).toBe(false);
    const gold = heroGold(st().hero!);
    st().toggleTask(id);
    expect(heroGold(st().hero!)).toBeGreaterThan(gold);
  });

  it('weekly -> daily: last week\'s tick is not written back into the daily log', () => {
    const id = quest('Laundry');
    st().updateTask(id, { repeat: { kind: 'weekly' } });
    at(10, 4, 9); // Wed Nov 4
    st().toggleTask(id);
    at(10, 10, 9); // Tue Nov 10: daily from now on, and done today
    st().updateTask(id, { repeat: { kind: 'daily' } });
    expect(st().tasks[id].doneFor ?? null).toBeNull();
    st().toggleTask(id);
    expect(Object.keys(st().tasks[id].doneLog ?? {})).toEqual(['2026-11-10']);
  });
});
