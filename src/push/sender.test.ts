import { afterEach, describe, expect, it } from 'vitest';
import type { RemoteRow } from '../sync/types';
import { PUSH_ENDPOINT, payload, runReminders, sanitizeHistory, sanitizePrefs, stateFromRows, validZone, type Cloud, type SubRow } from './sender';
import type { PushHistory } from './nudges';

const U = 'user-a';
const P = 'user-b';
const apple = (n: string) => `https://web.push.apple.com/${n}`;
const sub = (endpoint: string, extra: Partial<SubRow> = {}): SubRow => ({
  endpoint, user_id: U, p256dh: 'k', auth: 'a', tz: 'Europe/Istanbul', prefs: { morningHour: 9, eveningHour: 20 }, history: {}, ...extra,
});

// Istanbul is UTC+3 all year: 06:30Z is 09:30 there, 17:30Z is 20:30
const MORNING = Date.UTC(2026, 9, 15, 6, 30);
const EVENING = Date.UTC(2026, 9, 15, 17, 30);
const NOON = Date.UTC(2026, 9, 15, 9, 30);

const hero = (activeDays: string[]): RemoteRow => ({
  id: `hero:${U}`, kind: 'hero', list_id: null, updated_at: 1, deleted: false, owner: U,
  data: { id: 'hero', name: 'Aria', activeDays, savedDays: [], bossIndex: 1, bossDamage: {}, appearance: {}, classId: 'knight' },
});
const listRow = (id: string, owner = U, extra: Record<string, unknown> = {}): RemoteRow => ({
  id, kind: 'list', list_id: id, updated_at: 1, deleted: false, owner,
  data: { id, name: id, type: 'daily', theme: 'forest', skill: 'lore', color: '#fff', order: 0, createdAt: 1, ...extra },
});
const taskRow = (id: string, listId: string, extra: Record<string, unknown> = {}): RemoteRow => ({
  id, kind: 'task', list_id: listId, updated_at: 1, deleted: false, owner: U,
  data: { id, listId, title: id, difficulty: 2, repeat: { kind: 'daily' }, order: 0, createdAt: 1, timesDone: 0, ...extra },
});

function fakeCloud(subs: SubRow[], rows: Record<string, RemoteRow[]>) {
  const histories = new Map<string, PushHistory>();
  const forgotten: string[] = [];
  const beats: unknown[] = [];
  const cloud: Cloud = {
    subscriptions: async () => subs.map((s) => ({ ...s, history: histories.get(s.endpoint) ?? s.history })),
    docs: async (u) => rows[u] ?? [],
    saveHistory: async (e, h) => void histories.set(e, h),
    forget: async (e) => void forgotten.push(e),
    heartbeat: async (s) => void beats.push(s),
  };
  return { cloud, histories, forgotten, beats };
}

const zones: string[] = [];
const setZone = (tz: string) => {
  zones.push(tz);
  process.env.TZ = tz;
};
const TZ0 = process.env.TZ;
afterEach(() => {
  if (TZ0 === undefined) delete process.env.TZ;
  else process.env.TZ = TZ0;
  zones.length = 0;
});

