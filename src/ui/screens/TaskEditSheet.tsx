import { useState } from 'react';
import { useStore, visibleLists } from '../../state/store';
import { DIFFICULTY, taskXp, heroLevel } from '../../game/progression';
import { iconFor, firstEmoji } from '../../pixel/iconGen';
import { AISLES } from '../../pixel/keywords';
import { todayKey } from '../../core/time';
import type { Difficulty, Repeat, Task } from '../../core/types';
import { PxImg, themeStyle } from '../components/common';
import { sfx } from '../../audio/sfx';

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
    <div className="sheet-back" onClick={onClose}>
      <form
        className="win sheet"
        style={themeStyle(list.theme)}
        onClick={(e) => e.stopPropagation()}
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
          <button type="button" className={`pill ${!emojiText ? 'sel' : ''}`} onClick={() => setEmojiText('')}>
            Auto
          </button>
          {QUICK_ICONS.map((e) => (
            <button type="button" key={e} className={`pill ${emojiText === e ? 'sel' : ''}`} style={{ padding: 3 }} onClick={() => setEmojiText(e)} aria-label={e}>
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
                  <button type="button" key={k} className={`pill ${(draft.aisle ?? 'other') === k ? 'sel' : ''}`} onClick={() => patch({ aisle: k })}>
                    {a.name}
                  </button>
                ))}
            </Field>
            <Field label="Staple (restock button re-adds it)">
              {[true, false].map((v) => (
                <button type="button" key={String(v)} className={`pill ${!!draft.staple === v ? 'sel' : ''}`} onClick={() => patch({ staple: v })}>
                  {v ? 'Staple ★' : 'No'}
                </button>
              ))}
            </Field>
          </>
        ) : (
          <>
            <Field label="Difficulty">
              {DIFFICULTY.map((d, i) => (
                <button type="button" key={d.name} className={`pill ${draft.difficulty === i ? 'sel' : ''}`} onClick={() => patch({ difficulty: i as Difficulty })}>
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
                <button type="button" key={k} className={`pill ${draft.repeat.kind === k ? 'sel' : ''}`} onClick={() => setRepeat(k)}>
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
                        className={`pill ${on ? 'sel' : ''}`}
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
              <input className="text-in" type="date" style={{ maxWidth: 200 }} value={draft.due ?? ''} onChange={(e) => patch({ due: e.target.value || undefined })} />
              {draft.due && (
                <button type="button" className="pill" onClick={() => patch({ due: undefined })}>
                  Clear
                </button>
              )}
            </Field>
            <Field label="Notes">
              <textarea className="text-in" rows={3} value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value || undefined })} style={{ width: '100%', resize: 'vertical' }} />
            </Field>
          </>
        )}

        <Field label="List">
          {lists.map((l) => (
            <button type="button" key={l.id} className={`pill ${draft.listId === l.id ? 'sel' : ''}`} onClick={() => patch({ listId: l.id })}>
              {l.name}
            </button>
          ))}
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
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
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '2px dashed rgba(255,255,255,.08)' }}>
      <div className="pixel" style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
    </div>
  );
}
