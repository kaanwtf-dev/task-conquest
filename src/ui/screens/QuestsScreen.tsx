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
import { useStore, listTasks, visibleLists, LIST_TYPE_INFO, TODAY_ID, ALL_ID } from '../../state/store';
import { isActiveToday, isDone, msUntilReset, fmtDuration, repeatLabel, todayKey } from '../../core/time';
import { DIFFICULTY } from '../../game/progression';
import { iconFor } from '../../pixel/iconGen';
import { AISLES } from '../../pixel/keywords';
import { SceneBanner, Stars, PxImg, Ui, useNow, useMedia, themeStyle } from '../components/common';
import { markTap, haptic } from '../components/Effects';
import { fx } from '../../state/fx';
import { sfx, unlockAudio } from '../../audio/sfx';
import type { Task, TaskList } from '../../core/types';
import TaskEditSheet from './TaskEditSheet';
import BackupWarning, { useBackupDue } from '../components/BackupWarning';
import { InstallCard } from '../components/InstallGuide';
import { TipNudge } from '../components/Support';
import { WARN_MS, deadlineIsMine, hasLimit, leftLabel, stakesOf, timeLeft, windowOf } from '../../game/deadlines';
import { todaySections } from '../../state/today';
import { SNOOZE_REMINDER_MS, reminderState, reminderTimes } from '../../game/reminders';
import BossBar from '../components/BossBar';
import PartyStrip from '../components/PartyStrip';
import { PushInvite } from '../components/Reminders';
import { ListSheet } from './OtherScreens';
import { takeOffList } from '../groceries';
import { t, locale } from '../../i18n';

/** Only what the list screens read: the hero's progress changing on every kill must not re-render them. */
const listState = (st: ReturnType<typeof useStore.getState>) => ({ activeListId: st.activeListId, lists: st.lists, tasks: st.tasks, settings: st.settings });

export default function QuestsScreen() {
  const s = useStore(useShallow(listState));
  const wide = useMedia('(min-width: 900px)');
  const now = useNow(20000);
  const [editTask, setEditTask] = useState<string | null>(null);
  const [editList, setEditList] = useState(false);

  if (s.activeListId === TODAY_ID) return <TodayView now={now} wide={wide} onEdit={setEditTask} editTask={editTask} closeEdit={() => setEditTask(null)} />;
  if (s.activeListId === ALL_ID) return <EverythingView now={now} wide={wide} onEdit={setEditTask} editTask={editTask} closeEdit={() => setEditTask(null)} />;

  const chosen = s.activeListId ? s.lists[s.activeListId] : undefined;
  // the active list can vanish underneath us (left a party list, deleted on another device)
  const list = chosen && !chosen.deleted ? chosen : visibleLists(s)[0];
  if (!list) return <div className="scroll"><div className="empty">{t('No lists yet. Create one!')}</div></div>;
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
                ? t('{buy} to buy · {known} remembered', { buy: tasks.filter((x) => !x.doneFor).length, known: tasks.length })
                : reset != null
                  ? t('{type} · resets in {time}', { type: t(info.label), time: fmtDuration(reset) })
                  : t(info.hint)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {list.type !== 'supply' && active.length > 0 && (
              <div className="win banner-progress">
                {doneCount}/{active.length}
              </div>
            )}
            <button className="win banner-progress banner-edit" onClick={() => setEditList(true)} aria-label={t('Edit list')}>
              ⋯
            </button>
          </div>
        </div>
      </SceneBanner>
      {list.shared && <PartyStrip list={list} />}

      <QuickAdd list={list} />
      <BackupWarning />
      <InstallNudge />
      <TipNudge />
      <PushInvite />

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
  const { reminders, overdue, dueToday, routine, week, doneToday } = todaySections(s.lists, s.tasks, now, cfg);
  const total = reminders.length + overdue.length + dueToday.length + routine.length + doneToday.length;
  const date = new Date(now).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' });

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
            {t('Today')}
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
      <BackupWarning />
      <InstallNudge />
      <TipNudge />
      <PushInvite />
      {reminders.length + overdue.length + dueToday.length + routine.length + week.length === 0 && (
        <div className="win tasks">
          <div className="empty">{t('Nothing due today. Go touch some grass, adventurer.')}</div>
        </div>
      )}
      {section(t('🔔 Time for these'), reminders)}
      {section(t('Overdue'), overdue)}
      {section(t('Due today'), dueToday)}
      {section(t('Daily routine'), routine)}
      {section(t('This week'), week)}
      {section(t('Slain today ({n})', { n: doneToday.length }), doneToday, true)}
      {editTask && <TaskEditSheet taskId={editTask} onClose={closeEdit} />}
    </div>
  );
}