describe('reminder sender', () => {
  const rows = { [U]: [hero(['2026-10-14']), listRow('D'), taskRow('Read', 'D'), taskRow('Walk', 'D')] };

  it("sends each device its slot's reminder once, in the player's own time zone", async () => {
    const f = fakeCloud([sub(apple('A'))], rows);
    const sent: string[] = [];
    const run = (now: number) =>
      runReminders({ cloud: f.cloud, now, mode: 'run', appUrl: 'https://app/', setZone, send: async (_s, p) => (sent.push(p), 'ok') });
    expect((await run(NOON)).sent).toBe(0); // 12:30 in Istanbul: no slot
    const first = await run(MORNING);
    expect(first).toMatchObject({ devices: 1, due: 1, sent: 1 });
    expect(zones).toContain('Europe/Istanbul');
    const msg = JSON.parse(sent[0]);
    expect(msg.web_push).toBe(8030);
    expect(msg.notification).toMatchObject({ title: '⚔️ 2 quests today', navigate: 'https://app/', tag: 'questlog-plan' });
    expect(msg.app_badge).toBe(2); // top level: WebKit ignores it inside "notification"
    expect(f.histories.get(apple('A'))?.sent?.morning).toBe('2026-10-15');
    expect((await run(MORNING + 20 * 60_000)).sent).toBe(0); // the next run in the same slot stays quiet
    expect(f.beats).toHaveLength(3);
  });

  it('saves a streak in the evening slot', async () => {
    const f = fakeCloud([sub(apple('A'))], { [U]: [hero(['2026-10-13', '2026-10-14']), listRow('D'), taskRow('Read', 'D')] });
    const sent: string[] = [];
    await runReminders({ cloud: f.cloud, now: EVENING, mode: 'run', appUrl: 'https://app/', setZone, send: async (_s, p) => (sent.push(p), 'ok') });
    expect(JSON.parse(sent[0]).notification.title).toBe('🔥 Your 2-day streak is on the line');
    expect(f.histories.get(apple('A'))?.sent?.evening).toBe('2026-10-15');
  });

  it('dry runs touch nothing; test runs reach every device right away', async () => {
    const f = fakeCloud([sub(apple('A')), sub(apple('B'), { user_id: P })], rows);
    const sent: string[] = [];
    const send = async (_s: SubRow, p: string) => (sent.push(p), 'ok' as const);
    const dry = await runReminders({ cloud: f.cloud, now: MORNING, mode: 'dry-run', appUrl: 'https://app/', setZone, send });
    expect(dry).toMatchObject({ due: 1, sent: 0 });
    expect(sent).toHaveLength(0);
    expect(f.histories.size).toBe(0);
    expect(f.beats).toHaveLength(0);
    const test = await runReminders({ cloud: f.cloud, now: NOON, mode: 'test', appUrl: 'https://app/', setZone, send });
    expect(test).toMatchObject({ due: 2, sent: 2 });
    expect(JSON.parse(sent[0]).notification.title).toBe('🔔 Test reminder');
    expect(f.histories.size).toBe(0); // a test never uses up a real reminder
  });

  it('forgets devices the push service no longer knows, and never posts anywhere else', async () => {
    const f = fakeCloud([sub(apple('gone')), sub('https://evil.example.com/hook'), sub(apple('cfg'))], rows);
    const tried: string[] = [];
    const stats = await runReminders({
      cloud: f.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone,
      send: async (s) => (tried.push(s.endpoint), s.endpoint.endsWith('gone') ? 'gone' : 'config'),
    });
    expect(tried).toEqual([apple('gone'), apple('cfg')]);
    expect(stats).toMatchObject({ gone: 1, config: 1, failed: 1 });
    expect(f.forgotten).toEqual([apple('gone')]);
  });

  it('drops devices whose app has not been opened for two months', async () => {
    const old = new Date(MORNING - 61 * 86_400_000).toISOString();
    const recent = new Date(MORNING - 5 * 86_400_000).toISOString();
    const f = fakeCloud([sub(apple('old'), { updated_at: old }), sub(apple('new'), { updated_at: recent })], rows);
    const tried: string[] = [];
    const stats = await runReminders({ cloud: f.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone, send: async (s) => (tried.push(s.endpoint), 'ok') });
    expect(tried).toEqual([apple('new')]);
    expect(f.forgotten).toEqual([apple('old')]);
    expect(stats).toMatchObject({ gone: 1, sent: 1 });
  });

  it('reads the party lists a player is in', () => {
    const shared = listRow('S', P, { type: 'supply' });
    const s = stateFromRows([hero([]), listRow('D'), shared, taskRow('Eggs', 'S'), { ...taskRow('Old', 'D'), deleted: true }], U);
    expect(s.hero?.name).toBe('Aria');
    expect(Object.keys(s.lists).sort()).toEqual(['D', 'S']);
    expect(s.lists.S.shared).toBe(true);
    expect(Object.keys(s.tasks)).toEqual(['Eggs']);
  });
});

