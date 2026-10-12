import { useMemo, useState } from 'react';
import { useStore, listTasks, LIST_TYPE_INFO } from '../../state/store';
import { isActiveToday, isDone, msUntilReset, fmtDuration, repeatLabel } from '../../core/time';
import { DIFFICULTY } from '../../game/progression';
import { iconFor } from '../../pixel/iconGen';
import { AISLES } from '../../pixel/keywords';
import { SceneBanner, Stars, PxImg, Ui, useNow, useMedia, themeStyle } from '../components/common';
import { markTap, haptic } from '../components/Effects';
import { sfx, unlockAudio } from '../../audio/sfx';
import type { Task, TaskList } from '../../core/types';

export default function QuestsScreen() {
  const s = useStore();
  const list = s.activeListId ? s.lists[s.activeListId] : undefined;
  const wide = useMedia('(min-width: 900px)');
  const now = useNow(20000);
  if (!list || list.deleted) return <div className="empty">No lists yet. Create one!</div>;
  const tasks = listTasks(s, list.id);
  const cfg = s.settings;
  const info = LIST_TYPE_INFO[list.type];

  const active = tasks.filter((t) => isActiveToday(t, now, cfg));
  const doneCount = active.filter((t) => isDone(t, now, cfg)).length;
  const reset = msUntilReset(info.repeat, now, cfg);

  return (
    <div className="scroll" style={themeStyle(list.theme)}>
      <SceneBanner theme={list.theme} height={wide ? 56 : 52} scale={wide ? 3 : 2}>
        <div className="banner-info">
          <div className="win banner-title">
            {list.name}
            <div className="banner-sub">
              {list.type === 'supply'
                ? `${tasks.filter((t) => !t.doneFor).length} to buy · ${tasks.length} remembered`
                : reset != null
                  ? `${info.label} · resets in ${fmtDuration(reset)}`
                  : info.hint}
            </div>
          </div>
          {list.type !== 'supply' && active.length > 0 && (
            <div className="win banner-progress">
              {doneCount}/{active.length}
            </div>
          )}
        </div>
      </SceneBanner>

      <QuickAdd list={list} />

      {list.type === 'supply' ? <SupplyView list={list} tasks={tasks} /> : <TaskView tasks={tasks} now={now} />}
    </div>
  );
}

