// Chiptune SFX synthesized live with WebAudio (square/triangle/noise). No audio files.

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** iOS only allows audio after a user gesture; call from the first tap. Muted players never get a context. */
export function unlockAudio() {
  if (volume > 0) ac();
}

/** The shared AudioContext (music plays through it too); null where WebAudio is unavailable. */
export function getAudioContext(): AudioContext | null {
  return ac();
}

export function setSfxVolume(v: number) {
  volume = v;
  if (master) master.gain.value = v;
}

function tone(freq: number, start: number, dur: number, wave: Wave = 'square', vol = 0.18, slideTo?: number) {
  if (volume <= 0) return; // muted: don't even create (and keep running) an AudioContext
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(start: number, dur: number, vol = 0.15, hp = 800) {
  if (volume <= 0) return; // muted: don't even create (and keep running) an AudioContext
  const c = ac();
  if (!c || !master) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + start;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

const N = (semis: number) => 440 * Math.pow(2, (semis - 9) / 12); // semitones from C4

export const sfx = {
  tick() {
    tone(1200, 0, 0.03, 'square', 0.06);
  },
  check() {
    tone(N(19), 0, 0.06, 'square', 0.12);
    tone(N(24), 0.05, 0.08, 'square', 0.12);
  },
  uncheck() {
    tone(N(19), 0, 0.05, 'square', 0.08);
    tone(N(12), 0.04, 0.07, 'square', 0.08);
  },
  slash() {
    noise(0, 0.09, 0.22, 2500);
    tone(900, 0, 0.08, 'sawtooth', 0.08, 200);
  },
  hit() {
    noise(0, 0.06, 0.25, 400);
    tone(160, 0, 0.08, 'square', 0.15, 60);
  },
  kill() {
    noise(0, 0.25, 0.14, 600);
    [24, 19, 15, 12].forEach((s, i) => tone(N(s), 0.04 + i * 0.045, 0.06, 'square', 0.1));
  },
  coin() {
    tone(N(23), 0, 0.06, 'square', 0.1);
    tone(N(28), 0.06, 0.22, 'square', 0.1);
  },
  levelUp() {
    [12, 16, 19, 24, 28, 31].forEach((s, i) => tone(N(s), i * 0.07, 0.12, 'square', 0.12));
    tone(N(36), 0.45, 0.4, 'square', 0.1);
    tone(N(24), 0.45, 0.4, 'triangle', 0.2);
  },
  loot() {
    [31, 35, 38, 43].forEach((s, i) => tone(N(s), i * 0.05, 0.1, 'triangle', 0.16));
  },
  questComplete() {
    // original little fanfare
    const mel: [number, number, number][] = [[19, 0, 0.1], [19, 0.11, 0.1], [19, 0.22, 0.1], [24, 0.34, 0.35], [21, 0.72, 0.18], [23, 0.9, 0.18], [24, 1.1, 0.5]];
    mel.forEach(([s, t, d]) => tone(N(s), t, d, 'square', 0.12));
    [[12, 0], [9, 0.34], [7, 0.72], [12, 1.1]].forEach(([s, t]) => tone(N(s), t, 0.3, 'triangle', 0.22));
  },
  error() {
    tone(140, 0, 0.15, 'square', 0.12, 90);
  },
  pop() {
    tone(N(14), 0, 0.05, 'triangle', 0.18, N(26));
  },
  /** Someone poked the hero: one of a few silly noises. */
  poke() {
    const pick = Math.floor(Math.random() * 5);
    if (pick === 0) {
      // boing
      tone(180, 0, 0.16, 'triangle', 0.24, 720);
      tone(720, 0.15, 0.22, 'triangle', 0.2, 240);
    } else if (pick === 1) {
      // squeak squeak
      tone(1500, 0, 0.06, 'square', 0.07, 2300);
      tone(1900, 0.08, 0.07, 'square', 0.07, 2800);
    } else if (pick === 2) {
      // "hup!"
      noise(0, 0.04, 0.12, 1800);
      tone(N(5), 0.02, 0.1, 'square', 0.14, N(12));
    } else if (pick === 3) {
      // blorp
      tone(320, 0, 0.12, 'sawtooth', 0.1, 90);
      tone(150, 0.11, 0.14, 'square', 0.1, 60);
    } else {
      // giggle
      [0, 1, 2, 3, 4].forEach((i) => tone(N(i % 2 ? 26 : 30), i * 0.065, 0.05, 'square', 0.09));
    }
  },
};

export type SfxName = keyof typeof sfx;