describe('sender resilience', () => {
  const good = { [U]: [hero(['2026-10-14']), listRow('D'), taskRow('Read', 'D')] };

  it("one player's broken save or a cloud hiccup never costs everyone else their reminder", async () => {
    const bad = { ...hero(['2026-10-14']), id: `hero:${P}`, owner: P };
    bad.data = { ...bad.data, activeDays: [1, null, '2026-10-14'], savedDays: 7, name: 'Bob' };
    const rows = { ...good, [P]: [bad, listRow('E', P), { ...taskRow('Walk', 'E'), owner: P }] };
    const f = fakeCloud([sub(apple('P'), { user_id: P }), sub(apple('X'), { user_id: 'flaky' }), sub(apple('A'))], rows);
    const docs = f.cloud.docs;
    f.cloud.docs = async (u) => (u === 'flaky' ? Promise.reject(new Error('503')) : docs(u));
    const sent: string[] = [];
    const stats = await runReminders({ cloud: f.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone, send: async (s) => (sent.push(s.endpoint), 'ok') });
    expect(sent).toEqual([apple('P'), apple('A')]); // the malformed save still gets its plan
    expect(stats).toMatchObject({ devices: 3, sent: 2, failed: 1 });
    expect(f.beats).toHaveLength(1);
    // a hero the app itself would not accept is simply skipped
    bad.data = { ...bad.data, name: 42 };
    expect(stateFromRows(rows[P], P).hero).toBeNull();
  });

  it('writes the heartbeat even when the subscription list cannot be read', async () => {
    const f = fakeCloud([], good);
    f.cloud.subscriptions = async () => Promise.reject(new Error('down'));
    await expect(runReminders({ cloud: f.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone, send: async () => 'ok' })).rejects.toThrow('down');
    expect(f.beats).toHaveLength(1);
  });

  it('drops a device made for another key, but blames the key when nothing gets through', async () => {
    const two = fakeCloud([sub(apple('old')), sub(apple('ok'))], good);
    const s1 = await runReminders({ cloud: two.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone, send: async (s) => (s.endpoint.endsWith('old') ? 'config' : 'ok') });
    expect(s1).toMatchObject({ sent: 1, gone: 1, config: 0 });
    expect(two.forgotten).toEqual([apple('old')]);
    const all = fakeCloud([sub(apple('a')), sub(apple('b'))], good);
    const s2 = await runReminders({ cloud: all.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone, send: async () => 'config' });
    expect(s2).toMatchObject({ sent: 0, config: 2 });
    expect(all.forgotten).toEqual([]); // the devices are fine; the setup is not
  });

  it('keeps every message well inside the 4 KB limit, whatever the quests are called', async () => {
    const long = 'Ş'.repeat(3000);
    const f = fakeCloud([sub(apple('A'))], { [U]: [hero(['2026-10-14']), listRow('D'), taskRow(long, 'D'), taskRow(long + '2', 'D')] });
    const sent: string[] = [];
    await runReminders({ cloud: f.cloud, now: MORNING, mode: 'run', appUrl: 'https://app/', setZone, send: async (_s, p) => (sent.push(p), 'ok') });
    expect(new TextEncoder().encode(sent[0]).length).toBeLessThan(1500);
    expect(JSON.parse(sent[0]).notification.body).toMatch(/…/);
  });
});

describe('sender input hygiene', () => {
  it('falls back to defaults for anything malformed', () => {
    expect(sanitizePrefs({ morningHour: 7, eveningHour: 30, off: ['party', 'nope'], dayStartHour: 4, weekStart: '1' })).toEqual({
      morningHour: 7, eveningHour: 20, off: ['party'], dayStartHour: 4, weekStart: 1,
    });
    expect(sanitizePrefs(null).morningHour).toBe(9);
    expect(sanitizeHistory({ sent: { morning: '2026-10-15', evening: 'yesterday' }, comebacks: -1 })).toEqual({ sent: { morning: '2026-10-15' }, comebacks: 0 });
    expect(validZone('America/New_York')).toBe('America/New_York');
    expect(validZone('Mars/Olympus')).toBe('UTC');
    expect(validZone(42)).toBe('UTC');
  });

  it('only accepts real push services', () => {
    for (const ok of [apple('x'), 'https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x'])
      expect(PUSH_ENDPOINT.test(ok)).toBe(true);
    for (const bad of ['http://web.push.apple.com/x', 'https://web.push.apple.com.evil.com/x', 'https://evil.com/web.push.apple.com/', 'https://localhost/x'])
      expect(PUSH_ENDPOINT.test(bad)).toBe(false);
  });

  it('keeps the message small and the badge a plain number', () => {
    const p = payload({ title: 't', body: 'b'.repeat(500), tag: 'x', badge: 4.4 }, 'https://app/');
    expect(new TextEncoder().encode(p).length).toBeLessThan(4096);
    expect(JSON.parse(p).app_badge).toBe(4);
  });
});