// ---------------------------------------------------------------- Everything

/** Every list on one screen: what's open in each (and what's done today), groceries still to buy included. */
function EverythingView({ now, wide, onEdit, editTask, closeEdit }: { now: number; wide: boolean; onEdit: (id: string) => void; editTask: string | null; closeEdit: () => void }) {
  const s = useStore(useShallow(listState));
  const setActiveList = useStore((st) => st.setActiveList);
  const cfg = s.settings;
  const sections = visibleLists(s).map((l) => {
    const all = listTasks(s, l.id).filter((t) => (l.type === 'supply' ? !isDone(t, now, cfg) : isActiveToday(t, now, cfg)));
    return { list: l, open: all.filter((t) => !isDone(t, now, cfg)), done: all.filter((t) => isDone(t, now, cfg)) };
  });
  const open = sections.reduce((n, x) => n + x.open.length, 0);

  return (
    <div className="scroll" style={themeStyle('castle')}>
      <BossBar />
      <SceneBanner theme="castle" height={wide ? 56 : 52} scale={wide ? 3 : 2}>
        <div className="banner-info">
          <div className="win banner-title">
            {t('Everything')}
            <div className="banner-sub">{t('every list, one screen')}</div>
          </div>
          <div className="win banner-progress">{t('{n} open', { n: open })}</div>
        </div>
      </SceneBanner>
      {sections.map(({ list, open: o, done }) => (
        <div key={list.id} style={themeStyle(list.theme)}>
          <button className="section-label everything-head" onClick={() => (sfx.tick(), setActiveList(list.id))}>
            {list.name} · {list.type === 'supply' ? t('{n} to buy', { n: o.length }) : `${done.length}/${o.length + done.length}`} ›
          </button>
          <div className="win tasks">
            {o.length + done.length === 0 && <div className="empty">{list.type === 'supply' ? t('Nothing to buy.') : t('All clear.')}</div>}
            {o.map((t) => (
              <TaskRow key={t.id} task={t} done={false} onEdit={onEdit} />
            ))}
            {done.map((t) => (
              <TaskRow key={t.id} task={t} done onEdit={onEdit} />
            ))}
          </div>
        </div>
      ))}
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
          placeholder={supply ? t('Add item… (remembers everything)') : dueToday ? t('Add a quest for today → {list}', { list: list.name }) : t('Add a quest…')}
          data-quickadd
          enterKeyHint="done"
          aria-label={t('New item')}
        />
        {text.trim() && <PxImg src={iconFor(text)} size={36} style={{ alignSelf: 'center' }} />}
        <button className="btn" type="submit" aria-label={t('Add')}>
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

/** What missing this quest costs this player: repeating quests are flexible unless set otherwise; on party lists, only their own. */
function useStakes(task: Task) {
  return useStore((s) => {
    const l = s.lists[task.listId];
    return l && l.type !== 'supply' && deadlineIsMine(task, l, s.hero?.name, s.accountId) ? stakesOf(task) : null;
  });
}

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
/** Where the quest's reminder stands (re-checked every minute): 'due' flashes at the top. */
function useReminder(task: Task): 'none' | 'later' | 'due' {
  const cfg = useStore((s) => s.settings);
  const now = useNow(reminderTimes(task).length ? 30_000 : 3_600_000);
  return reminderState(task, now, cfg);
}

const TaskRow = memo(function TaskRow({ task, done, inactive, showList, onEdit, sortable }: RowProps) {
  const stakes = useStakes(task);
  const reminder = useReminder(task);
  const style = sortable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: inactive ? 0.45 : 1 }
    : inactive
      ? { opacity: 0.45 }
      : undefined;
  return (
    <div
      ref={sortable?.setNodeRef}
      className={`task ${done ? 'done' : ''} ${sortable?.isDragging ? 'dragging' : ''} ${stakes && !done ? `stakes-${stakes}` : ''} ${reminder === 'due' && !done ? 'reminder-due' : ''}`}
      style={style}
      {...(sortable ? { ...sortable.attributes, ...sortable.listeners, role: 'listitem', 'aria-roledescription': t('draggable quest') } : {})}
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
  const stakes = useStakes(task);
  const d = DIFFICULTY[task.difficulty];
  const rl = repeatLabel(task.repeat);
  // repeating quests count down their day / week / month; one-off quests count down to their due date
  const timed = !done && !inactive && (task.repeat.kind !== 'none' || !!task.due || !!task.deadline);
  return (
    <>
      {timed && <TimeBar task={task} />}
      <button
        className={`check ${done ? 'on' : ''}`}
        aria-label={done ? t('Mark {title} not done', { title: task.title }) : t('Complete {title}', { title: task.title })}
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
        {(rl || task.due || inactive || task.qty || listName || task.notes || (shared && task.doneBy) || timed || !!task.misses || !!stakes || reminderTimes(task).length > 0) && (
          <div className="tmeta">
            {listName && <span className="tlist">{listName}</span>}
            {shared && done && task.doneBy && <span className="tlist">✓ {task.doneBy}</span>}
            {rl && (
              <>
                <Ui name="repeat" size={12} /> {t(rl)}
              </>
            )}
            {task.qty && <span>×{task.qty}</span>}
            {task.due &&
              (task.due < todayKey(Date.now(), useStore.getState().settings) && !done ? (
                <span className="overdue">{t('Overdue {date}', { date: task.due })}</span>
              ) : (
                <span>{t('Due {date}', { date: task.due })}</span>
              ))}
            {stakes && !done && <StakesChip stakes={stakes} />}
            {reminderTimes(task).length > 0 && !done && <ReminderChip task={task} />}
            {timed && <TimeLeft task={task} />}
            {!done && !!task.misses && <span className="overdue">{t('missed {n}×', { n: task.misses })}</span>}
            {task.notes && <span>✎</span>}
            {inactive && <span>{t('Not today')}</span>}
          </div>
        )}
      </div>
      {task.difficulty > 0 && <Stars n={d.stars} />}
      {done && task.repeat.kind !== 'none' && <AgainButton task={task} />}
    </>
  );
});

/** What missing the quest costs, at a glance: "!!" must do (red), "!" flexible (amber). */
/** "🔔 9:30 PM" (and, once it is time, "15 min later"). */
function ReminderChip({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask);
  const reminder = useReminder(task);
  const times = reminderTimes(task).map((ms) => new Date(2000, 0, 1, 0, 0, 0, ms).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }));
  return (
    <>
      <span className="reminder-chip" title={t('Reminder')}>
        🔔 {times.join(' · ')}
      </span>
      {reminder === 'due' && (
        <button
          className="pill reminder-snooze"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            sfx.tick();
            update(task.id, { snoozedUntil: Date.now() + SNOOZE_REMINDER_MS });
          }}
        >
          ⏰ {t('15 min later')}
        </button>
      )}
    </>
  );
}

