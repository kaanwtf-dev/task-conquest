// "Did you finish it?": one-off quests whose deadline passed while they were still open. The player may have
// done it and forgotten to tick it, so the game asks instead of punishing right away.
import { useStore } from '../../state/store';
import { askDue, deadlineOf } from '../../game/deadlines';
import { iconFor } from '../../pixel/iconGen';
import { PxImg, Sheet, useNow } from './common';
import { t } from '../../i18n';

/** After an answer, the next question waits a while: overdue quests come one at a time, not in a burst. */
const NEXT_ASK_MS = 30 * 60_000;
let answeredAt = 0;

export default function DeadlineAsk() {
  const now = useNow(60_000);
  const cfg = useStore((s) => s.settings);
  const task = useStore((s) => {
    if (!s.hero || now - answeredAt < NEXT_ASK_MS) return undefined;
    return Object.values(s.tasks).find((t) => {
      const l = s.lists[t.listId];
      // party lists: someone else may have done it, nobody gets asked
      return !!l && !l.deleted && !l.shared && l.type !== 'supply' && askDue(t, now, cfg);
    });
  });
  const answerDeadline = useStore((s) => s.answerDeadline);
  const update = useStore((s) => s.updateTask);
  if (!task) return null;
  const answer = (id: string, a: Parameters<typeof answerDeadline>[1]) => {
    answeredAt = Date.now();
    answerDeadline(id, a);
  };
  const late = Math.max(1, Math.round((now - (deadlineOf(task, cfg) ?? now)) / 3600_000));
  return (
    <Sheet
      onClose={() => {
        answeredAt = Date.now();
        update(task.id, { askedAt: Date.now() });
      }}
      className="deadline-ask"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PxImg src={iconFor(task.title, task.icon)} size={44} />
        <div>
          <div className="win-title">{t('Did you finish it?')}</div>
          <div className="ask-title">{task.title}</div>
        </div>
      </div>
      <p className="ask-text">
        {late < 48 ? t('It was due {n}h ago.', { n: late }) : t('It was due {n} days ago.', { n: Math.round(late / 24) })}
        {task.stakes === 'must'
          ? ` ${t('It was a must-do: missing it costs gold, and more time costs a little too.')}`
          : task.stakes === 'flexible'
            ? ` ${t('Missing it costs a little gold.')}`
            : ''}
        {task.misses ? ` ${t('Missed {n}× in a row already.', { n: task.misses })}` : ''}
      </p>
      <div className="sheet-actions" style={{ flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={() => answer(task.id, 'missed')}>
          {t('Missed it')}
        </button>
        <button className="btn ghost" onClick={() => answer(task.id, 'later')}>
          {t('+1 day')}
        </button>
        <button className="btn" onClick={() => answer(task.id, 'done')}>
          {t('Done ✓')}
        </button>
      </div>
    </Sheet>
  );
}
