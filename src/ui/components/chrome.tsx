// App chrome: HUD, mobile tab bar, list chips, desktop sidebar.
import { useMemo } from 'react';
import { useStore, visibleLists, listTasks, TODAY_ID, type Tab } from '../../state/store';
import { useAttention } from '../../state/attention';
import { todaySections, todayRemaining } from '../../state/today';
import { heroGold, heroLevel, levelTitle } from '../../game/progression';
import { streak, isDone, isActiveToday } from '../../core/time';
import { useHeroLook } from '../../game/look';
import { streakDays } from '../../state/rewards';
import { iconFor } from '../../pixel/iconGen';
import { Bar, PxImg, Ui, compact, portraitUrl, useNow } from './common';
import type { TaskList } from '../../core/types';
import type { UiSprite } from '../../pixel/sprites/ui';
import { sfx } from '../../audio/sfx';

export function Hud() {
  const hero = useStore((s) => s.hero)!;
  const cfg = useStore((s) => s.settings);
  const setTab = useStore((s) => s.setTab);
  const look = useHeroLook();
  const now = useNow();
  const { level, into, need } = heroLevel(hero);
  const gold = heroGold(hero);
  const st = streak(streakDays(hero), now, cfg);
  return (
    <header className="hud">
      <button className="icon-btn hud-portrait" onClick={() => setTab('hero')} aria-label="Hero">
        <PxImg src={portraitUrl(hero.appearance, look)} size={40} />
      </button>
      <div className="hud-mid">
        <div className="hud-name">
          <span className="lv">Lv{level}</span>
          <span className="hname" title={hero.name}>
            {hero.name}
          </span>
          <span className="title">{hero.title ?? levelTitle(level)}</span>
        </div>
        <Bar value={into} max={need} label={`${into}/${need} XP`} />
      </div>
      <div className="hud-stats">
        <span className="stat">
          <Ui name="coin" size={18} />
          {compact(gold)}
        </span>
        <span className="stat" title="Daily streak">
          <Ui name="flame" size={18} />
          {st}
        </span>
      </div>
    </header>
  );
}

const TABS: { id: Tab; label: string; icon: UiSprite }[] = [
  { id: 'quests', label: 'Quests', icon: 'scroll' },
  { id: 'hero', label: 'Hero', icon: 'helm' },
  { id: 'shop', label: 'Shop', icon: 'bag' },
  { id: 'party', label: 'Party', icon: 'party' },
  { id: 'settings', label: 'Options', icon: 'gear' },
];

export function TabBar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const flags = useAttention();
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab ${tab === t.id ? 'active' : ''}`}
          onClick={() => {
            sfx.tick();
            setTab(t.id);
          }}
        >
          <Ui name={t.icon} size={26} />
          {t.label}
          {flags[t.id as keyof typeof flags] && <span className="tab-dot" aria-label="needs your attention" />}
        </button>
      ))}
    </nav>
  );
}

function useListCounts(l: TaskList) {
  const s = useStore();
  const now = useNow();
  const ts = listTasks(s, l.id);
  if (l.type === 'supply') {
    const need = ts.filter((t) => !t.doneFor).length;
    return { label: `${need}`, done: false };
  }
  const active = ts.filter((t) => isActiveToday(t, now, s.settings));
  const done = active.filter((t) => isDone(t, now, s.settings)).length;
  return { label: `${done}/${active.length}`, done: active.length > 0 && done === active.length };
}

function ChipItem({ l, active, onPick, className }: { l: TaskList; active: boolean; onPick: () => void; className: string }) {
  const c = useListCounts(l);
  return (
    <button className={`${className} ${active ? 'active' : ''}`} style={{ ['--chip' as string]: l.color }} onClick={onPick}>
      <PxImg src={iconFor(l.name, l.icon)} size={className === 'chip' ? 24 : 26} />
      <span title={l.name}>{l.name}</span>
      <span className="count">{c.done ? '✓' : c.label}</span>
    </button>
  );
}

/** Remaining today-relevant tasks across all non-supply lists (same rules as the Today view). */
function useTodayCount(): number {
  const lists = useStore((s) => s.lists);
  const tasks = useStore((s) => s.tasks);
  const cfg = useStore((s) => s.settings);
  const now = useNow();
  return useMemo(() => todayRemaining(todaySections(lists, tasks, now, cfg)), [lists, tasks, cfg, now]);
}

function TodayItem({ className, active, onPick }: { className: string; active: boolean; onPick: () => void }) {
  const n = useTodayCount();
  return (
    <button className={`${className} ${active ? 'active' : ''}`} style={{ ['--chip' as string]: '#a02a3a' }} onClick={onPick}>
      <PxImg src={iconFor('', '⭐')} size={className === 'chip' ? 24 : 26} />
      <span>Today</span>
      <span className="count">{n === 0 ? '✓' : n}</span>
    </button>
  );
}

export function ListChips({ onNew }: { onNew: () => void }) {
  const s = useStore();
  const lists = visibleLists(s);
  return (
    <div className="chips">
      <TodayItem className="chip" active={s.activeListId === TODAY_ID} onPick={() => (sfx.tick(), s.setActiveList(TODAY_ID))} />
      {lists.map((l) => (
        <ChipItem key={l.id} l={l} className="chip" active={l.id === s.activeListId} onPick={() => (sfx.tick(), s.setActiveList(l.id))} />
      ))}
      <button className="chip" onClick={onNew} aria-label="New list">
        <Ui name="plus" size={14} />
        <span>New</span>
      </button>
    </div>
  );
}

export function Sidebar({ onNew }: { onNew: () => void }) {
  const s = useStore();
  const flags = useAttention();
  const lists = visibleLists(s);
  return (
    <aside className="side">
      <div style={{ padding: '18px 16px 6px' }}>
        <div className="pixel" style={{ fontSize: 16, color: '#ffd860', textShadow: '3px 3px 0 #140c1c' }}>
          QUESTLOG
        </div>
      </div>
      <div className="side-head">Quest Lists</div>
      <div className="side-nav">
        <TodayItem className="side-item" active={s.tab === 'quests' && s.activeListId === TODAY_ID} onPick={() => (sfx.tick(), s.setActiveList(TODAY_ID))} />
        {lists.map((l) => (
          <ChipItem
            key={l.id}
            l={l}
            className="side-item"
            active={s.tab === 'quests' && l.id === s.activeListId}
            onPick={() => (sfx.tick(), s.setActiveList(l.id))}
          />
        ))}
        <button className="side-item" onClick={onNew}>
          <Ui name="plus" size={16} /> New list
        </button>
      </div>
      <div className="side-head">Adventure</div>
      <div className="side-nav">
        {TABS.filter((t) => t.id !== 'quests').map((t) => (
          <button key={t.id} className={`side-item ${s.tab === t.id ? 'active' : ''}`} onClick={() => (sfx.tick(), s.setTab(t.id))}>
            <Ui name={t.icon} size={24} /> {t.label}
            {flags[t.id as keyof typeof flags] && <span className="tab-dot" aria-label="needs your attention" />}
          </button>
        ))}
      </div>
    </aside>
  );
}
