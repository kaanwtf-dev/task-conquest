import { afterEach, describe, expect, it } from 'vitest';
import { useZone, zonedDate } from './zone';

const ZONES = ['UTC', 'Europe/Istanbul', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/Sao_Paulo', 'Asia/Tokyo'];
// a spread of moments, including both 2026 daylight-saving switches in the US and Europe
const MOMENTS = [
  Date.UTC(2026, 0, 1, 0, 0), Date.UTC(2026, 2, 8, 9, 59), Date.UTC(2026, 2, 8, 10, 1), Date.UTC(2026, 2, 29, 0, 59), Date.UTC(2026, 2, 29, 1, 1),
  Date.UTC(2026, 5, 15, 12, 34, 56, 789), Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30), Date.UTC(2026, 10, 1, 8, 30), Date.UTC(2026, 10, 1, 9, 30),
  Date.UTC(2026, 11, 31, 23, 59), Date.UTC(2027, 1, 28, 18, 0),
];
const realTZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = realTZ;
  useZone(null);
});

/** What the real Date says with the process switched to that zone (Node re-reads TZ). */
function inZone<T>(tz: string, fn: (D: DateConstructor) => T): T {
  process.env.TZ = tz;
  try {
    return fn(Date);
  } finally {
    process.env.TZ = realTZ;
  }
}

const fields = (d: Date) => [d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(), d.getTimezoneOffset()];

describe('zoned Date', () => {
  it('reads local time like the real Date in that zone', () => {
    for (const tz of ZONES) {
      const Z = zonedDate(tz);
      for (const t of MOMENTS) expect([tz, t, ...fields(new Z(t))]).toEqual([tz, t, ...inZone(tz, (D) => fields(new D(t)))]);
    }
  });

  it('builds and moves local times like the real Date (midnights, overflowing days, a day back)', () => {
    for (const tz of ZONES) {
      const Z = zonedDate(tz);
      for (const t of MOMENTS) {
        const ours = (() => {
          const d = new Z(t);
          const midnight = new Z(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          const nextMonth = new Z(d.getFullYear(), d.getMonth() + 1, 1).getTime();
          const plus40 = new Z(d.getFullYear(), d.getMonth(), d.getDate() + 40).getTime();
          const back = new Z(t);
          back.setHours(back.getHours() - 4);
          const weekStart = new Z(t);
          weekStart.setDate(weekStart.getDate() - 6);
          return [midnight, nextMonth, plus40, back.getTime(), weekStart.getTime()];
        })();
        const real = inZone(tz, (D) => {
          const d = new D(t);
          const back = new D(t);
          back.setHours(back.getHours() - 4);
          const weekStart = new D(t);
          weekStart.setDate(weekStart.getDate() - 6);
          return [new D(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), new D(d.getFullYear(), d.getMonth() + 1, 1).getTime(), new D(d.getFullYear(), d.getMonth(), d.getDate() + 40).getTime(), back.getTime(), weekStart.getTime()];
        });
        expect([tz, t, ...ours]).toEqual([tz, t, ...real]);
      }
    }
  });

  it('agrees through a whole year of daylight-saving switches', () => {
    for (const tz of ['America/Los_Angeles', 'Europe/London', 'Australia/Lord_Howe', 'America/Santiago']) {
      const Z = zonedDate(tz);
      const ours: number[] = [];
      for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 97 * 60_000) {
        const d = new Z(t);
        ours.push(d.getHours(), d.getDate(), new Z(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
      }
      const real = inZone(tz, (D) => {
        const out: number[] = [];
        for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 97 * 60_000) {
          const d = new D(t);
          out.push(d.getHours(), d.getDate(), new D(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
        }
        return out;
      });
      expect(ours).toEqual(real);
    }
  });

  it('formats times in the zone, and swaps in and out as the global Date', () => {
    const t = Date.UTC(2026, 9, 19, 12, 5);
    useZone('Europe/Istanbul');
    expect(new Date(t).getHours()).toBe(15);
    expect(new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })).toBe('3:05 PM');
    expect(Date.now()).toBeGreaterThan(t - 365 * 86_400_000);
    expect(new Date(t) instanceof Date).toBe(true);
    useZone(null);
    expect(new Date(t).getHours()).toBe(inZone(realTZ ?? 'UTC', (D) => new D(t).getHours()));
    expect(() => zonedDate('Not/AZone')).toThrow(RangeError);
  });
});
