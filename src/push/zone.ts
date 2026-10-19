// Local time in any IANA time zone, for runtimes where TZ can't be changed at run time (Supabase Edge
// Functions). zonedDate(tz) returns a Date class whose local-time methods (getHours, setDate, new Date(y, m,
// d), toLocaleTimeString...) work in that zone; useZone swaps it in as the global Date while one player's
// reminders are worked out. Timestamps (getTime, Date.now) are untouched.

const RealDate = Date;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The zone's offset from UTC at that moment, in ms (positive east of Greenwich). */
export function zoneOffset(tz: string, epoch: number): number {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new RealDate(epoch))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const asUtc = RealDate.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/**
 * A wall-clock time in the zone (fields may overflow, like Date's), as a timestamp. Around daylight-saving
 * switches it does what Date does: a time that happens twice is the first one, and a time skipped by the
 * switch moves forward by the gap.
 */
function fromLocal(tz: string, y: number, mo: number, d = 1, h = 0, mi = 0, s = 0, ms = 0): number {
  const guess = RealDate.UTC(y, mo, d, h, mi, s, ms);
  const before = zoneOffset(tz, guess - 86_400_000);
  const after = zoneOffset(tz, guess + 86_400_000);
  const valid = [guess - before, guess - after].filter((t, i) => zoneOffset(tz, t) === (i ? after : before));
  return valid.length ? Math.min(...valid) : guess - before;
}

export function zonedDate(tz: string): DateConstructor {
  // throws a RangeError for a zone this runtime doesn't know
  formatter(tz);
  const local = (t: number) => new RealDate(t + zoneOffset(tz, t)); // read with getUTC*
  class ZonedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super();
      else if (args.length === 1) super(args[0] instanceof RealDate ? args[0].getTime() : (args[0] as string | number));
      else super(fromLocal(tz, ...(args as [number, number, number?, number?, number?, number?, number?])));
    }
    override getFullYear() { return local(this.getTime()).getUTCFullYear(); }
    override getMonth() { return local(this.getTime()).getUTCMonth(); }
    override getDate() { return local(this.getTime()).getUTCDate(); }
    override getDay() { return local(this.getTime()).getUTCDay(); }
    override getHours() { return local(this.getTime()).getUTCHours(); }
    override getMinutes() { return local(this.getTime()).getUTCMinutes(); }
    override getSeconds() { return local(this.getTime()).getUTCSeconds(); }
    override getMilliseconds() { return local(this.getTime()).getUTCMilliseconds(); }
    override getTimezoneOffset() { return -Math.round(zoneOffset(tz, this.getTime()) / 60_000) || 0; }
    /** Sets local fields: reads them all, changes some, converts back. */
    private setLocal(change: (f: number[]) => void): number {
      const l = local(this.getTime());
      const f = [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), l.getUTCHours(), l.getUTCMinutes(), l.getUTCSeconds(), l.getUTCMilliseconds()];
      change(f);
      return this.setTime(fromLocal(tz, f[0], f[1], f[2], f[3], f[4], f[5], f[6]));
    }
    override setFullYear(y: number, mo?: number, d?: number) {
      return this.setLocal((f) => { f[0] = y; if (mo !== undefined) f[1] = mo; if (d !== undefined) f[2] = d; });
    }
    override setMonth(mo: number, d?: number) {
      return this.setLocal((f) => { f[1] = mo; if (d !== undefined) f[2] = d; });
    }
    override setDate(d: number) { return this.setLocal((f) => { f[2] = d; }); }
    override setHours(h: number, mi?: number, s?: number, ms?: number) {
      return this.setLocal((f) => { f[3] = h; if (mi !== undefined) f[4] = mi; if (s !== undefined) f[5] = s; if (ms !== undefined) f[6] = ms; });
    }
    override setMinutes(mi: number, s?: number, ms?: number) {
      return this.setLocal((f) => { f[4] = mi; if (s !== undefined) f[5] = s; if (ms !== undefined) f[6] = ms; });
    }
    override setSeconds(s: number, ms?: number) { return this.setLocal((f) => { f[5] = s; if (ms !== undefined) f[6] = ms; }); }
    override setMilliseconds(ms: number) { return this.setLocal((f) => { f[6] = ms; }); }
    override toLocaleString(locales?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      return super.toLocaleString(locales, { timeZone: tz, ...opts });
    }
    override toLocaleDateString(locales?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      return super.toLocaleDateString(locales, { timeZone: tz, ...opts });
    }
    override toLocaleTimeString(locales?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      return super.toLocaleTimeString(locales, { timeZone: tz, ...opts });
    }
  }
  return ZonedDate as unknown as DateConstructor;
}

/** Makes the global Date work in this zone (until the next call; useZone(null) restores the real one). */
export function useZone(tz: string | null): void {
  (globalThis as { Date: DateConstructor }).Date = tz ? zonedDate(tz) : RealDate;
}