function StakesChip({ stakes }: { stakes: NonNullable<Task['stakes']> }) {
  return (
    <span className={`stakes ${stakes}`} title={stakes === 'must' ? t('Must do: missing it hurts') : t('Flexible: missing it costs a little')}>
      {stakes === 'must' ? t('!! MUST') : t('! FLEX')}
    </span>
  );
}

/** The countdown behind a time-limited quest: full when the window opens, empty at the deadline. */
function TimeBar({ task }: { task: Task }) {
  const now = useNow(30000);
  const cfg = useStore((s) => s.settings);
  const f = timeLeft(task, now, cfg);
  if (f === null) return null;
  return <span className={`tbar ${f === 0 ? 'late' : ''}`} style={{ '--left': f } as React.CSSProperties} aria-hidden />;
}

function TimeLeft({ task }: { task: Task }) {
  const now = useNow(30000);
  const cfg = useStore((s) => s.settings);
  const label = leftLabel(task, now, cfg);
  if (!label) return null;
  // (from the window, not the label: the label is translated)
  const end = windowOf(task, now, cfg)?.end ?? Infinity;
  const late = end - now <= 0;
  const soon = !late && end - now < WARN_MS;
  // a plain daily or weekly quest only says so when time is getting short (its bar shows the rest)
  if (!soon && !late && !hasLimit(task, cfg)) return null;
  if (late && task.due && task.due < todayKey(now, cfg)) return null; // the "Overdue" chip says it already
  return (
    <span className={late || soon ? 'overdue' : ''}>
      ⏳ 
      {t(label)}
    </span>
  );
}

