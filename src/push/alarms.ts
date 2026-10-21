// Notification alarms: the exact moments this player's deadlines should be told (a warning a few hours before,
// a note when time ran out), worked out by the app from the save and kept in the cloud (push_alarms). A job
// looks for due ones once a minute and the reminders function sends them, without reading any save.
// Pure, so the tests and the app share it.
import type { Task } from '../core/types';
import { isDone, type TimeCfg } from '../core/time';
import { WARN_MS, activeOn, byTimeOf, dayEnd, deadlineIsMine, hasLimit, stakesAt, windowOf, type Stakes } from '../game/deadlines';
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
/**
 * Windows that ended this recently are planned again while still undone: a device whose clock runs a little
 * ahead must not leave out (and so delete from the cloud) a "time's up" the job is about to send. The cloud
 * ignores alarms already in the past, so nothing is sent twice.
 */
const RECENT_MS = 10 * 60_000;

/** Player-written text (quest titles) shortened to fit a notification line. */
const clip = (s: unknown, max: number) => {
  const chars = [...String(s ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/** `at`, or the next moment reminders may ring when it falls in the quiet night hours (as party news). Used for
 * warnings only: "time's up" goes out the moment time runs out, night or not. */
export function awake(at: number, prefs: PushPrefs): number {
  if (partyHours(at, prefs)) return at;
  const d = new Date(at);
  const start = Math.min(prefs.morningHour, 9);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (d.getHours() >= 22 ? 1 : 0), start).getTime();
}

/** One time window of a quest still to be done, with a moment inside it (to read its period from). */
interface Win {
  start: number;
  end: number;
  probe: number;
}

/** The quest's time windows that end after `since` and within the next few days, still to be done. */
function windowsAhead(task: Task, since: number, now: number, cfg: TimeCfg): Win[] {
  if (task.repeat.kind === 'none') {
    const w = windowOf(task, now, cfg);
    return w && w.end > since && !task.doneFor && !task.deadlineOutcome ? [{ ...w, probe: Math.min(now, w.end - 1) }] : [];
  }
  const out: Win[] = [];
  let probe = since;
  for (let i = 0; i < ALARM_DAYS + 3 && probe < now + ALARM_DAYS * DAY; i++) {
    const w = windowOf(task, probe, cfg);
    if (!w) break;
    // done already (this window), or a day a "some days" quest is off: nothing to tell
    if (w.end > since && !out.some((o) => o.end === w.end) && activeOn(task, probe, cfg) && !isDone(task, probe, cfg)) out.push({ ...w, probe });
    // always forward: where summer time ends, a window can end an hour before the logical day does
    probe = Math.max(w.end, dayEnd(probe, cfg), probe + 3600_000) + 1000;
  }
  return out;
}

/** One quest's warning or "time's up", before same-moment ones are put together. */
interface Note {
  kind: 'warn' | 'missed';
  task: Task;
  end: number;
  at: number;
  stakes: Stakes | null;
  /** the app has already counted this miss (a device clock running ahead reaches it first) */
  counted?: boolean;
}

const dueAt = (end: number) => new Date(end).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
const leftOf = (end: number, at: number) => {
  const mins = Math.max(1, Math.round((end - at) / 60_000));
  return mins < 60 ? t('{n} min', { n: mins }) : t('{n}h', { n: Math.round(mins / 60) });
};

function warnText({ task, end, at, stakes }: Note): Pick<Alarm, 'title' | 'body'> {
  const left = leftOf(end, at);
  const due = dueAt(end);
  const name = clip(task.title, 60);
  const misses = task.misses ?? 0;
  return {
    title: stakes === 'must' ? t('⚠️ {left} left: {name}', { left, name }) : t('⏳ {left} left: {name}', { left, name }),
    body:
      misses > 0 && stakes
        ? t("Missed {misses}× in a row already. Don't make it {next}. Due {at}.", { misses, next: misses + 1, at: due })
        : stakes === 'must'
          ? t('A must-do, due {at}. Missing it costs gold.', { at: due })
          : stakes === 'flexible'
            ? t('Due {at}. Missing it costs a little gold.', { at: due })
            : t('Due {at}.', { at: due }),
  };
}

function missedText({ task, end, stakes, counted }: Note): Pick<Alarm, 'title' | 'body'> {
  const name = clip(task.title, 60);
  const n = counted ? Math.max(1, task.misses ?? 1) : (task.misses ?? 0) + 1;
  // repeating quests: the hero takes the hit as soon as the app notices; one-offs are still asked first
  const once = task.repeat.kind === 'none';
  return {
    title: stakes === 'must' ? t('💥 Missed: {name}', { name }) : t('⌛ Missed: {name}', { name }),
    body: once
      ? !stakes
        ? t('Time ran out. Tap to say what happened.')
        : n > 1
          ? t('That makes {n}× in a row. Tap to decide: more time, call it off, or take the hit.', { n })
          : t('Tap to decide: more time, call it off, or take the hit.')
      : !stakes
        ? t('It was due {at}.', { at: dueAt(end) })
        : n > 1
          ? t("Did you do it? Tap to answer. If not, that's {n}× in a row and your hero takes the hit.", { n })
          : t('Did you do it? Tap to answer. If not, your hero takes the hit.'),
  };
}

/** "Read, Walk, Floss" (the first few, then "+N more"), to fit a notification. */
function names(notes: Note[]): string {
  const shown = notes.slice(0, 4).map((x) => clip(x.task.title, 30));
  const rest = notes.length - shown.length;
  return rest > 0 ? t('{names} +{n} more', { names: shown.join(', '), n: rest }) : shown.join(', ');
}

/** Several quests whose time runs out (or that are due soon) at the same moment: one notification, not a burst. */
function groupText(notes: Note[]): Pick<Alarm, 'title' | 'body'> {
  const n = notes.length;
  const must = notes.some((x) => x.stakes === 'must');
  const list = names(notes);
  if (notes[0].kind === 'warn') {
    const left = leftOf(notes[0].end, notes[0].at);
    return {
      title: must ? t('⚠️ {left} left: {n} quests', { left, n }) : t('⏳ {left} left: {n} quests', { left, n }),
      body: `${list}. ${t('Due {at}.', { at: dueAt(notes[0].end) })}`,
    };
  }
  const hit = notes.some((x) => x.stakes && x.task.repeat.kind !== 'none');
  const ask = notes.some((x) => x.task.repeat.kind === 'none');
  return {
    title: must ? t("💥 Time's up: {n} quests", { n }) : t("⌛ Time's up: {n} quests", { n }),
    body: `${list}. ${hit ? t('Did you do them? Tap to answer. If not, your hero takes the hits.') : ask ? t('Tap to say what happened.') : t('Time ran out.')}`,
  };
}

/**
 * Every alarm this player's quests need over the next few days, soonest first: a warning WARN_MS before
 * each deadline (moved out of the quiet night hours, while still worth it) and a "time's up" the moment it
 * runs out, night or not (one-off quests, repeating ones whose miss costs something or that have a "done by"
 * time). Quests due at the same moment share one notification. On party lists, only the quests this player
 * made.
 */
export function alarmsFor(state: NudgeState, now: number, cfg: TimeCfg, prefs: PushPrefs): Alarm[] {
  if (!state.hero) return [];
  const notes: Note[] = [];
  for (const task of Object.values(state.tasks)) {
    const l = state.lists[task.listId];
    if (task.deleted || !l || l.deleted || l.type === 'supply' || !deadlineIsMine(task, l, state.hero.name, state.accountId) || !hasLimit(task, cfg)) continue;
    const once = task.repeat.kind === 'none';
    const timed = once || byTimeOf(task) !== null;
    for (const w of windowsAhead(task, now - RECENT_MS, now, cfg)) {
      // a miss the app has already counted: answered means nothing more to tell, else it is told as counted
      const counted = !once && task.missedEnd !== undefined && w.end <= task.missedEnd;
      if (counted && task.pendingMiss?.end !== w.end) continue;
      const stakes = stakesAt(task, w.probe, cfg);
      // a plain repeating quest whose period began before the default stakes came in: nothing to tell
      if (!stakes && !timed) continue;
      const warnAt = awake(w.end - WARN_MS, prefs);
      // (planned a little into the past too, like time's up: the cloud ignores alarms already gone by)
      if (warnAt > now - RECENT_MS && w.end - warnAt >= MIN_WARNING_MS) notes.push({ kind: 'warn', task, end: w.end, at: warnAt, stakes });
      notes.push({ kind: 'missed', task, end: w.end, at: w.end, stakes, counted });
    }
  }
  const groups = new Map<string, Note[]>();
  for (const x of notes) {
    if (x.at >= now + ALARM_DAYS * DAY) continue;
    const k = `${x.kind}@${x.at}@${x.end}`;
    const g = groups.get(k);
    if (g) g.push(x);
    else groups.set(k, [x]);
  }
  const out: Alarm[] = [];
  for (const g of groups.values()) {
    const { kind, task, end, at } = g[0];
    const tag = kind === 'warn' ? 'deadline' : 'missed';
    if (g.length === 1) out.push({ key: `${kind}:${task.id}@${end}`, at, tag: `${tag}-${task.id}`, ...(kind === 'warn' ? warnText(g[0]) : missedText(g[0])) });
    else {
      g.sort((a, b) => (a.task.order ?? 0) - (b.task.order ?? 0) || a.task.title.localeCompare(b.task.title));
      out.push({ key: `${kind}:@${end}`, at, tag: `${tag}-${end}`, ...groupText(g) });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key)).slice(0, MAX_ALARMS);
}
