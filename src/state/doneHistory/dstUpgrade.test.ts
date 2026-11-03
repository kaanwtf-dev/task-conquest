// A window that ended on Nov 1 (US summer time ends) at the day start: the old version put its end at
// midnight + dayStartHour hours, the new one at dayStartHour by the clock. A miss the old version charged
// must not be charged again after the update.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from '../../state/store';
import type { Appearance } from '../../pixel/sprites/hero';
import type { Repeat, Task } from '../../core/types';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const at = (m: number, d: number, h: number, mi = 0) => vi.setSystemTime(new Date(2026, m, d, h, mi));

function quest(title: string, extra: Partial<Task>, repeat: Repeat) {
  const daily = visibleLists(st()).find((l) => l.type === 'daily')!;
  st().addTask(daily.id, title);
  const id = Object.values(st().tasks).find((t) => t.title === title && !t.deleted)!.id;
  st().updateTask(id, { repeat, ...extra });
  return id;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(8, 1, 8);
  st().resetAll();
  st().createHero('Kenny', app, 'mage');
  for (const t of Object.values(st().tasks)) st().deleteTask(t.id);
  st().updateSettings({ dayStartHour: 4, weekStart: 0 });
  useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, test: 2000 } } }));
});
afterEach(() => vi.useRealTimers());

for (const [name, repeat, key] of [
  ['monthly', { kind: 'monthly' }, 'm2026-10'],
  ['weekly (weeks start on Sunday)', { kind: 'weekly' }, 'w2026-10-25'],
] as const) {
  it(`${name}: October's miss, charged by the old version on Nov 1, is not charged again`, () => {
    const id = quest('Pay rent', { stakes: 'must' }, repeat as Repeat);
    // what the old version left after charging the miss on Nov 1 at 9 AM (window end: midnight + 4 h)
    const oldEnd = new Date(2026, 10, 1).getTime() + 4 * 3600_000;
    at(10, 1, 9);
    st().updateTask(id, { missedFor: key, missedEnd: oldEnd, pendingMiss: { key, end: oldEnd, paid: 100, prevMisses: 0 }, misses: 1, missTotal: 1 });
    useStore.setState((x) => ({ hero: { ...x.hero!, penalties: { [`${id}@${oldEnd}`]: 100 } } }));
    at(10, 3, 9); // updated; opened on Nov 3
    st().checkDeadlines();
    const keys = Object.keys(st().hero!.penalties ?? {});
    expect(keys).toHaveLength(1);
  });
}
