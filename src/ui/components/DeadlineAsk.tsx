// "What happened?": a time-limited quest whose time ran out (a one-off past its deadline, or a repeating
// quest's window that ended undone). The player may have done it and forgotten to tick it, may want more
// time, may call it off, or takes the hit. Unanswered questions count as missed after a while (store).
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { SNOOZE_MS, answerCost, deadlineOf, moreTimeOptions, needsAnswer, nextDeadline, type MissAnswer } from '../../game/deadlines';
import { heroGold, heroLevel } from '../../game/progression';
import { iconFor } from '../../pixel/iconGen';
import { PxImg, Sheet, useNow } from './common';
import { sfx } from '../../audio/sfx';
import { locale, t } from '../../i18n';
import type { Task } from '../../core/types';

/** After an answer that hurt, the next question waits so the hero's hit can be seen. */
const AFTER_HIT_MS = 1800;

export default function DeadlineAsk() {
  useNow(60_000); // a minute later, newly overdue quests are asked about
  const cfg = useStore((s) => s.settings);
  const tasks = useStore((s) => s.tasks);
  const [holdUntil, setHoldUntil] = useState(0);
  const [, rerender] = useState(0);
  // ask right when a deadline passes (or a closed question is due again), and as soon as the app is back on
  // screen: a phone pauses the minute timer while the app is in the background
  useEffect(() => {
    const at = Date.now();
    const all = Object.values(tasks);
    let next = nextDeadline(all, at, cfg);
    for (const x of all) if (x.askedAt && x.askedAt + SNOOZE_MS > at && (next === null || x.askedAt + SNOOZE_MS < next)) next = x.askedAt + SNOOZE_MS;
    const timer = next === null ? undefined : setTimeout(() => rerender((n) => n + 1), Math.min(next - at + 500, 2_000_000_000));
    const wake = () => document.visibilityState === 'visible' && rerender((n) => n + 1);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [tasks, cfg]);
  useEffect(() => {
    if (!holdUntil) return;
    const id = setTimeout(() => rerender((n) => n + 1), Math.max(0, holdUntil - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [holdUntil]);
  const waiting = useStore((s) => {
    if (!s.hero) return '';
    const at = Date.now();
    return Object.values(s.tasks)
      .filter((x) => {
        const l = s.lists[x.listId];
        // party lists: someone else may have done it, nobody gets asked
        return !!l && !l.deleted && !l.shared && l.type !== 'supply' && needsAnswer(x, at, cfg);
      })
      .sort((a, b) => endOf(a, cfg) - endOf(b, cfg))
      .map((x) => x.id)
      .join(' ');
  });
  const ids = waiting ? waiting.split(' ') : [];
  const task = useStore((s) => (ids[0] ? s.tasks[ids[0]] : undefined));
  if (!task || Date.now() < holdUntil) return null;
  return <Ask key={task.id} task={task} count={ids.length} onHit={() => setHoldUntil(Date.now() + AFTER_HIT_MS)} />;
}

/** When the time ran out, for ordering and the "due ... ago" line. */
function endOf(task: Task, cfg: Parameters<typeof deadlineOf>[1]): number {
  return task.repeat.kind === 'none' ? (deadlineOf(task, cfg) ?? 0) : (task.pendingMiss?.end ?? 0);
}

function Ask({ task, count, onHit }: { task: Task; count: number; onHit: () => void }) {
  const cfg = useStore((s) => s.settings);
  const hero = useStore((s) => s.hero)!;
  const resolveMiss = useStore((s) => s.resolveMiss);
  const update = useStore((s) => s.updateTask);
  const [more, setMore] = useState(false);
  const at = Date.now();
  const once = task.repeat.kind === 'none';
  const gold = heroGold(hero);
  const level = heroLevel(hero).level;
  const cost = (a: MissAnswer) => answerCost(task, a, gold, level);
  const fee = (a: MissAnswer) => (cost(a) ? ` · ${t('−{gold}g', { gold: cost(a) })}` : '');
  const options = moreTimeOptions(task, at, cfg);
  const answer = (a: MissAnswer) => {
    if (a === 'missed' || cost(a) > 0) onHit();
    else sfx.tick();
    resolveMiss(task.id, a);
  };

  const late = Math.max(0, at - endOf(task, cfg));
  const hours = Math.round(late / 3600_000);
  const due =
    late < 3600_000
      ? t('Time ran out {n} min ago.', { n: Math.max(1, Math.round(late / 60_000)) })
      : hours < 48
        ? t('Time ran out {n}h ago.', { n: hours })
        : t('Time ran out {n} days ago.', { n: Math.round(hours / 24) });
  const misses = task.misses ?? 0;
  const total = task.missTotal ?? 0;
  const label = (ms: number) => {
    if (!once && ms > 3 * 3600_000) return t('Until {time}', { time: new Date(at + ms).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) });
    return ms >= 86_400_000 ? t('+1 day') : ms >= 3 * 3600_000 ? t('+3 hours') : t('+1 hour');
  };

  return (
    <Sheet
      onClose={() => {
        // asked again in a while
        update(task.id, { askedAt: Date.now() });
      }}
      className="deadline-ask"
    >
      <div className="ask-head">
        <PxImg src={iconFor(task.title, task.icon)} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="win-title">{task.stakes === 'must' ? t("💥 Time's up!") : t("⌛ Time's up!")}</div>
          <div className="ask-title">{task.title}</div>
        </div>
        {count > 1 && <div className="ask-count">{t('{n} waiting', { n: count })}</div>}
      </div>
      <p className="ask-text">
        {due}{' '}
        {task.stakes === 'must'
          ? t('It was a must-do.')
          : task.stakes === 'flexible'
            ? t('It was flexible.')
            : ''}
      </p>
      <div className={`ask-misses ${misses ? 'bad' : ''}`}>
        {misses
          ? t('💀 Missed {n}× in a row · {total} total', { n: misses, total })
          : total
            ? t('Missed {total}× so far, but not last time.', { total })
            : t('Never missed yet. Keep it that way!')}
      </div>
      <div className="ask-q">{t('What happened?')}</div>
      <div className="ask-actions">
        <button className="btn ok" onClick={() => answer('done')}>
          {t('✓ I did it')}
        </button>
        {options.length > 0 &&
          (more ? (
            <div className="ask-more">
              {options.map((ms) => (
                <button key={ms} className="btn ghost small" onClick={() => answer({ more: ms })}>
                  {label(ms)}
                  {fee({ more: ms })}
                </button>
              ))}
            </div>
          ) : (
            <button className="btn ghost" onClick={() => (sfx.tick(), setMore(true))}>
              {t('⏳ More time')}
            </button>
          ))}
        <button className="btn ghost" onClick={() => answer('cancel')}>
          {once ? t('✕ Cancel quest') : t('✕ Skip this time')}
          {fee('cancel')}
        </button>
        <button className="btn bad" onClick={() => answer('missed')}>
          {t('💥 I missed it')}
          {fee('missed')}
        </button>
      </div>
      <p className="ask-foot">
        {task.stakes === 'must'
          ? t('More time or calling it off still costs half: it was a must-do.')
          : task.stakes === 'flexible'
            ? t('More time and calling it off are free for flexible quests.')
            : t('This quest has no stakes, so missing it costs nothing.')}{' '}
        {t('No answer within a day counts as missed.')}
      </p>
    </Sheet>
  );
}
