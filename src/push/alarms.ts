// Notification alarms: the exact moments this player's deadlines should be told (a warning a few hours before,
// a note when time ran out), worked out by the app from the save and kept in the cloud (push_alarms). A job
// looks for due ones once a minute and the reminders function sends them, without reading any save.
// Pure, so the tests and the app share it.
import type { Task } from '../core/types';
import { isDone, type TimeCfg } from '../core/time';
import { WARN_MS, activeOn, dayEnd, hasLimit, stakesOf, windowOf } from '../game/deadlines';
import { locale, t } from '../i18n';
import { partyHours, type NudgeState, type PushPrefs } from './nudges';

export interface Alarm {
  /** what it is about, stable across rewrites: "warn:<task>@<window end>" / "missed:<task>@<window end>" */
  key: string;
  /** when to send it (ms) */
  at: number;
  title: string;
  body: string;
  /** replaces an older notification about the same quest */
  tag: string;
}

const DAY = 86_400_000;
/** Alarms are written this far ahead; the app rewrites them whenever it is opened or the quests change. */
export const ALARM_DAYS = 3;
/** At most this many per player (the cloud refuses more). */
export const MAX_ALARMS = 100;
/** A warning that could only go out this close to the deadline isn't worth sending. */
const MIN_WARNING_MS = 10 * 60_000;

/** Player-written text (quest titles) shortened to fit a notification line. */
const clip = (s: unknown, max: number) => {
  const chars = [...String(s ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/** `at`, or the next moment reminders may ring when it falls in the quiet night hours (as party news). */
export function awake(at: number, prefs: PushPrefs): number {
  if (partyHours(at, prefs)) return at;
  const d = new Date(at);
  const start = Math.min(prefs.morningHour, 9);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (d.getHours() >= 22 ? 1 : 0), start).getTime();
}

/** The quest's time windows that end after `now` and within the next few days, still to be done. */
function windowsAhead(task: Task, now: number, cfg: TimeCfg): { start: number; end: number }[] {
  if (task.repeat.kind === 'none') {
    const w = windowOf(task, now, cfg);
    return w && w.end > now && !task.doneFor && !task.deadlineOutcome ? [w] : [];
  }
  const out: { start: number; end: number }[] = [];
  let probe = now;
  for (let i = 0; i < ALARM_DAYS + 2 && probe < now + ALARM_DAYS * DAY; i++) {
    const w = windowOf(task, probe, cfg);
    if (!w) break;
    // done already (this window), or a day a "some days" quest is off: nothing to tell
    if (w.end > now && !out.some((o) => o.end === w.end) && activeOn(task, probe, cfg) && !isDone(task, probe, cfg)) out.push(w);
    probe = Math.max(w.end, dayEnd(probe, cfg)) + 1000;
  }
  return out;
}

function warnText(task: Task, end: number, at: number): Pick<Alarm, 'title' | 'body'> {
  const mins = Math.max(1, Math.round((end - at) / 60_000));
  const left = mins < 60 ? t('{n} min', { n: mins }) : t('{n}h', { n: Math.round(mins / 60) });
  const due = new Date(end).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  const name = clip(task.title, 60);
  const misses = task.misses ?? 0;
  const stakes = stakesOf(task);
  return {
    title: stakes === 'must' ? t('⚠️ {left} left: {name}', { left, name }) : t('⏳ {left} left: {name}', { left, name }),
    body:
      misses > 0
        ? t("Missed {misses}× in a row already. Don't make it {next}. Due {at}.", { misses, next: misses + 1, at: due })
        : stakes === 'must'
          ? t('A must-do, due {at}. Missing it costs gold.', { at: due })
          : stakes === 'flexible'
            ? t('Due {at}. Missing it costs a little gold.', { at: due })
            : t('Due {at}.', { at: due }),
  };
}

function missedText(task: Task): Pick<Alarm, 'title' | 'body'> {
  const name = clip(task.title, 60);
  const n = (task.misses ?? 0) + 1;
  const stakes = stakesOf(task);
  // repeating quests: the hero takes the hit as soon as the app notices; one-offs are still asked first
  const once = task.repeat.kind === 'none';
  return {
    title: stakes === 'must' ? t('💥 Missed: {name}', { name }) : t('⌛ Missed: {name}', { name }),
    body: !stakes
      ? t('Time ran out. Tap to say what happened.')
      : !once
        ? n > 1
          ? t('{n}× in a row: your hero takes the hit. Did it after all? Tap to say so.', { n })
          : t('Your hero takes the hit. Did it after all? Tap to say so.')
        : n > 1
          ? t('That makes {n}× in a row. Tap to decide: more time, call it off, or take the hit.', { n })
          : t('Tap to decide: more time, call it off, or take the hit.'),
  };
}

/**
 * Every alarm this player's quests need over the next few days, soonest first: a warning WARN_MS before
 * each deadline (or as soon as the quiet hours end, while it is still worth it) and a note when the time
 * runs out (repeating quests only when missing them costs something). Party lists are left out: the whole
 * party shares those.
 */
export function alarmsFor(state: NudgeState, now: number, cfg: TimeCfg, prefs: PushPrefs): Alarm[] {
  if (!state.hero) return [];
  const out: Alarm[] = [];
  for (const task of Object.values(state.tasks)) {
    const l = state.lists[task.listId];
    if (task.deleted || !l || l.deleted || l.shared || l.type === 'supply' || !hasLimit(task, cfg)) continue;
    for (const w of windowsAhead(task, now, cfg)) {
      const warnAt = awake(Math.max(now, w.end - WARN_MS), prefs);
      if (w.end - WARN_MS > now && w.end - warnAt >= MIN_WARNING_MS)
        out.push({ key: `warn:${task.id}@${w.end}`, at: warnAt, tag: `deadline-${task.id}`, ...warnText(task, w.end, warnAt) });
      if (task.repeat.kind === 'none' || stakesOf(task))
        out.push({ key: `missed:${task.id}@${w.end}`, at: awake(w.end, prefs), tag: `missed-${task.id}`, ...missedText(task) });
    }
  }
  return out.filter((a) => a.at < now + ALARM_DAYS * DAY).sort((a, b) => a.at - b.at).slice(0, MAX_ALARMS);
}
