// Day start moved from midnight to 4 AM in the small hours, after a missed day was charged at midnight:
// the same day must not be charged a second time when its window ends again at 4 AM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from '../../state/store';
import type { Appearance } from '../../pixel/sprites/hero';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const at = (m: number, d: number, h: number, mi = 0) => vi.setSystemTime(new Date(2026, m, d, h, mi));
const charged = () => Object.keys(st().hero!.penalties ?? {}).map((k) => new Date(Number(k.split('@')[1])).toString().slice(0, 21));

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

describe('day start 0 -> 4 at 2 AM', () => {
  it('a missed day is charged once', () => {
    const list = visibleLists(st()).find((l) => l.type === 'daily')!;
    st().addTask(list.id, 'Read');
    const id = Object.values(st().tasks).find((t) => t.title === 'Read' && !t.deleted)!.id;
    st().updateTask(id, { stakes: 'must' });
    for (let d = 21; d <= 27; d++) { at(9, d, 19); st().toggleTask(id); st().checkDeadlines(); }
    at(9, 29, 0, 30); // the 28th was missed: charged at 00:30
    st().checkDeadlines();
    expect(charged()).toHaveLength(1);
    at(9, 29, 2);
    st().updateSettings({ dayStartHour: 4 }); // a night owl now
    st().checkDeadlines();
    at(9, 29, 4, 30);
    st().checkDeadlines();
    expect(charged()).toHaveLength(1);
  });
});