function QuickAdd({ list }: { list: TaskList }) {
  const addTask = useStore((s) => s.addTask);
  const tasks = useStore((s) => s.tasks);
  const [text, setText] = useState('');
  const supply = list.type === 'supply';
  const suggestions = useMemo(() => {
    if (!supply || text.trim().length < 1) return [];
    const q = text.trim().toLowerCase();
    return Object.values(tasks)
      .filter((t) => t.listId === list.id && !t.deleted && t.doneFor && t.title.toLowerCase().includes(q))
      .sort((a, b) => b.timesDone - a.timesDone)
      .slice(0, 5);
  }, [supply, text, tasks, list.id]);

  const submit = () => {
    if (!text.trim()) return;
    unlockAudio();
    addTask(list.id, text);
    sfx.pop();
    setText('');
  };
  return (
    <>
      <form
        className="win quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={supply ? 'Add item… (remembers everything)' : 'Add a quest…'}
          enterKeyHint="done"
          aria-label="New item"
        />
        {text.trim() && <PxImg src={iconFor(text)} size={36} style={{ alignSelf: 'center' }} />}
        <button className="btn" type="submit" aria-label="Add">
          <Ui name="plus" size={14} />
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="pantry" style={{ paddingTop: 0 }}>
          {suggestions.map((t) => (
            <button key={t.id} className="pchip" onClick={() => (addTask(list.id, t.title), setText(''), sfx.pop())}>
              <PxImg src={iconFor(t.title, t.icon)} size={24} />
              {t.title}
              <span className="plus">+</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function TaskRow({ task, done, inactive }: { task: Task; done: boolean; inactive?: boolean }) {
  const toggle = useStore((s) => s.toggleTask);
  const haptics = useStore((s) => s.settings.haptics);
  const sfxOn = useStore((s) => s.settings.sfx > 0);
  const d = DIFFICULTY[task.difficulty];
  const rl = repeatLabel(task.repeat);
  return (
    <div className={`task ${done ? 'done' : ''}`} style={inactive ? { opacity: 0.45 } : undefined}>
      <button
        className={`check ${done ? 'on' : ''}`}
        aria-label={done ? 'Mark not done' : 'Complete'}
        onClick={(e) => {
          unlockAudio();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          markTap(r.left + r.width / 2 + 40, r.top);
          if (sfxOn) (done ? sfx.uncheck : sfx.check)();
          if (haptics) haptic();
          toggle(task.id);
        }}
      >
        {done && <Ui name="check" size={22} />}
      </button>
      <PxImg className="ticon" src={iconFor(task.title, task.icon)} size={32} />
      <div className="tmain">
        <div className="ttitle">{task.title}</div>
        {(rl || task.due || inactive || task.qty) && (
          <div className="tmeta">
            {rl && (
              <>
                <Ui name="repeat" size={12} /> {rl}
              </>
            )}
            {task.qty && <span>×{task.qty}</span>}
            {task.due && <span>Due {task.due}</span>}
            {inactive && <span>Not today</span>}
          </div>
        )}
      </div>
      {task.difficulty > 0 && <Stars n={d.stars} />}
    </div>
  );
}

function TaskView({ tasks, now }: { tasks: Task[]; now: number }) {
  const cfg = useStore((s) => s.settings);
  const open = tasks.filter((t) => isActiveToday(t, now, cfg) && !isDone(t, now, cfg));
  const done = tasks.filter((t) => isActiveToday(t, now, cfg) && isDone(t, now, cfg));
  const later = tasks.filter((t) => !isActiveToday(t, now, cfg));
  return (
    <>
      <div className="win tasks">
        {open.length === 0 && <div className="empty">All clear! The realm is safe… for now.</div>}
        {open.map((t) => (
          <TaskRow key={t.id} task={t} done={false} />
        ))}
      </div>
      {done.length > 0 && (
        <>
          <div className="section-label">Slain ({done.length})</div>
          <div className="win tasks">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} done />
            ))}
          </div>
        </>
      )}
      {later.length > 0 && (
        <>
          <div className="section-label">Not scheduled today</div>
          <div className="win tasks">
            {later.map((t) => (
              <TaskRow key={t.id} task={t} done={false} inactive />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SupplyView({ list, tasks }: { list: TaskList; tasks: Task[] }) {
  const s = useStore();
  const need = tasks.filter((t) => !t.doneFor);
  const pantry = tasks.filter((t) => t.doneFor).sort((a, b) => Number(!!b.staple) - Number(!!a.staple) || b.timesDone - a.timesDone);
  const groups = new Map<string, Task[]>();
  for (const t of need) {
    const a = t.aisle ?? 'other';
    groups.set(a, [...(groups.get(a) ?? []), t]);
  }
  const ordered = [...groups.entries()].sort((a, b) => (AISLES[a[0]]?.order ?? 99) - (AISLES[b[0]]?.order ?? 99));
  const staplesMissing = pantry.filter((t) => t.staple).length;

  return (
    <>
      <div className="win tasks">
        {need.length === 0 && <div className="empty">Nothing to buy. Tap items below to restock.</div>}
        {ordered.map(([aisle, items]) => (
          <div key={aisle}>
            <div className="section-label" style={{ margin: '8px 6px 2px' }}>
              {AISLES[aisle]?.name ?? 'Other'}
            </div>
            {items.map((t) => (
              <TaskRow key={t.id} task={t} done={false} />
            ))}
          </div>
        ))}
      </div>
      {staplesMissing > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => {
              const n = s.restockStaples(list.id);
              if (n) sfx.loot();
            }}
          >
            ⟳ Restock staples ({staplesMissing})
          </button>
        </div>
      )}
      {pantry.length > 0 && (
        <>
          <div className="section-label">Pantry · tap to add back</div>
          <div className="win pantry">
            {pantry.map((t) => (
              <button
                key={t.id}
                className={`pchip ${t.staple ? 'staple' : ''}`}
                onClick={() => {
                  sfx.pop();
                  s.updateTask(t.id, { doneFor: null, rewardedFor: null });
                }}
              >
                <PxImg src={iconFor(t.title, t.icon)} size={24} />
                {t.title}
                <span className="plus">+</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
