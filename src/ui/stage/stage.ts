// Canvas battle stage: hero idles over a zone backdrop; each completed task spawns a monster that gets slain.
import { Pix } from '../../pixel/pix';
import { heroPix, type Appearance, type GearLook, type Pose } from '../../pixel/sprites/hero';
import { monsterPix } from '../../pixel/sprites/monsters';
import { uiPix } from '../../pixel/sprites/ui';
import { Painter, THEME_BY_ID, groundLine, sceneCanvas, type ThemeId } from '../../pixel/themes';
import type { MonsterSpawn } from '../../game/catalog';
import type { AnimMode } from '../../core/types';
import { sfx } from '../../audio/sfx';

export interface KillJob {
  monster: MonsterSpawn;
  xp: number;
  gold: number;
  crit: boolean;
  theme: ThemeId;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  c: string;
  life: number;
  size: number;
}

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  t0: number;
  dur: number;
}

const RANGED = new Set(['bow', 'staff', 'wand']);
const BATTLE_MS = 950;

export class Stage {
  private ctx: CanvasRenderingContext2D;
  private g: Painter;
  private heroFrames = new Map<string, HTMLCanvasElement>();
  private queue: KillJob[] = [];
  private battle: { job: KillJob; t0: number; mon: HTMLCanvasElement; flash: HTMLCanvasElement; pix: Pix; exploded: boolean; sounded: Set<string> } | null = null;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private pops: { chest: HTMLCanvasElement; open: HTMLCanvasElement; icon?: HTMLCanvasElement; t0: number; delay: number }[] = [];
  private raf = 0;
  private timer = 0;
  private nextBlink = 0;
  private blinkUntil = 0;
  private levelGlowUntil = 0;
  private alive = true;
  private coin = uiPix('coin').toCanvas(1);
  sound = true;
  anim: AnimMode = 'full';
  onEmpty?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    public w: number,
    public h: number,
    public theme: ThemeId,
    private appearance: Appearance,
    private look: GearLook,
    private heroX: number,
    private monsterX: number,
  ) {
    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.g = new Painter(this.ctx);
    this.loop = this.loop.bind(this);
    this.schedule();
  }

  setHero(app: Appearance, look: GearLook) {
    this.appearance = app;
    this.look = look;
    this.heroFrames.clear();
  }

  setTheme(t: ThemeId) {
    this.theme = t;
  }

  private frame(pose: Pose, bob: number, blink: boolean): HTMLCanvasElement {
    const key = `${pose}:${bob}:${blink}`;
    let c = this.heroFrames.get(key);
    if (!c) {
      c = heroPix(this.appearance, this.look, pose, bob, blink).toCanvas(1);
      this.heroFrames.set(key, c);
    }
    return c;
  }

  kill(job: KillJob) {
    if (this.anim === 'off') return;
    this.queue.push(job);
    if (this.queue.length > 6) this.queue.splice(0, this.queue.length - 6);
    this.schedule(true);
  }

  /** Loot chest pops out of the last slain monster, opens, and the item floats up. */
  loot(chest: HTMLCanvasElement, open: HTMLCanvasElement, icon?: HTMLCanvasElement) {
    if (this.anim === 'off') return;
    const delay = this.battle || this.queue.length ? (BATTLE_MS - 300) / this.speed() : 0;
    this.pops.push({ chest, open, icon, t0: performance.now(), delay });
    if (this.pops.length > 3) this.pops.shift();
    this.schedule(true);
  }

  levelUp() {
    this.levelGlowUntil = performance.now() + 1600;
    this.floaters.push({ text: 'LEVEL UP!', color: '#ffd860', x: this.heroX + 20, y: 6, t0: performance.now(), dur: 1600 });
    this.schedule(true);
  }

  /** Tap to skip: finish all pending battles instantly. */
  skip() {
    if (!this.busy && !this.floaters.length) return false;
    this.battle = null;
    this.queue = [];
    this.particles = [];
    this.pops = [];
    this.floaters = [];
    return true;
  }

  get busy() {
    return !!this.battle || this.queue.length > 0 || this.particles.length > 0 || this.pops.length > 0;
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
  }

  private schedule(fast = false) {
    if (!this.alive) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    if (fast || this.busy || this.floaters.length) this.raf = requestAnimationFrame(this.loop);
    else this.timer = window.setTimeout(() => (this.raf = requestAnimationFrame(this.loop)), 110);
  }

  private speed() {
    const base = this.anim === 'quick' ? 2.6 : 1;
    return base * (1 + this.queue.length * 0.6);
  }

  private loop(now: number) {
    if (!this.alive) return;
    if (document.hidden) {
      this.timer = window.setTimeout(() => this.schedule(), 500);
      return;
    }
    const { ctx, w, h } = this;
    const theme = THEME_BY_ID[this.theme] ?? THEME_BY_ID.forest;
    ctx.drawImage(sceneCanvas(this.theme, w, h, 3), 0, 0);
    theme.animate?.(this.g, w, h, now);
    const ground = groundLine(this.theme, h);

    // idle animation
    const bob = Math.floor(now / 520) % 2;
    if (now > this.nextBlink) {
      this.blinkUntil = now + 130;
      this.nextBlink = now + 2500 + Math.random() * 3000;
    }
    const blink = now < this.blinkUntil;

    // start next battle
    if (!this.battle && this.queue.length) {
      const job = this.queue.shift()!;
      const mp = monsterPix(job.monster.id, job.monster.hue);
      this.battle = {
        job,
        t0: now,
        pix: mp,
        mon: mp.toCanvas(1),
        flash: monsterPix(job.monster.id, 0, true).toCanvas(1),
        exploded: false,
        sounded: new Set(),
      };
    }

    let heroDx = 0;
    let pose: Pose = 'idle';
    const heroY = ground - 35 + 2;
    const monY = ground - 20 + 2;

    if (this.battle) {
      const b = this.battle;
      const t = (now - b.t0) * this.speed();
      const ranged = RANGED.has(this.look.weapon?.kind ?? '');
      const once = (k: string, fn: () => void) => {
        if (!b.sounded.has(k)) {
          b.sounded.add(k);
          if (this.sound) fn();
        }
      };
      // monster entrance (drop + bounce)
      const mx = this.monsterX;
      let my = monY;
      if (t < 160) my = monY - (1 - t / 160) * 24;
      else if (t < 220) my = monY - 2;
      if (t < 160) once('drop', () => sfx.pop());
      // hero action
      if (t >= 160 && t < 300) {
        pose = 'windup';
        heroDx = -2;
      } else if (t >= 300 && t < 520) {
        pose = 'swing';
        heroDx = ranged ? 0 : Math.min(1, (t - 300) / 80) * (mx - this.heroX - 28);
        once('slash', () => sfx.slash());
      } else if (t >= 520 && t < 700) {
        pose = 'idle';
        heroDx = ranged ? 0 : (1 - (t - 520) / 180) * (mx - this.heroX - 28);
      }
      // projectile
      if (ranged && t >= 300 && t < 420) {
        const p = (t - 300) / 120;
        const px = this.heroX + 30 + p * (mx - this.heroX - 26);
        const py = heroY + 18;
        if (this.look.weapon?.kind === 'bow') {
          this.g.r(px - 5, py, 6, 1, '#e8d8b0');
          this.g.p(px + 1, py, '#ffffff');
        } else {
          this.g.r(px - 2, py - 2, 4, 4, '#ff8a2a');
          this.g.r(px - 1, py - 1, 2, 2, '#fff060');
        }
      }
      // monster draw / hit / explode
      if (t < 420) ctx.drawImage(b.mon, mx, Math.round(my));
      else if (t < 520) {
        ctx.drawImage(Math.floor(t / 40) % 2 ? b.flash : b.mon, mx + (Math.floor(t / 30) % 2 ? 1 : -1), monY);
        once('kill', () => sfx.kill());
        if (b.job.crit) this.slash(mx, monY, true);
      }
      if (t >= 300 && t < 470) this.slash(mx, monY, b.job.crit);
      if (t >= 520 && !b.exploded) {
        b.exploded = true;
        this.explode(b.pix, mx, monY, b.job.gold);
        this.floaters.push({ text: `+${b.job.xp} XP`, color: '#5fcde4', x: mx + 10, y: monY - 2, t0: now, dur: 900 / Math.min(2, this.speed()) });
        if (b.job.crit) this.floaters.push({ text: 'CRIT!', color: '#ff5a5a', x: mx + 10, y: monY - 12, t0: now, dur: 900 });
        once('coin', () => sfx.coin());
      }
      if (t >= BATTLE_MS) this.battle = null;
    }

    // level-up glow
    const glowing = now < this.levelGlowUntil;
    if (glowing && Math.floor(now / 90) % 2) {
      ctx.fillStyle = 'rgba(255,240,140,0.35)';
      ctx.fillRect(this.heroX + 10, heroY + 6, 20, 32);
    }
    ctx.drawImage(this.frame(pose, pose === 'idle' ? bob : 0, blink && pose === 'idle'), Math.round(this.heroX + heroDx), heroY + (pose === 'idle' ? 0 : 0));

    // particles
    const dt = 1 / 60;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.12;
      p.life -= dt * this.speed();
      if (p.y > ground + 4) {
        p.y = ground + 4;
        p.vy *= -0.3;
        p.vx *= 0.6;
      }
      if (p.size > 1) ctx.drawImage(this.coin, Math.round(p.x), Math.round(p.y), 5, 5);
      else this.g.p(p.x, p.y, p.c);
      return p.life > 0;
    });

    // loot chests
    this.pops = this.pops.filter((p) => {
      const k = (now - p.t0 - p.delay) * (this.anim === 'quick' ? 2 : 1);
      if (k < 0) return true;
      if (k > 1300) return false;
      const x = this.monsterX + 2;
      const bounce = k < 200 ? Math.round(Math.sin((k / 200) * Math.PI) * 6) : 0;
      const y = ground - 14 - bounce;
      ctx.drawImage(k < 450 ? p.chest : p.open, x, y);
      if (p.icon && k >= 450) {
        const rise = Math.min(14, (k - 450) / 25);
        if (Math.floor(k / 80) % 2 || k > 700) ctx.drawImage(p.icon, x, y - 4 - rise);
      }
      return true;
    });

    // floating text
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    this.floaters = this.floaters.filter((f) => {
      const k = (now - f.t0) / f.dur;
      if (k >= 1) return false;
      const y = Math.max(8, Math.round(f.y - k * 12));
      const half = ctx.measureText(f.text).width / 2;
      const x = Math.round(Math.min(w - half - 1, Math.max(half + 1, f.x)));
      ctx.fillStyle = '#140c1c';
      ctx.fillText(f.text, x + 1, y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
      return true;
    });

    if (!this.busy && !this.floaters.length) this.onEmpty?.();
    this.schedule();
  }

  private slash(mx: number, my: number, crit: boolean) {
    const c = crit ? '#ff5a5a' : '#ffffff';
    for (let i = 0; i < 14; i++) this.g.p(mx + 2 + i, my + 2 + i, c);
    for (let i = 0; i < 12; i++) this.g.p(mx + 4 + i, my + 2 + i, '#fff6c0');
  }

  private explode(p: Pix, ox: number, oy: number, gold: number) {
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const c = p.get(x, y);
        if (!c || Math.random() < 0.45) continue;
        this.particles.push({ x: ox + x, y: oy + y, vx: (x - p.w / 2) * 0.09 + (Math.random() - 0.5), vy: -Math.random() * 2.2 - 0.3, c, life: 0.6 + Math.random() * 0.4, size: 1 });
      }
    const coins = Math.min(8, 2 + Math.floor(gold / 10));
    for (let i = 0; i < coins; i++)
      this.particles.push({ x: ox + 8, y: oy + 6, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 2.6 - 1, c: '#f2c94c', life: 1.1, size: 5 });
  }
}
