import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, setup, wait } from './harness';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('doneLog rotation between two devices', () => {
  it('a daily done every day is never charged while both devices sync (checkDeadlines after each sync)', async () => {
    at(9, 21, 8); // Oct 21 (after DEFAULT_STAKES_FROM, so default stakes apply)
    const { P, M, id } = await setup();
    for (let d = 21; d <= 31; d++) {
      at(9, d, 20);
      P.st().toggleTask(id);
      await P.sync(); P.st().checkDeadlines();
      await M.sync(); M.st().checkDeadlines();
      await wait();
    }
    for (let d = 1; d <= 9; d++) {
      at(10, d, 9);
      P.st().toggleTask(id); // ticked every morning
      for (let i = 0; i < 6; i++) { // a few sync rounds during the day, the app checks after each
        await P.sync(); P.st().checkDeadlines();
        await M.sync(); M.st().checkDeadlines();
        await wait();
      }
    }
    const pens = { ...P.st().hero!.penalties, ...M.st().hero!.penalties };
    expect(pens).toEqual({});
  });
});
