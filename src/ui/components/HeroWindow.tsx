// The phone's hero window: a floating stage you can drag anywhere, snap to a side, or push off an edge
// to tuck it away (a small handle brings it back) — or a full-width bar under the HUD.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import HeroStage from '../stage/HeroStage';
import { useStore } from '../../state/store';
import { HOME_DOCK, settle } from '../heroDock';
import type { ThemeId } from '../../pixel/themes';
import { themeStyle, useMedia } from './common';
import { sfx } from '../../audio/sfx';

const MARGIN = 10;
/** Pointer travel (px) before a press becomes a drag instead of a tap. */
const DRAG_START = 6;

export function FloatingHero({ theme, small }: { theme: ThemeId; small: boolean }) {
  const saved = useStore((s) => s.settings.heroDock) ?? HOME_DOCK;
  const update = useStore((s) => s.updateSettings);
  const box = useRef<HTMLDivElement>(null);
  /**
   * The press in progress: where it started, where the window was and how big it looked (landscape phones
   * draw it scaled down, so all of this is in on-screen pixels), and where it is now.
   */
  const drag = useRef<{ x0: number; y0: number; left: number; top: number; w: number; h: number; at: { left: number; top: number } | null; id: number } | null>(
    null,
  );
  const [live, setLive] = useState<{ left: number; top: number } | null>(null);
  const [maxLift, setMaxLift] = useState(0);
  const suppressClick = useRef(false);

  // how high the window may go: up to just under the HUD
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current;
      if (!el) return;
      const hud = document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 0;
      // its top edge with no lift, minus the space up to the HUD
      setMaxLift(Math.max(0, el.getBoundingClientRect().top + saved.lift - hud - MARGIN));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [saved.lift, saved.tucked, small]);

  const lift = Math.min(saved.lift, maxLift || saved.lift);

  useEffect(() => {
    // a tap right after a drag must not poke the hero
    const el = box.current;
    if (!el) return;
    const stop = (e: Event) => {
      if (suppressClick.current) {
        e.stopPropagation();
        suppressClick.current = false;
      }
    };
    el.addEventListener('click', stop, true);
    return () => el.removeEventListener('click', stop, true);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    // one finger drives the window; a second one landing mid-drag is ignored
    if (drag.current || !e.isPrimary) return;
    // a touch drag never ends in a click, so only the press that just ended may swallow one
    suppressClick.current = false;
    const r = box.current!.getBoundingClientRect();
    drag.current = { x0: e.clientX, y0: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, at: null, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.at && Math.hypot(dx, dy) < DRAG_START) return;
    if (!d.at) box.current?.setPointerCapture(e.pointerId);
    d.at = { left: d.left + dx, top: d.top + dy };
    setLive(d.at);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setLive(null);
    if (!d.at || !box.current) return;
    suppressClick.current = true;
    // its bottom edge before the drag, plus the lift it had, is where it rests with no lift
    const restBottom = d.top + d.h + lift;
    const next = settle(d.at.left, d.w, window.innerWidth, restBottom - (d.at.top + d.h), maxLift);
    if (next.tucked) sfx.tick();
    update({ heroDock: next });
    try {
      box.current.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
  };

  const untuck = () => {
    sfx.pop();
    update({ heroDock: { ...saved, tucked: false } });
  };

  const style: React.CSSProperties = { ...themeStyle(theme) };
  if (live) {
    style.left = live.left;
    style.top = live.top;
    style.right = 'auto';
    style.bottom = 'auto';
    style.transition = 'none';
  } else {
    style.bottom = `calc(var(--tabbar-h) + var(--safe-bot) + ${MARGIN + lift}px)`;
    if (saved.side === 'left') {
      style.left = `calc(${MARGIN}px + var(--safe-l))`;
      style.right = 'auto';
    }
  }
  const tucked = saved.tucked && !live;

  return (
    <>
      <div
        ref={box}
        className={`corner-hero side-${saved.side} ${tucked ? `tucked tucked-${saved.side}` : ''} ${live ? 'dragging' : ''}`}
        style={style}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          drag.current = null;
          setLive(null);
        }}
        aria-hidden={tucked}
      >
        {small ? <HeroStage w={56} h={46} scale={2} heroX={-10} monsterX={35} theme={theme} /> : <HeroStage w={72} h={56} scale={2} heroX={-7} monsterX={48} theme={theme} />}
      </div>
      {tucked && (
        <button
          className={`hero-handle hero-handle-${saved.side}`}
          style={{ bottom: `calc(var(--tabbar-h) + var(--safe-bot) + ${MARGIN + lift + 20}px)`, ...themeStyle(theme) }}
          onClick={untuck}
          aria-label="Show the hero window"
        >
          {saved.side === 'left' ? '›' : '‹'}
        </button>
      )}
    </>
  );
}

/** Full-width hero strip under the HUD; drawn at half size on landscape phones, which are short on height. */
export function HeroBar({ theme }: { theme: ThemeId }) {
  const wrap = useRef<HTMLDivElement>(null);
  const short = useMedia('(max-height: 500px) and (max-width: 899px)');
  const scale = short ? 1 : 2;
  const [cw, setCw] = useState(360);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = Math.max(80, Math.floor(cw / scale));
  return (
    <div ref={wrap} className="hero-bar" style={themeStyle(theme)}>
      <HeroStage w={w} h={56} scale={scale} heroX={Math.round(w * 0.22) - 20} monsterX={Math.round(w * 0.55)} theme={theme} />
    </div>
  );
}
