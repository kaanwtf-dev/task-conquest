import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hero, Task, TaskList } from '../core/types';
import { dateKey } from '../core/time';
import { bossFor } from '../game/bosses';
import { setLang, t } from '../i18n';
import { DEFAULT_PUSH_PREFS, deadlineNudge, pickNudge, type NudgeState } from './nudges';
import { payload, testNudge } from './sender';

const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime(); // October 2026, local time
const day = (d: number) => dateKey(new Date(2026, 9, d));
const list = (id: string, extra: Partial<TaskList> = {}): TaskList =>
  ({ id, name: id, type: 'quests', theme: 'forest', skill: 'lore', color: '', order: 0, createdAt: 1, updatedAt: 1, ...extra }) as TaskList;
const task = (id: string, listId: string, extra: Partial<Task> = {}): Task =>
  ({ id, listId, title: id, difficulty: 2, repeat: { kind: 'daily' }, order: 0, createdAt: 1, updatedAt: 1, timesDone: 0, ...extra }) as Task;
const hero = (extra: Partial<Hero> = {}): Hero => ({ name: 'Aria', activeDays: [], savedDays: [], bossIndex: 1, bossDamage: {}, ...extra }) as unknown as Hero;
const state = (h: Hero, tasks: Task[]): NudgeState => ({
  hero: h,
  lists: { D: list('D', { type: 'daily' }), Q: list('Q') },
  tasks: Object.fromEntries(tasks.map((x) => [x.id, x])),
});

describe('reminders in Turkish', () => {
  beforeEach(() => setLang('tr'));
  afterEach(() => setLang('en'));

  it("writes the morning plan in the player's language", () => {
    const tasks = [task('Diş fırçala', 'D', { difficulty: 1 }), task('Spor', 'D', { difficulty: 4 }), task('Oku', 'D', { difficulty: 3 })];
    const n = pickNudge(state(hero({ activeDays: [day(14)] }), tasks), at(15, 9), 'morning', DEFAULT_PUSH_PREFS)!;
    expect(n.title).toBe('⚔️ Bugün 3 görev');
    expect(n.body).toBe(`Spor, Oku +1 tane daha. ${t(bossFor(1).name)}: ${bossFor(1).maxHp.toLocaleString('tr-TR')} HP kaldı.`);
  });

  it('warns about a streak and a deadline in Turkish', () => {
    const h = hero({ activeDays: [day(12), day(13), day(14)] });
    const n = pickNudge(state(h, [task('Oku', 'D')]), at(15, 20), 'evening', DEFAULT_PUSH_PREFS)!;
    expect(n.title).toBe('🔥 3 günlük serin tehlikede');
    expect(n.body).toBe('Gün sıfırlanmadan bir görev bitir, seri yaşasın (1 görev bekliyor).');

    const end = at(15, 18);
    const d = deadlineNudge(state(h, [task('Vergi', 'Q', { repeat: { kind: 'none' }, deadline: end, stakes: 'must' })]), end - 30 * 60_000, DEFAULT_PUSH_PREFS);
    expect(d?.nudge.title).toBe('⚠️ 30 dk kaldı: Vergi');
    expect(d?.nudge.body).toBe('Şart görev, son saat 18:00. Kaçırırsan altın gider.');
  });

  it('sends the test reminder in Turkish, marked as Turkish', () => {
    const n = testNudge(state(hero(), []));
    expect(n.title).toBe('🔔 Deneme hatırlatıcısı');
    expect(n.body).toBe('Merhaba Aria! Task Conquest hatırlatıcıları bu cihaza ulaşıyor.');
    expect(JSON.parse(payload(n, 'https://x.test')).notification.lang).toBe('tr-TR');
  });
});
