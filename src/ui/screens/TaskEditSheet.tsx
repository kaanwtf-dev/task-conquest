import { useId, useState } from 'react';
import { useStore, visibleLists } from '../../state/store';
import { DIFFICULTY, taskXp, heroLevel } from '../../game/progression';
import { iconFor, firstEmoji } from '../../pixel/iconGen';
import { AISLES } from '../../pixel/keywords';
import { todayKey } from '../../core/time';
import type { Difficulty, Repeat, Task } from '../../core/types';
import { PxImg, Sheet, themeStyle } from '../components/common';
import { sfx } from '../../audio/sfx';
import { takeOffList } from '../groceries';

const QUICK_ICONS = ['⭐', '🔥', '💼', '🏠', '🧹', '🛒', '📚', '🏋️', '💊', '🐶', '🎮', '🎁', '💰', '📞', '✈️', '🍳', '🧺', '🌱'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type RepeatKind = Repeat['kind'];

export default function TaskEditSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const s = useStore();
  const task = s.tasks[taskId];
  const list = task ? s.lists[task.listId] : undefined;
  const [orig] = useState<Task | undefined>(task);
  const [draft, setDraft] = useState<Task | undefined>(task);
  const [emojiText, setEmojiText] = useState(task?.icon ?? '');
  const [everyText, setEveryText] = useState<string | null>(null);
  if (!task || !draft || !list || !orig) return null;

  const level = s.hero ? heroLevel(s.hero).level : 1;
  const supply = list.type === 'supply';
  const lists = visibleLists(s);
  const patch = (p: Partial<Task>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setRepeat = (kind: RepeatKind) => {
    const cfg = s.settings;
    const r: Repeat =
      kind === 'days'
        ? { kind, days: draft.repeat.kind === 'days' ? draft.repeat.days : [1, 3, 5] }
        : kind === 'interval'
          ? { kind, every: draft.repeat.kind === 'interval' ? draft.repeat.every : 2, anchor: todayKey(Date.now(), cfg) }
          : { kind };
    patch({ repeat: r });
  };

  const save = () => {
    // only write fields this sheet edits and that actually changed, so a completion that synced in
    // from a party member while the sheet was open isn't reverted
    const edited: Partial<Task> = {
      title: draft.title.trim() || orig.title,
      notes: draft.notes,
      difficulty: draft.difficulty,
      repeat: draft.repeat,
      due: draft.due,
      deadline: draft.deadline,
      deadlineSetAt: draft.deadlineSetAt,
      askedAt: draft.askedAt,
      deadlineOutcome: draft.deadlineOutcome,
      byTime: draft.byTime,
      stakes: draft.stakes,
      qty: draft.qty,
      aisle: draft.aisle,
      staple: draft.staple,
      icon: emojiText.trim() ? firstEmoji(emojiText) ?? undefined : undefined,
    };
    const patch: Partial<Task> = {};
    for (const [k, v] of Object.entries(edited) as [keyof Task, unknown][])
      if (JSON.stringify(v) !== JSON.stringify(orig[k])) (patch as Record<string, unknown>)[k] = v;
    if (Object.keys(patch).length) s.updateTask(orig.id, patch);
    if (draft.listId !== orig.listId) s.moveTask(orig.id, draft.listId);
    sfx.pop();
    onClose();
  };

  return (
    <Sheet onClose={onClose} style={themeStyle(list.theme)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PxImg src={iconFor(draft.title, firstEmoji(emojiText) ?? undefined)} size={44} />
          <div className="win-title">{supply ? 'Edit item' : 'Edit quest'}</div>
        </div>

        <Field label="Title">
          <input className="text-in" value={draft.title} onChange={(e) => patch({ title: e.target.value })} aria-label="Title" />
        </Field>

        <Field label="Icon (auto, or pick / type any emoji)">
          <button type="button" className={`pill ${!emojiText ? 'sel' : ''}`} aria-pressed={!emojiText} onClick={() => setEmojiText('')}>
            Auto
          </button>
          {QUICK_ICONS.map((e) => (
            <button type="button" key={e} className={`pill ${emojiText === e ? 'sel' : ''}`} aria-pressed={emojiText === e} style={{ padding: 3 }} onClick={() => setEmojiText(e)} aria-label={e}>
              <PxImg src={iconFor('', e)} size={26} />
            </button>
          ))}
          <input className="text-in" style={{ maxWidth: 120 }} value={emojiText} onChange={(e) => setEmojiText(e.target.value)} placeholder="😀" aria-label="Custom emoji" />
        </Field>

        {supply ? (
          <>
            <Field label="Quantity">
              <input className="text-in" style={{ maxWidth: 140 }} value={draft.qty ?? ''} onChange={(e) => patch({ qty: e.target.value || undefined })} placeholder="e.g. 2, 1kg" />
            </Field>
            <Field label="Aisle">
              {Object.entries(AISLES)
                .sort((a, b) => a[1].order - b[1].order)
                .map(([k, a]) => (
                  <button type="button" key={k} className={`pill ${(draft.aisle ?? 'other') === k ? 'sel' : ''}`} aria-pressed={(draft.aisle ?? 'other') === k} onClick={() => patch({ aisle: k })}>
                    {a.name}
                  </button>
                ))}
            </Field>
            <Field label="Staple (restock button re-adds it)">
              {[true, false].map((v) => (
                <button type="button" key={String(v)} className={`pill ${!!draft.staple === v ? 'sel' : ''}`} aria-pressed={!!draft.staple === v} onClick={() => patch({ staple: v })}>
                  {v ? 'Staple ★' : 'No'}
                </button>
              ))}
            </Field>
          </>
        ) : (
          <>
            <Field label="Difficulty (set automatically from the name; change it if it's off)">
              {DIFFICULTY.map((d, i) => (
                <button type="button" key={d.name} className={`pill ${draft.difficulty === i ? 'sel' : ''}`} aria-pressed={draft.difficulty === i} onClick={() => patch({ difficulty: i as Difficulty })}>
                  {d.name} <span style={{ opacity: 0.7, fontSize: 13 }}>+{taskXp(level, i as Difficulty)}xp</span>
                </button>
              ))}
            </Field>
            <Field label="Repeat">
              {(
                [
                  ['none', 'Never'],
                  ['daily', 'Daily'],
                  ['days', 'Some days'],
                  ['weekly', 'Weekly'],
                  ['monthly', 'Monthly'],
                  ['interval', 'Every N days'],
                ] as [RepeatKind, string][]
              ).map(([k, label]) => (
                <button type="button" key={k} className={`pill ${draft.repeat.kind === k ? 'sel' : ''}`} aria-pressed={draft.repeat.kind === k} onClick={() => setRepeat(k)}>
                  {label}
                </button>
              ))}
              {draft.repeat.kind === 'days' && (
                <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
                  {DAY_LETTERS.map((l, i) => {
                    const r = draft.repeat as Extract<Repeat, { kind: 'days' }>;
                    const on = r.days.includes(i);
                    return (
                      <button
                        type="button"
                        key={i}
                        className={`pill ${on ? 'sel' : ''}`} aria-pressed={on}
                        style={{ width: 38 }}
                        onClick={() => {
                          const days = on ? r.days.filter((d) => d !== i) : [...r.days, i].sort();
                          if (days.length) patch({ repeat: { kind: 'days', days } });
                        }}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              )}
              {draft.repeat.kind === 'interval' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 4, fontSize: 15 }}>
                  Every
                  <input
                    className="text-in"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    style={{ maxWidth: 80 }}
                    value={everyText ?? String(draft.repeat.every)}
                    onChange={(e) => {
                      // keep the raw text while typing (so it can be cleared); clamp into the draft
                      setEveryText(e.target.value);
                      const n = Math.max(1, Math.min(365, Math.round(Number(e.target.value)) || 1));
                      const r = draft.repeat as Extract<Repeat, { kind: 'interval' }>;
                      patch({ repeat: { ...r, every: n } });
                    }}
                    onBlur={() => setEveryText(null)}
                  />
                  days
                </label>
              )}
            </Field>
            <Field label="Due date">
              <input className="text-in" type="date" aria-label="Due date" style={{ maxWidth: 200 }} value={draft.due ?? ''} onChange={(e) => patch({ due: e.target.value || undefined })} />
              {draft.due && (
                <button type="button" className="pill" onClick={() => patch({ due: undefined })}>
                  Clear
                </button>
              )}
            </Field>
            <TimeLimit draft={draft} patch={patch} />
            <Field label="Notes">
              <textarea className="text-in" rows={3} aria-label="Notes" value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value || undefined })} style={{ width: '100%', resize: 'vertical' }} />
            </Field>
          </>
        )}

        <Field label="List">
          {lists.map((l) => (
            <button type="button" key={l.id} className={`pill ${draft.listId === l.id ? 'sel' : ''}`} aria-pressed={draft.listId === l.id} onClick={() => patch({ listId: l.id })}>
              {l.name}
            </button>
          ))}
        </Field>

        <div className="sheet-actions">
          {supply && !task.doneFor ? (
            // on the shopping list: take it off without buying it (undo-able, so no confirm)
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                onClose();
                takeOffList(task);
              }}
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (confirm(supply ? `Forget "${task.title}" completely?` : `Delete "${task.title}"?`)) {
                  s.deleteTask(task.id);
                  sfx.uncheck();
                  onClose();
                }
              }}
            >
              {supply ? 'Forget' : 'Delete'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit">
              Save
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ms -> the value of a datetime-local input (local time). */
const localInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const endOfDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};

