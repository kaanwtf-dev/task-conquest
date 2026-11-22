import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from '../state/store';
import type { Appearance } from '../pixel/sprites/hero';
import { lastDoneAt } from './time';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const at = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 10, d, h, m));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(20, 8);
  st().resetAll();
  st().createHero('Kenny', app, 'mage');
});
afterEach(() => vi.useRealTimers());

describe('last done', () => {
  it('records every tick, stays after the day resets, and skips a tick taken back', () => {
    const list = visibleLists(st()).find((l) => l.type === 'daily')!;
    st().addTask(list.id, 'Floss');
    const id = Object.values(st().tasks).find((t) => t.title === 'Floss' && !t.deleted)!.id;
    expect(lastDoneAt(st().tasks[id])).toBeNull();
    at(20, 21, 41);
    st().toggleTask(id);
    expect(lastDoneAt(st().tasks[id])).toBe(new Date(2026, 10, 20, 21, 41).getTime());
    at(22, 9); // two days later, not done yet today: still shows the 20th
    expect(lastDoneAt(st().tasks[id])).toBe(new Date(2026, 10, 20, 21, 41).getTime());
    at(22, 9, 30);
    st().toggleTask(id);
    expect(lastDoneAt(st().tasks[id])).toBe(new Date(2026, 10, 22, 9, 30).getTime());
    at(22, 9, 31);
    st().toggleTask(id); // taken back by mistake: back to the 20th
    expect(lastDoneAt(st().tasks[id])).toBe(new Date(2026, 10, 20, 21, 41).getTime());
  });

  it('one-off quests: when it was ticked off', () => {
    const list = visibleLists(st()).find((l) => l.type === 'quests')!;
    st().addTask(list.id, 'Pay rent');
    const id = Object.values(st().tasks).find((t) => t.title === 'Pay rent' && !t.deleted)!.id;
    at(21, 12);
    st().toggleTask(id);
    expect(lastDoneAt(st().tasks[id])).toBe(new Date(2026, 10, 21, 12).getTime());
  });
});
