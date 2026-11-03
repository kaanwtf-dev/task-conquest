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
  useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, test: 2000 } } }));
});
afterEach(() => vi.useRealTimers());

describe('restoring a backup made a few days ago', () => {
  it('does not charge yesterday, which was done after the backup', () => {
    const list = visibleLists(st()).find((l) => l.type === 'daily')!;
    st().addTask(list.id, 'Stretch');
    const id = Object.values(st().tasks).find((t) => t.title === 'Stretch' && !t.deleted)!.id;
    at(9, 21, 19); st().toggleTask(id);
    at(9, 22, 19); st().toggleTask(id);
    const backup = st().exportData(); // Oct 22
    for (let d = 23; d <= 28; d++) { at(9, d, 19); st().toggleTask(id); st().checkDeadlines(); }
    expect(charged()).toEqual([]);
    at(9, 29, 9);
    st().importData(backup); // restored on the 29th
    st().checkDeadlines();
    expect(charged()).toEqual([]);
  });
});
