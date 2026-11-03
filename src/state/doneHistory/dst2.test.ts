import { describe, expect, it } from 'vitest';
import { windowOf, missedAt } from '../../game/deadlines';
import type { Task } from '../../core/types';

const cfg = { dayStartHour: 0, weekStart: 1 };
const task = (extra: Partial<Task> = {}): Task => ({
  id: 't', listId: 'l', title: 'Meds', difficulty: 1, repeat: { kind: 'daily' }, order: 0, timesDone: 0,
  createdAt: new Date(2026, 9, 1).getTime(), updatedAt: 0, byTime: '10:00', stakes: 'must', ...extra,
});

describe('"done by 10:00" on the days the clocks change', () => {
  it('is due at 10:00 by the clock on Nov 1 (summer time ends)', () => {
    const w = windowOf(task(), new Date(2026, 10, 1, 8).getTime(), cfg)!;
    expect(new Date(w.end).getHours()).toBe(10);
  });
  it('done at 9:30 on Nov 1 is in time', () => {
    const t = task({ doneFor: '2026-11-01', doneAt: new Date(2026, 10, 1, 9, 30).getTime(), doneLog: {} });
    // (a tick at 9:30 is logged only if loggedDone thinks it was in time: emulate what missedAt sees at 10:30)
    const m = missedAt(t, new Date(2026, 10, 1, 10, 30).getTime(), cfg);
    expect(m).toBeNull();
  });
});
