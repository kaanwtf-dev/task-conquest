import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { THEME_BY_ID, sceneCanvas, Painter, type ThemeId } from '../../pixel/themes';
import { heroPix, type Appearance, type GearLook, RACE_BY_ID } from '../../pixel/sprites/hero';
import { Pix, spriteUrl } from '../../pixel/pix';
import { uiUrl, type UiSprite } from '../../pixel/sprites/ui';

export function themeStyle(id: ThemeId | undefined): CSSProperties {
  const t = THEME_BY_ID[id ?? 'forest'] ?? THEME_BY_ID.forest;
  const u = t.ui;
  return {
    '--winTop': u.winTop,
    '--winBot': u.winBot,
    '--border': u.border,
    '--accent': u.accent,
    '--text': u.text,
    '--muted': u.muted,
    '--page': u.page,
    '--page2': u.page2,
  } as CSSProperties;
}

export function Ui({ name, size = 20, className }: { name: UiSprite; size?: number; className?: string }) {
  return <img className={`px ${className ?? ''}`} src={uiUrl(name)} width={size} height={size} alt="" draggable={false} />;
}

export function PxImg({ src, size, className, style }: { src: string; size: number; className?: string; style?: CSSProperties }) {
  return <img className={`px ${className ?? ''}`} src={src} width={size} height={size} alt="" draggable={false} style={style} />;
}

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function useNow(intervalMs = 30000): number {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return n;
}

/** Head-and-shoulders crop of the hero sprite. */
export function portraitUrl(app: Appearance, look: GearLook): string {
  const key = `portrait:${JSON.stringify(app)}:${JSON.stringify(look.head ?? null)}`;
  return spriteUrl(key, () => {
    const full = heroPix(app, { head: look.head }, 'idle', 0);
    const ty = RACE_BY_ID[app.race].ty;
    const y0 = Math.max(0, ty - 10);
    const out = new Pix(22, 22);
    for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) out.set(x, y, full.get(9 + x, y0 + y));
    return out;
  });
}

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Redraw a canvas every `ms` while it is on screen and the page is visible. The first frame is drawn at
 * once; a still scene (or a player who prefers reduced motion) is drawn once and never ticks.
 * Returns the cleanup for the calling effect.
 */
function canvasTicker(el: Element | null, ms: number, animate: boolean, draw: (now: number) => void): () => void {
  draw(performance.now());
  if (!animate || prefersReducedMotion()) return () => undefined;
  let timer: number | undefined;
  let onScreen = true;
  let stopped = false;
  const run = () => {
    timer = undefined;
    if (stopped || !onScreen || document.hidden) return; // resume() picks it up again
    draw(performance.now());
    timer = window.setTimeout(run, ms);
  };
  const resume = () => {
    if (!stopped && timer === undefined && onScreen && !document.hidden) timer = window.setTimeout(run, 0);
  };
  timer = window.setTimeout(run, ms);
  const io = el && typeof IntersectionObserver === 'function' ? new IntersectionObserver(([e]) => ((onScreen = e.isIntersecting), resume())) : null;
  if (el) io?.observe(el);
  document.addEventListener('visibilitychange', resume);
  return () => {
    stopped = true;
    clearTimeout(timer);
    io?.disconnect();
    document.removeEventListener('visibilitychange', resume);
  };
}

/** Animated idle hero over a theme backdrop (used in character creation / hero screen). */
export function HeroPreview({ app, look, theme, w: fixedW, h, scale, fit }: { app: Appearance; look: GearLook; theme: ThemeId; w: number; h: number; scale: number; fit?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState(fixedW);
  useEffect(() => {
    if (!fit || !wrap.current) return;
    const ro = new ResizeObserver(([e]) => setFitW(Math.max(48, Math.ceil(e.contentRect.width / scale))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [fit, scale]);
  const w = fit ? fitW : fixedW;
  useEffect(() => {
    const c = ref.current!;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const g = new Painter(ctx);
    const frames = [0, 1].map((b) => heroPix(app, look, 'idle', b).toCanvas(1));
    const blink = heroPix(app, look, 'idle', 0, true).toCanvas(1);
    const ground = Math.round(h * (theme === 'beach' || theme === 'desert' ? 0.68 : theme === 'forest' || theme === 'snow' ? 0.7 : 0.72));
    const draw = (t: number) => {
      ctx.drawImage(sceneCanvas(theme, w, h, 5), 0, 0);
      THEME_BY_ID[theme].animate?.(g, w, h, t);
      const bob = Math.floor(t / 520) % 2;
      const isBlink = t % 3600 < 130;
      ctx.drawImage(isBlink ? blink : frames[bob], Math.round(w / 2 - 20), ground - 33);
    };
    return canvasTicker(c, 90, true, draw);
  }, [app, look, theme, w, h]);
  const canvas = <canvas ref={ref} className="px" style={{ width: w * scale, height: h * scale, display: 'block', maxWidth: fit ? 'none' : undefined }} />;
  return fit ? (
    <div ref={wrap} style={{ width: '100%', overflow: 'hidden' }}>
      {canvas}
    </div>
  ) : (
    canvas
  );
}

/** Full-width animated scene strip. */
export function SceneBanner({ theme, height, scale, children }: { theme: ThemeId; height: number; scale: number; children?: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [cw, setCw] = useState(160);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setCw(Math.max(40, Math.ceil(e.contentRect.width / scale))));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, [scale]);
  useEffect(() => {
    const c = ref.current!;
    c.width = cw;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const g = new Painter(ctx);
    const t = THEME_BY_ID[theme];
    // the first frame is drawn right away (a throttled first rAF used to leave fast-starting banners blank)
    return canvasTicker(c, 120, !!t.animate, (now) => {
      ctx.drawImage(sceneCanvas(theme, cw, height, 11), 0, 0);
      t.animate?.(g, cw, height, now);
    });
  }, [theme, cw, height]);
  return (
    <div className="banner" ref={wrap}>
      <canvas ref={ref} className="px" style={{ height: height * scale }} />
      {children}
    </div>
  );
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? '' : 'off'} />
      ))}
    </span>
  );
}

export function Bar({ value, max, kind, label }: { value: number; max: number; kind?: 'gold' | 'boss'; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${kind ?? ''}`}>
      <i style={{ width: `${pct}%` }} />
      {label && <span className="bar-label">{label}</span>}
    </div>
  );
}

/**
 * Modal sheet with a dimmed backdrop. Closes only when a press both starts and ends on the backdrop,
 * so drag-selecting text inside an input and releasing outside doesn't discard edits.
 */
export function Sheet({ onClose, children, className, style }: { onClose: () => void; children: React.ReactNode; className?: string; style?: CSSProperties }) {
  const downOnBack = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // named after its title; focus moves in (unless a field autofocused already) and stays in while open
    const title = el.querySelector('.win-title');
    if (title) {
      title.id ||= titleId;
      el.setAttribute('aria-labelledby', title.id);
    }
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])');
      const items = [...all].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === el || !el.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !el.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true }); // back to what opened it
    };
  }, [titleId]);
  return (
    <div
      className="sheet-back"
      onPointerDown={(e) => (downOnBack.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBack.current) onClose();
        downOnBack.current = false;
      }}
    >
      <div ref={box} className={`win sheet ${className ?? ''}`} style={style} role="dialog" aria-modal="true" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

/** 1,234 below 100k; 123.4K / 12.3M / 1.2B above, so huge numbers never crush the HUD. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 100_000) return Math.round(n).toLocaleString('en-US');
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, u] of units) if (a >= v) return `${(n / v).toFixed(a / v >= 100 ? 0 : 1)}${u}`;
  return String(n);
}