/** On a finished repeating quest: do it once more (another workout, brushing again) for a smaller reward. */
function AgainButton({ task }: { task: Task }) {
  const repeat = useStore((s) => s.repeatTask);
  const supply = useStore((s) => s.lists[task.listId]?.type === 'supply');
  const sfxOn = useStore((s) => s.settings.sfx > 0);
  const haptics = useStore((s) => s.settings.haptics);
  if (supply) return null;
  const extra = task.again && task.again.period === task.doneFor ? task.again.n : 0;
  return (
    <button
      className="again"
      aria-label={t('Do {title} again', { title: task.title })}
      title={t('Did it again? Smaller reward each time')}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        unlockAudio();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        markTap(r.left, r.top);
        if (repeat(task.id)) {
          if (sfxOn) sfx.check();
          if (haptics) haptic();
        } else fx.emit({ type: 'toast', text: t('That will do for now'), small: t('Come back when it resets.') });
      }}
    >
      +1{extra > 0 && <span className="again-n">×{extra + 1}</span>}
    </button>
  );
}

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
        {open.length === 0 && <div className="empty">{t('All clear! The realm is safe… for now.')}</div>}
        {open.length > 0 && <SortableTasks tasks={open} onEdit={onEdit} />}
      </div>
      {done.length > 0 && (
        <>
          <div className="section-label">{t('Slain ({n})', { n: done.length })}</div>
          <div className="win tasks">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} done onEdit={onEdit} />
            ))}
          </div>
        </>
      )}
      {later.length > 0 && (
        <>
          <div className="section-label">{t('Not scheduled today')}</div>
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
        {need.length === 0 && <div className="empty">{t('Nothing to buy. Tap items below to restock.')}</div>}
        {ordered.map(([aisle, items]) => (
          <div key={aisle}>
            <div className="section-label" style={{ margin: '8px 6px 2px' }}>
              {AISLES[aisle] ? t(AISLES[aisle].name) : t('Other')}
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
            ⟳ {t('Restock staples ({n})', { n: staplesMissing })}
          </button>
        </div>
      )}
      {pantry.length > 0 && (
        <>
          <div className="section-label">{t('Pantry · tap to add back · hold to edit')}</div>
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
          {forgets ? `✕ ${t('Remove')}` : `↩ ${t('Pantry')}`}
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
      aria-label={task.staple ? t('Add {title} back (staple)', { title: task.title }) : t('Add {title} back', { title: task.title })}
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

/** The Home Screen card, one card at a time: it waits while the backup warning is up. */
function InstallNudge() {
  return useBackupDue() ? null : <InstallCard />;
}
