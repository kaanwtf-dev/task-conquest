import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

/** Animated idle hero over a theme backdrop (used in character creation / hero screen). */
export function HeroPreview({ app, look, theme, w, h, scale }: { app: Appearance; look: GearLook; theme: ThemeId; w: number; h: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
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
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 90) return;
      last = t;
      ctx.drawImage(sceneCanvas(theme, w, h, 5), 0, 0);
      THEME_BY_ID[theme].animate?.(g, w, h, t);
      const bob = Math.floor(t / 520) % 2;
      const isBlink = t % 3600 < 130;
      ctx.drawImage(isBlink ? blink : frames[bob], Math.round(w / 2 - 20), ground - 33);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [app, look, theme, w, h]);
  return <canvas ref={ref} className="px" style={{ width: w * scale, height: h * scale, display: 'block' }} />;
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
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      if (t.animate) raf = requestAnimationFrame(draw);
      if (now - last < 120) return;
      last = now;
      ctx.drawImage(sceneCanvas(theme, cw, height, 11), 0, 0);
      t.animate?.(g, cw, height, now);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
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
