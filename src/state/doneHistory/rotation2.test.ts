import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, setup, wait } from './harness';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('doneLog rotation: charges that are never given back', () => {
  for (const rounds of [1, 2, 3, 5]) {
    it(`daily done every day, ${rounds} sync round(s) per day`, async () => {
      at(9, 21, 8);
      const { P, M, id } = await setup();
      let banners = 0;
      for (let day = 0; day < 45; day++) {
        const d = new Date(2026, 9, 21 + day, 9);
        vi.setSystemTime(d);
        const dev = day % 3 === 0 ? M : P; // ticked on either device
        dev.st().toggleTask(id);
        for (let i = 0; i < rounds; i++) {
          await P.sync(); P.st().checkDeadlines();
          await M.sync(); M.st().checkDeadlines();
          await wait();
        }
      }
      const h = P.st().hero!;
      const pens = h.penalties ?? {};
      banners = Object.keys(pens).length;
      expect(banners).toBe(0);
    });
  }
});
