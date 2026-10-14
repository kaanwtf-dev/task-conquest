import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore, listTasks, visibleLists, LIST_TYPE_INFO, TODAY_ID } from '../../state/store';
import { isActiveToday, isDone, msUntilReset, fmtDuration, repeatLabel, todayKey } from '../../core/time';
import { DIFFICULTY } from '../../game/progression';
import { iconFor } from '../../pixel/iconGen';
import { AISLES } from '../../pixel/keywords';
import { SceneBanner, Stars, PxImg, Ui, useNow, useMedia, themeStyle } from '../components/common';
import { markTap, haptic } from '../components/Effects';
import { sfx, unlockAudio } from '../../audio/sfx';
import type { Task, TaskList } from '../../core/types';
import TaskEditSheet from './TaskEditSheet';
import { todaySections } from '../../state/today';
import BossBar from '../components/BossBar';
import PartyStrip from '../components/PartyStrip';
import { ListSheet } from './OtherScreens';
import { takeOffList } from '../groceries';

/** Only what the list screens read: the hero's progress changing on every kill must not re-render them. */
const listState = (st: ReturnType<typeof useStore.getState>) => ({ activeListId: st.activeListId, lists: st.lists, tasks: st.tasks, settings: st.settings });

export default function QuestsScreen() {
  const s = useStore(useShallow(listState));
  const wide = useMedia('(min-width: 900px)');
  const now = useNow(20000);
  const [editTask, setEditTask] = useState<string | null>(null);
  const [editList, setEditList] = useState(false);

  if (s.activeListId === TODAY_ID) return <TodayView now={now} wide={wide} onEdit={setEditTask} editTask={editTask} closeEdit={() => setEditTask(null)} />;

  const chosen = s.activeListId ? s.lists[s.activeListId] : undefined;
  // the active list can vanish underneath us (left a party list, deleted on another device)
  const list = chosen && !chosen.deleted ? chosen : visibleLists(s)[0];
  if (!list) return <div className="scroll"><div className="empty">No lists yet. Create one!</div></div>;
  const tasks = listTasks(s, list.id);
  const cfg = s.settings;
  const info = LIST_TYPE_INFO[list.type];
  const active = tasks.filter((t) => isActiveToday(t, now, cfg));
  const doneCount = active.filter((t) => isDone(t, now, cfg)).length;
  const reset = msUntilReset(info.repeat, now, cfg);

  return (
    <div className="scroll" key={list.id} style={themeStyle(list.theme)}>
      <BossBar />
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {list.type !== 'supply' && active.length > 0 && (
              <div className="win banner-progress">
                {doneCount}/{active.length}
              </div>
            )}
            <button className="win banner-progress banner-edit" onClick={() => setEditList(true)} aria-label="Edit list">
              ⋯
            </button>
          </div>
        </div>
      </SceneBanner>
      {list.shared && <PartyStrip list={list} />}

      <QuickAdd list={list} />

      {list.type === 'supply' ? (
        <SupplyView list={list} tasks={tasks} onEdit={setEditTask} />
      ) : (
        <TaskView tasks={tasks} now={now} onEdit={setEditTask} />
      )}
      {editTask && <TaskEditSheet taskId={editTask} onClose={() => setEditTask(null)} />}
      {editList && <ListSheet key={list.id} editId={list.id} onClose={() => setEditList(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Today

function TodayView({ now, wide, onEdit, editTask, closeEdit }: { now: number; wide: boolean; onEdit: (id: string) => void; editTask: string | null; closeEdit: () => void }) {
  const s = useStore(useShallow(listState));
  const cfg = s.settings;
  const lists = visibleLists(s).filter((l) => l.type !== 'supply');
  const { overdue, dueToday, routine, week, doneToday } = todaySections(s.lists, s.tasks, now, cfg);
  const total = overdue.length + dueToday.length + routine.length + doneToday.length;
  const date = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const section = (label: string, items: Task[], done = false) =>
    items.length > 0 && (
      <>
        <div className="section-label">{label}</div>
        <div className="win tasks">
          {items.map((t) => (
            <TaskRow key={t.id} task={t} done={done} onEdit={onEdit} showList />
          ))}
        </div>
      </>
    );

  return (
    <div className="scroll" style={themeStyle('castle')}>
      <BossBar />
      <SceneBanner theme="castle" height={wide ? 56 : 52} scale={wide ? 3 : 2}>
        <div className="banner-info">
          <div className="win banner-title">
            Today
            <div className="banner-sub">{date}</div>
          </div>
          {total > 0 && (
            <div className="win banner-progress">
              {doneToday.length}/{total}
            </div>
          )}
        </div>
      </SceneBanner>
      <QuickAdd
        list={
          lists.find((l) => l.type === 'quests' && !l.shared) ??
          lists.find((l) => l.type === 'custom' && !l.shared) ??
          lists.find((l) => !l.shared) ??
          lists[0]
        }
        dueToday
      />
      {overdue.length + dueToday.length + routine.length + week.length === 0 && (
        <div className="win tasks">
          <div className="empty">Nothing due today. Go touch some grass, adventurer.</div>
        </div>
      )}
      {section('Overdue', overdue)}
      {section('Due today', dueToday)}
      {section('Daily routine', routine)}
      {section('This week', week)}
      {section(`Slain today (${doneToday.length})`, doneToday, true)}
      {editTask && <TaskEditSheet taskId={editTask} onClose={closeEdit} />}
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces

function QuickAdd({ list, dueToday }: { list?: TaskList; dueToday?: boolean }) {
  const addTask = useStore((s) => s.addTask);
  const tasks = useStore((s) => s.tasks);
  const cfg = useStore((s) => s.settings);
  const [text, setText] = useState('');
  const supply = list?.type === 'supply';
  const suggestions = useMemo(() => {
    if (!list || !supply || text.trim().length < 1) return [];
    const q = text.trim().toLowerCase();
    return Object.values(tasks)
      .filter((t) => t.listId === list.id && !t.deleted && t.doneFor && t.title.toLowerCase().includes(q))
      .sort((a, b) => b.timesDone - a.timesDone)
      .slice(0, 5);
  }, [supply, text, tasks, list]);
  if (!list) return null;

  const submit = () => {
    if (!text.trim()) return;
    unlockAudio();
    addTask(list.id, text, dueToday ? { due: todayKey(Date.now(), cfg), repeat: { kind: 'none' } } : undefined);
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
          placeholder={supply ? 'Add item… (remembers everything)' : dueToday ? `Add a quest for today → ${list.name}` : 'Add a quest…'}
          data-quickadd
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

let lastToggle = { t: 0, id: '', y: 0 };

interface RowProps {
  task: Task;
  done: boolean;
  inactive?: boolean;
  showList?: boolean;
  onEdit: (id: string) => void;
  sortable?: ReturnType<typeof useSortable>;
}

/**
 * A task row: this wrapper takes the drag-and-drop props (which change for every row whenever the list
 * changes), and the memoized body holds everything costly, so it only re-renders for its own task.
 */
const TaskRow = memo(function TaskRow({ task, done, inactive, showList, onEdit, sortable }: RowProps) {
  const style = sortable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: inactive ? 0.45 : 1 }
    : inactive
      ? { opacity: 0.45 }
      : undefined;
  return (
    <div
      ref={sortable?.setNodeRef}
      className={`task ${done ? 'done' : ''} ${sortable?.isDragging ? 'dragging' : ''}`}
      style={style}
      {...(sortable ? { ...sortable.attributes, ...sortable.listeners, role: 'listitem', 'aria-roledescription': 'draggable quest' } : {})}
      onClick={() => onEdit(task.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onEdit(task.id);
        } else (sortable?.listeners as { onKeyDown?: (ev: React.KeyboardEvent) => void } | undefined)?.onKeyDown?.(e);
      }}
    >
      <TaskRowBody task={task} done={done} inactive={inactive} showList={showList} />
    </div>
  );
});

const TaskRowBody = memo(function TaskRowBody({ task, done, inactive, showList }: Pick<RowProps, 'task' | 'done' | 'inactive' | 'showList'>) {
  const toggle = useStore((s) => s.toggleTask);
  const haptics = useStore((s) => s.settings.haptics);
  const sfxOn = useStore((s) => s.settings.sfx > 0);
  const listName = useStore((s) => (showList ? s.lists[task.listId]?.name : undefined));
  const shared = useStore((s) => !!s.lists[task.listId]?.shared);
  const d = DIFFICULTY[task.difficulty];
  const rl = repeatLabel(task.repeat);
  return (
    <>
      <button
        className={`check ${done ? 'on' : ''}`}
        aria-label={done ? `Mark ${task.title} not done` : `Complete ${task.title}`}
        data-check={task.id}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          // rows reflow when a task completes; a quick second tap at the same spot must not hit the next task
          const r0 = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const now = Date.now();
          if (now - lastToggle.t < 380 && lastToggle.id !== task.id && Math.abs(lastToggle.y - r0.top) < 12) return;
          lastToggle = { t: now, id: task.id, y: r0.top };
          unlockAudio();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          markTap(r.left + r.width / 2 + 40, r.top);
          if (sfxOn) (done ? sfx.uncheck : sfx.check)();
          if (haptics) haptic();
          const byKeyboard = e.detail === 0;
          toggle(task.id);
          // the row moves to another section (remounts): keep keyboard focus on the same task
          if (byKeyboard)
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-check="${window.CSS.escape(task.id)}"]`)?.focus());
        }}
      >
        {done && <Ui name="check" size={22} />}
      </button>
      <PxImg className="ticon" src={iconFor(task.title, task.icon)} size={32} />
      <div className="tmain">
        <div className="ttitle">{task.title}</div>
        {(rl || task.due || inactive || task.qty || listName || task.notes || (shared && task.doneBy)) && (
          <div className="tmeta">
            {listName && <span className="tlist">{listName}</span>}
            {shared && done && task.doneBy && <span className="tlist">✓ {task.doneBy}</span>}
            {rl && (
              <>
                <Ui name="repeat" size={12} /> {rl}
              </>
            )}
            {task.qty && <span>×{task.qty}</span>}
            {task.due &&
              (task.due < todayKey(Date.now(), useStore.getState().settings) && !done ? (
                <span className="overdue">Overdue {task.due}</span>
              ) : (
                <span>Due {task.due}</span>
              ))}
            {task.notes && <span>✎</span>}
            {inactive && <span>Not today</span>}
          </div>
        )}
      </div>
      {task.difficulty > 0 && <Stars n={d.stars} />}
    </>
  );
});

const SortableRow = memo(function SortableRow(props: Omit<RowProps, 'sortable'>) {
  const sortable = useSortable({ id: props.task.id });
  return <TaskRow {...props} sortable={sortable} />;
});

/** Long-press (touch) or drag (mouse) to reorder; a tap still opens the editor. */
function SortableTasks({ tasks, onEdit }: { tasks: Task[]; onEdit: (id: string) => void }) {
  const reorder = useStore((s) => s.reorderTasks);
  const allTasks = useStore((s) => s.tasks);
  const listId = tasks[0]?.listId;
  const listTaskIds = useMemo(() => (listId ? listTasks({ tasks: allTasks }, listId).map((t) => t.id) : []), [allTasks, listId]);
  const justDragged = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
  // the same ids array while the order is unchanged: a new one re-renders every sortable row
  const idsKey = tasks.map((t) => t.id).join('\n');
  const ids = useMemo(() => (idsKey ? idsKey.split('\n') : []), [idsKey]);
  const onDragEnd = (e: DragEndEvent) => {
    justDragged.current = Date.now();
    if (!e.over || e.active.id === e.over.id) return;
    const moved = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    // put the reordered open tasks back into the slots open tasks held; done / not-today tasks stay put
    const open = new Set(ids);
    const slots = listTaskIds.map((id, i) => (open.has(id) ? i : -1)).filter((i) => i >= 0);
    const full = [...listTaskIds];
    slots.forEach((slot, i) => (full[slot] = moved[i]));
    reorder(full);
    sfx.tick();
  };
  const guardedEdit = useCallback(
    (id: string) => {
      if (Date.now() - justDragged.current > 250) onEdit(id);
    },
    [onEdit],
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => haptic()} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {tasks.map((t) => (
          <SortableRow key={t.id} task={t} done={false} onEdit={guardedEdit} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function TaskView({ tasks, now, onEdit }: { tasks: Task[]; now: number; onEdit: (id: string) => void }) {
  const cfg = useStore((s) => s.settings);
  const open = tasks.filter((t) => isActiveToday(t, now, cfg) && !isDone(t, now, cfg));
  const done = tasks.filter((t) => isActiveToday(t, now, cfg) && isDone(t, now, cfg));
  const later = tasks.filter((t) => !isActiveToday(t, now, cfg));
  return (
    <>
      <div className="win tasks">
        {open.length === 0 && <div className="empty">All clear! The realm is safe… for now.</div>}
        {open.length > 0 && <SortableTasks tasks={open} onEdit={onEdit} />}
      </div>
      {done.length > 0 && (
        <>
          <div className="section-label">Slain ({done.length})</div>
          <div className="win tasks">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} done onEdit={onEdit} />
            ))}
          </div>
        </>
      )}
      {later.length > 0 && (
        <>
          <div className="section-label">Not scheduled today</div>
          <div className="win tasks">
            {later.map((t) => (
              <TaskRow key={t.id} task={t} done={isDone(t, now, cfg)} inactive onEdit={onEdit} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SupplyView({ list, tasks, onEdit }: { list: TaskList; tasks: Task[]; onEdit: (id: string) => void }) {
  const restockStaples = useStore((st) => st.restockStaples);
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
              <SwipeAway key={t.id} task={t}>
                <TaskRow task={t} done={false} onEdit={onEdit} />
              </SwipeAway>
            ))}
          </div>
        ))}
      </div>
      {staplesMissing > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => {
              const n = restockStaples(list.id);
              if (n) sfx.loot();
            }}
          >
            ⟳ Restock staples ({staplesMissing})
          </button>
        </div>
      )}
      {pantry.length > 0 && (
        <>
          <div className="section-label">Pantry · tap to add back · hold to edit</div>
          <div className="win pantry">
            {pantry.map((t) => (
              <PantryChip key={t.id} task={t} onEdit={onEdit} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Sideways travel (px) before a press becomes a swipe; a fling this fast (px/ms) counts even if short. */
const SWIPE_START = 10;
const FLING = 0.5;

/**
 * Slide a grocery sideways (finger or mouse) to take it off the list without buying it. Delete or
 * Backspace on a focused row does the same. A tap still opens the editor.
 */
function SwipeAway({ task, children }: { task: Task; children: React.ReactNode }) {
  const haptics = useStore((s) => s.settings.haptics);
  const wrap = useRef<HTMLDivElement>(null);
  const press = useRef<{ x0: number; y0: number; id: number; on: boolean; x: number; t: number; v: number } | null>(null);
  const swallowClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const width = () => wrap.current?.offsetWidth ?? 300;
  const past = (d: number) => Math.abs(d) > width() * 0.35;
  const forgets = task.timesDone === 0 && !task.staple;

  const reset = () => {
    press.current = null;
    setSettling(true);
    setDx(0);
  };
  const commit = (dir: number) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return void takeOffList(task);
    setSettling(true);
    setDx(dir * (width() + 20));
    window.setTimeout(() => takeOffList(task) || reset(), 160);
  };

  return (
    <div
      ref={wrap}
      className="swipe"
      onPointerDown={(e) => {
        swallowClick.current = false;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        press.current = { x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false, x: e.clientX, t: e.timeStamp, v: 0 };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.id !== e.pointerId) return;
        const mx = e.clientX - p.x0;
        const my = e.clientY - p.y0;
        if (!p.on) {
          if (Math.abs(my) > SWIPE_START && Math.abs(my) >= Math.abs(mx)) return void (press.current = null); // scrolling
          if (Math.abs(mx) < SWIPE_START || Math.abs(mx) < Math.abs(my) * 1.3) return;
          p.on = true;
          setSettling(false);
          wrap.current?.setPointerCapture(e.pointerId);
        }
        const dt = Math.max(1, e.timeStamp - p.t);
        p.v = (e.clientX - p.x) / dt;
        p.x = e.clientX;
        p.t = e.timeStamp;
        if (haptics && past(mx) !== past(dx)) haptic();
        setDx(mx);
      }}
      onPointerUp={(e) => {
        const p = press.current;
        if (!p?.on || p.id !== e.pointerId) return void (press.current = null);
        press.current = null;
        swallowClick.current = true; // the click that ends a swipe must not open the editor
        const d = e.clientX - p.x0;
        const flung = Math.abs(d) > 50 && Math.abs(p.v) > FLING && Math.sign(p.v) === Math.sign(d);
        if (past(d) || flung) commit(Math.sign(d));
        else reset();
      }}
      onPointerCancel={reset}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
      onKeyDown={(e) => {
        if ((e.key !== 'Delete' && e.key !== 'Backspace') || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        // a held key repeats: one press takes off one item, never the whole aisle
        if (e.repeat) return;
        // keep keyboard focus in the list: on the next item (in any aisle), else the one before
        const rows = [...(wrap.current?.closest('.tasks')?.querySelectorAll<HTMLElement>('.swipe .task') ?? [])];
        const at = rows.findIndex((r) => wrap.current?.contains(r));
        const sib = rows[at + 1] ?? rows[at - 1];
        if (takeOffList(task)) requestAnimationFrame(() => sib?.isConnected && sib.focus());
      }}
    >
      {dx !== 0 && (
        <div className={`swipe-under ${forgets ? '' : 'keep'} ${dx < 0 ? 'from-right' : ''} ${past(dx) ? 'go' : ''}`} aria-hidden>
          {forgets ? '✕ Remove' : '↩ Pantry'}
        </div>
      )}
      <div
        className={`swipe-row ${dx !== 0 ? 'moving' : ''} ${settling ? 'settling' : ''}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onTransitionEnd={() => setSettling(false)}
      >
        {children}
      </div>
    </div>
  );
}

const PantryChip = memo(function PantryChip({ task, onEdit }: { task: Task; onEdit: (id: string) => void }) {
  const updateTask = useStore((s) => s.updateTask);
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  return (
    <button
      className={`pchip ${task.staple ? 'staple' : ''}`}
      onPointerDown={() => {
        held.current = false;
        timer.current = window.setTimeout(() => {
          held.current = true;
          haptic();
          onEdit(task.id);
        }, 450);
      }}
      onPointerUp={() => clearTimeout(timer.current)}
      onPointerLeave={() => clearTimeout(timer.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(task.id);
      }}
      onKeyDown={(e) => {
        // keyboard: Shift+Enter edits (a plain Enter adds the item back, like a tap)
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          onEdit(task.id);
        }
      }}
      aria-label={`Add ${task.title} back${task.staple ? ' (staple)' : ''}`}
      aria-keyshortcuts="Shift+Enter"
      onClick={() => {
        if (held.current) return;
        sfx.pop();
        updateTask(task.id, { doneFor: null });
      }}
    >
      <PxImg src={iconFor(task.title, task.icon)} size={24} />
      {task.title}
      {task.staple && <span style={{ color: 'var(--accent)' }}>★</span>}
      <span className="plus">+</span>
    </button>
  );
});
