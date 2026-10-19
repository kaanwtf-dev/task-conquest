// "Did you finish it?": one-off quests whose deadline passed while they were still open. The player may have
// done it and forgotten to tick it, so the game asks instead of punishing right away.
import { useStore } from '../../state/store';
import { askDue } from '../../game/deadlines';
import { iconFor } from '../../pixel/iconGen';
import { PxImg, Sheet, useNow } from './common';

export default function DeadlineAsk() {
  const now = useNow(60_000);
  const task = useStore((s) => {
    if (!s.hero) return undefined;
    return Object.values(s.tasks).find((t) => {
      const l = s.lists[t.listId];
      // party lists: someone else may have done it, nobody gets asked
      return !!l && !l.deleted && !l.shared && l.type !== 'supply' && askDue(t, now);
    });
  });
  const answer = useStore((s) => s.answerDeadline);
  const update = useStore((s) => s.updateTask);
  if (!task) return null;
  const late = Math.max(1, Math.round((now - task.deadline!) / 3600_000));
  return (
    <Sheet onClose={() => update(task.id, { askedAt: Date.now() })} className="deadline-ask">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PxImg src={iconFor(task.title, task.icon)} size={44} />
        <div>
          <div className="win-title">Did you finish it?</div>
          <div className="ask-title">{task.title}</div>
        </div>
      </div>
      <p className="ask-text">
        Its deadline passed {late < 48 ? `${late}h` : `${Math.round(late / 24)} days`} ago.
        {task.stakes === 'must'
          ? ' It was a must-do: missing it costs gold, and more time costs a little too.'
          : task.stakes === 'flexible'
            ? ' Missing it costs a little gold.'
            : ''}
        {task.misses ? ` Missed ${task.misses}× in a row already.` : ''}
      </p>
      <div className="sheet-actions" style={{ flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={() => answer(task.id, 'missed')}>
          Missed it
        </button>
        <button className="btn ghost" onClick={() => answer(task.id, 'later')}>
          +1 day
        </button>
        <button className="btn" onClick={() => answer(task.id, 'done')}>
          Done ✓
        </button>
      </div>
    </Sheet>
  );
}