/** Deadline (one-off quests) or a daily "done by" time (repeating ones), and what missing it costs. */
function TimeLimit({ draft, patch }: { draft: Task; patch: (p: Partial<Task>) => void }) {
  const once = draft.repeat.kind === 'none';
  // a new deadline starts a new countdown and a new "did you do it?"
  const setDeadline = (deadline: number | undefined) =>
    patch({ deadline, deadlineSetAt: deadline ? Date.now() : undefined, askedAt: undefined, deadlineOutcome: undefined });
  const hasLimit = once ? !!draft.deadline : true;
  const everyDay = draft.repeat.kind === 'daily' || draft.repeat.kind === 'days';
  const period = { weekly: 'week', monthly: 'month', interval: 'period' }[draft.repeat.kind as string] ?? 'day';
  const quick: [string, () => number][] = [
    ['1 hour', () => Date.now() + 3600_000],
    ['Tonight', () => (endOfDay(0) - Date.now() > 3600_000 ? endOfDay(0) : endOfDay(1))],
    ['Tomorrow', () => endOfDay(1)],
    ['1 week', () => endOfDay(7)],
  ];
  return (
    <>
      {once ? (
        <Field label="Deadline (a countdown bar fills the row)">
          {quick.map(([label, at]) => (
            <button type="button" key={label} className="pill" onClick={() => setDeadline(at())}>
              {label}
            </button>
          ))}
          <input
            className="text-in"
            type="datetime-local"
            aria-label="Deadline"
            style={{ flex: '1 1 220px', minWidth: 200, maxWidth: 280 }}
            value={draft.deadline ? localInput(draft.deadline) : ''}
            onChange={(e) => setDeadline(e.target.value ? new Date(e.target.value).getTime() || undefined : undefined)}
          />
          {draft.deadline && (
            <button type="button" className="pill" onClick={() => setDeadline(undefined)}>
              Clear
            </button>
          )}
        </Field>
      ) : !everyDay ? null : (
        <Field label="Done by (time of day; empty = by the end of the day)">
          <input
            className="text-in"
            type="time"
            aria-label="Done by"
            style={{ maxWidth: 140 }}
            value={draft.byTime ?? ''}
            onChange={(e) => patch({ byTime: e.target.value || undefined })}
          />
          {draft.byTime && (
            <button type="button" className="pill" onClick={() => patch({ byTime: undefined })}>
              Clear
            </button>
          )}
        </Field>
      )}
      {hasLimit && (
        <Field label={once ? 'If you miss it' : `If it isn't done ${everyDay && draft.byTime ? `by ${draft.byTime}` : `by the end of the ${period}`}`}>
          {(
            [
              [undefined, 'Nothing'],
              ['flexible', 'Flexible · small loss'],
              ['must', 'Must do · it hurts'],
            ] as [Task['stakes'], string][]
          ).map(([k, label]) => (
            <button type="button" key={label} className={`pill ${draft.stakes === k ? 'sel' : ''}`} aria-pressed={draft.stakes === k} onClick={() => patch({ stakes: k })}>
              {label}
            </button>
          ))}
        </Field>
      )}
    </>
  );
}

/** A labelled row of controls; the label names the group for screen readers (inputs also carry their own). */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div style={{ padding: '10px 0', borderBottom: '2px dashed rgba(255,255,255,.08)' }}>
      <div id={id} className="pixel" style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
        {label}
      </div>
      <div role="group" aria-labelledby={id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}
