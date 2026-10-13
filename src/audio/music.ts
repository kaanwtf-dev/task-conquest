// Optional background chiptune: four original looping tunes synthesized live (square lead,
// triangle bass, pulse arps, noise drums) on the same AudioContext as the sound effects.
import type { ThemeId } from '../pixel/themes';
import { Rng } from '../core/rng';
import { getAudioContext } from './sfx';

export type TrackId = 'tavern' | 'forest' | 'beach' | 'dungeon';

/** Every zone theme plays one of the four tunes. */
export const THEME_MUSIC: Record<ThemeId, TrackId> = {
  tavern: 'tavern',
  forest: 'forest',
  beach: 'beach',
  dungeon: 'dungeon',
  snow: 'forest',
  desert: 'beach',
  castle: 'tavern',
  volcano: 'dungeon',
};

/**
 * Tracker-style song. Lanes are whitespace-separated tokens, one per step, with bars split by '|':
 * a note name (C4, F#5, Bb3) starts a note, '-' holds it, '.' rests.
 * `bass` is a figure repeated over every chord span: R root, 3 third, 5 fifth, 8 octave, '-', '.'.
 * `drums` tokens combine k kick, s snare, h hat, o open hat ('.' is silence); the lane loops.
 */
export interface Song {
  name: string;
  bpm: number;
  stepsPerBeat: number; // 3 = eighths in 6/8 (beat = dotted quarter), 2 = eighths in 4/4
  stepsPerBar: number;
  stepsPerChord: number;
  swing?: number; // fraction of a step that off-beat steps are delayed by
  lead: string;
  harmony: string; // one chord per stepsPerChord: C, Am, F#m, Bb, A7, Fmaj7, Gm7, Csus4, Bdim, Cadd9
  bass: string;
  arp: { pattern: number[]; rate: number; octave: number }; // chord-tone indices, notes per step
  drums: string;
}

export const SONGS: Record<TrackId, Song> = {
  // G major jig in 6/8: bouncing arpeggios, A part low, B part high
  tavern: {
    name: 'Hearth and Tankard',
    bpm: 100,
    stepsPerBeat: 3,
    stepsPerBar: 6,
    stepsPerChord: 3,
    lead: `
      G4 B4 D5 G5 - D5 | B4 - G4 D5 B4 G4 | E5 - C5 E5 G5 E5 | D5 C5 B4 A4 - F#4 |
      G4 B4 D5 G5 F#5 G5 | E5 - B4 G5 - E5 | C5 B4 A4 D5 C5 A4 | B4 A4 F#4 G4 - . |
      B5 - G5 E5 G5 B5 | A5 G5 F#5 E5 - B4 | C5 E5 G5 C6 - G5 | B5 A5 G5 D5 - B4 |
      E5 D5 E5 G5 - E5 | F#5 E5 D5 A5 - F#5 | G5 D5 B4 E5 - G5 | A4 C5 E5 D5 A4 F#4`,
    harmony: `
      G G G G C C D D G G Em Em Am D D G
      Em Em D Em C C G G C C D D G Em Am D`,
    bass: 'R - 5',
    arp: { pattern: [0, 1, 2], rate: 1, octave: 3 },
    drums: 'k . h s . h',
  },
  // F major pastoral: long sighing phrases over major-seventh harp arpeggios
  forest: {
    name: 'Mossy Path',
    bpm: 80,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    stepsPerChord: 4,
    lead: `
      A4 - - C5 E5 - - - | E5 - D5 C5 A4 - - - | D5 - - F5 A5 - G5 - | G5 - E5 - C5 - - - |
      A4 - C5 - F5 - E5 - | D5 - - E5 F5 - A4 - | G4 - Bb4 - D5 - F5 - | F5 - - - E5 - . .`,
    harmony: 'Fmaj7 Fmaj7 Am Am Bbmaj7 Bbmaj7 C C Fmaj7 Fmaj7 Dm Dm Gm7 Gm7 Csus4 C',
    bass: 'R - 5 -',
    arp: { pattern: [0, 1, 2, 3, 2, 1], rate: 2, octave: 3 },
    drums: '. . h . . . h . | . . h . . . h h',
  },
  // C major beach hop: syncopated, lightly swung, busy drums
  beach: {
    name: 'Tide Pool Hop',
    bpm: 132,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    stepsPerChord: 4,
    swing: 0.12,
    lead: `
      E5 . G5 . C6 - G5 E5 | F5 . A5 - . A5 G5 F5 | D5 . G5 . B5 - A5 G5 | C5 E5 G5 - E5 . C5 . |
      A4 . C5 . E5 - D5 C5 | A4 . C5 . F5 - E5 D5 | F5 E5 D5 . G5 . B5 . | C6 - . G5 E5 - C5 .`,
    harmony: 'C C F F G G C C Am Am F F Dm G C C',
    bass: 'R . 5 8',
    arp: { pattern: [0, 2, 1, 2], rate: 2, octave: 4 },
    drums: 'k h s h k k s h',
  },
  // D minor crawl: pulsing bass, Neapolitan Eb chord, the dominant left hanging
  dungeon: {
    name: 'Torchlit Stair',
    bpm: 92,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    stepsPerChord: 8,
    lead: `
      D5 - - - . . F5 E5 | D5 - A4 - . . . . | F5 - - - D5 - Bb4 - | C#5 - - - A4 - . . |
      D5 - F5 - A5 - G5 F5 | G5 - - - Bb4 - D5 - | Eb5 - - D5 Eb5 - G5 - | E5 - C#5 - A4 - G4 -`,
    harmony: 'Dm Dm Bb A Dm Gm Eb A7',
    bass: 'R R 8 R R R 5 R',
    arp: { pattern: [0, 2, 1, 2], rate: 1, octave: 3 },
    drums: 'k . h . s . h . | k k h . s . h o',
  },
};

// ---------------------------------------------------------------- compiler (pure)

export type Voice = 'lead' | 'bass' | 'arp';

export interface NoteEvent {
  voice: Voice;
  midi: number;
  at: number; // offset within the step, in steps
  len: number; // in steps
}

export interface CompiledSong {
  steps: number;
  bars: number;
  stepDur: number; // seconds
  notes: NoteEvent[][]; // by start step
  drums: string[][]; // by step
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORDS: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  add9: [0, 4, 7, 14],
};

function pitchClass(letter: string, acc: string): number {
  return (PITCH[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
}

/** MIDI number of a note name such as C4 (60), F#5 or Bb3. */
export function parseNote(tok: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
  if (!m) throw new Error(`bad note "${tok}"`);
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parseChord(tok: string): { root: number; tones: number[] } {
  const m = /^([A-G])([#b]?)(.*)$/.exec(tok);
  const tones = m && CHORDS[m[3]];
  if (!m || !tones) throw new Error(`bad chord "${tok}"`);
  return { root: pitchClass(m[1], m[2]), tones };
}

const tokens = (s: string) => s.split(/[\s|]+/).filter(Boolean);

/** Splits a lane into bars and checks every bar has exactly `perBar` steps. */
function bars(lane: string, perBar: number, what: string): string[][] {
  const out = lane
    .split('|')
    .map((b) => tokens(b))
    .filter((b) => b.length);
  out.forEach((b, i) => {
    if (b.length !== perBar) throw new Error(`${what}: bar ${i + 1} has ${b.length} steps, expected ${perBar}`);
  });
  return out;
}

export function compileSong(song: Song): CompiledSong {
  const lead = bars(song.lead, song.stepsPerBar, `${song.name} lead`).flat();
  const steps = lead.length;
  const notes: NoteEvent[][] = Array.from({ length: steps }, () => []);
  const drums: string[][] = Array.from({ length: steps }, () => []);
  const stepDur = 60 / song.bpm / song.stepsPerBeat;
  if (!(stepDur > 0 && stepDur < 2)) throw new Error(`${song.name}: bad tempo`);

  // a lane of note/hold/rest tokens -> events; holds extend the last sounding note
  const lane = (voice: Voice, toks: (number | '-' | '.')[], at = 0) => {
    let cur: NoteEvent | null = null;
    toks.forEach((t, i) => {
      if (t === '-') {
        if (cur) cur.len++;
      } else if (t === '.') {
        cur = null;
      } else {
        cur = { voice, midi: t, at, len: 1 };
        notes[i].push(cur);
      }
    });
  };
  lane('lead', lead.map((t) => (t === '-' || t === '.' ? t : parseNote(t))));

  const chords = tokens(song.harmony).map(parseChord);
  if (chords.length * song.stepsPerChord !== steps) {
    throw new Error(`${song.name}: harmony covers ${chords.length * song.stepsPerChord} steps, lead has ${steps}`);
  }
  const figure = tokens(song.bass);
  if (figure.length !== song.stepsPerChord) throw new Error(`${song.name}: bass figure must span one chord`);
  lane(
    'bass',
    chords.flatMap(({ root, tones }) => {
      const iv: Record<string, number> = { R: 0, '3': tones[1], '5': tones[2], '8': 12 };
      return figure.map((f) => {
        if (f === '-' || f === '.') return f;
        if (!(f in iv)) throw new Error(`${song.name}: bad bass token "${f}"`);
        return 36 + root + iv[f]; // root in octave 2
      });
    }),
  );

  const { pattern, rate, octave } = song.arp;
  for (let s = 0; s < steps; s++) {
    const { root, tones } = chords[Math.floor(s / song.stepsPerChord)];
    for (let j = 0; j < rate; j++) {
      const idx = pattern[(s * rate + j) % pattern.length];
      const tone = tones[idx % tones.length] + 12 * Math.floor(idx / tones.length);
      notes[s].push({ voice: 'arp', midi: 12 * (octave + 1) + root + tone, at: j / rate, len: 1 / rate });
    }
  }

  const beats = bars(song.drums, song.stepsPerBar, `${song.name} drums`).flat();
  if (steps % beats.length) throw new Error(`${song.name}: drum loop must divide the song length`);
  for (let s = 0; s < steps; s++) {
    const tok = beats[s % beats.length];
    if (!/^(\.|[khso]+)$/.test(tok)) throw new Error(`${song.name}: bad drum token "${tok}"`);
    if (tok !== '.') drums[s] = [...tok];
  }
  return { steps, bars: steps / song.stepsPerBar, stepDur, notes, drums };
}

const compiled = new Map<TrackId, CompiledSong>();
function song(id: TrackId): CompiledSong {
  let c = compiled.get(id);
  if (!c) compiled.set(id, (c = compileSong(SONGS[id])));
  return c;
}

// ---------------------------------------------------------------- synthesis

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;
const FADE = 0.8; // crossfade between tracks
const STOP_FADE = 0.6;
const HIDE_FADE = 0.15;
const MASTER = 0.5;

const VOICES: Record<Voice, { wave: OscillatorType | 'pulse'; gain: number; gate: number }> = {
  lead: { wave: 'square', gain: 0.06, gate: 0.92 },
  bass: { wave: 'triangle', gain: 0.2, gate: 0.9 },
  arp: { wave: 'pulse', gain: 0.028, gate: 0.8 },
};

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

let pulseWave: PeriodicWave | null = null;
let noiseBuf: AudioBuffer | null = null;

/** 25% duty pulse: thinner than the square lead so the arps sit underneath it. */
function pulse(c: AudioContext): PeriodicWave {
  if (!pulseWave) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    pulseWave = c.createPeriodicWave(real, imag);
  }
  return pulseWave;
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    const rng = new Rng(0x6e6f6973);
    for (let i = 0; i < d.length; i++) d[i] = rng.float() * 2 - 1;
  }
  return noiseBuf;
}

function playNote(c: AudioContext, out: AudioNode, voice: Voice, midi: number, t: number, dur: number) {
  const v = VOICES[voice];
  const f = freq(midi);
  const o = c.createOscillator();
  if (v.wave === 'pulse') o.setPeriodicWave(pulse(c));
  else o.type = v.wave;
  o.frequency.setValueAtTime(f, t);
  const g = c.createGain();
  const attack = 0.006;
  const release = Math.min(0.06, dur * 0.4);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v.gain, t + attack);
  // plucky decay for lead/arp, flat sustain for the bass
  g.gain.linearRampToValueAtTime(voice === 'bass' ? v.gain : v.gain * 0.65, t + Math.max(attack * 2, dur - release));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  if (voice === 'lead' && dur > 0.35) {
    // delayed vibrato on long notes
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.setValueAtTime(5.5, t);
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.3, dur * 0.6));
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
}

function playDrum(c: AudioContext, out: AudioNode, kind: string, t: number) {
  if (kind === 'k') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
    return;
  }
  const [hp, vol, dur] = kind === 's' ? [1400, 0.09, 0.13] : kind === 'o' ? [6000, 0.035, 0.16] : [7500, 0.032, 0.035];
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.setValueAtTime(hp, t);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + dur + 0.02);
  if (kind === 's') {
    // a little tonal body under the snare noise
    const o = c.createOscillator();
    const b = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    b.gain.setValueAtTime(0.08, t);
    b.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(b).connect(out);
    o.start(t);
    o.stop(t + 0.1);
  }
}

// ---------------------------------------------------------------- player

interface Player {
  id: TrackId;
  song: CompiledSong;
  swing: number;
  out: GainNode; // per-track fader
  step: number;
  next: number; // context time of `step`
  until: number; // stop scheduling after this time (Infinity while it is the active track)
}

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let players: Player[] = [];
let active: Player | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let volume = 0;
let wanted: TrackId | null = null; // what the app asked for, kept while muted or hidden
let resume: { id: TrackId; step: number } | null = null;
let listening = false;

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function audio(): AudioContext | null {
  try {
    const c = getAudioContext();
    if (!c || c.state === 'closed') return null;
    if (c !== ctx) {
      ctx = c;
      bus = c.createGain();
      bus.gain.value = volume * MASTER;
      bus.connect(c.destination);
      players = [];
      active = null;
    }
    return c;
  } catch {
    return null;
  }
}

function tick() {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime;
  for (const p of players) {
    const { stepDur, steps, notes, drums } = p.song;
    // fell behind (suspended context or throttled timer): skip ahead instead of bursting notes
    if (p.next < now - 0.1) p.next = now + 0.02;
    while (p.next < now + LOOKAHEAD && p.next < p.until) {
      const t = p.next + (p.step % 2 ? p.swing * stepDur : 0);
      for (const n of notes[p.step]) {
        playNote(c, p.out, n.voice, n.midi, t + n.at * stepDur, n.len * stepDur * VOICES[n.voice].gate);
      }
      for (const d of drums[p.step]) playDrum(c, p.out, d, t);
      p.next += stepDur;
      p.step = (p.step + 1) % steps;
    }
  }
  // drop faded-out tracks once their last notes have rung out
  players = players.filter((p) => {
    if (p.until === Infinity || now < p.until + 0.5) return true;
    p.out.disconnect();
    return false;
  });
  if (!players.length) stopTimer();
}

function startTimer() {
  if (timer === null) timer = setInterval(tick, TICK_MS);
}

function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function fadeOut(p: Player, dur: number) {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime;
  const g = p.out.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + dur);
  p.until = now + dur;
}

function halt(dur: number) {
  if (active) fadeOut(active, dur);
  active = null;
}

function start(id: TrackId, fromStep = 0) {
  const c = audio();
  if (!c || !bus || (active && active.id === id)) return;
  try {
    halt(FADE);
    const now = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + FADE);
    out.connect(bus);
    const s = song(id);
    active = { id, song: s, swing: SONGS[id].swing ?? 0, out, step: fromStep % s.steps, next: now + 0.05, until: Infinity };
    players.push(active);
    tick();
    startTimer();
  } catch {
    active = null;
  }
}

/** Plays (or keeps playing) the zone's tune once music volume is above 0. */
export function playMusic(theme: ThemeId) {
  wanted = THEME_MUSIC[theme] ?? 'tavern';
  listen();
  if (resume && resume.id !== wanted) resume = null;
  if (volume > 0 && !hidden()) {
    start(wanted, resume?.step ?? 0);
    resume = null;
  }
}

export function stopMusic() {
  wanted = null;
  resume = null;
  halt(STOP_FADE);
}

/** 0..1; 0 stops the music, raising it again resumes the last requested tune. */
export function setMusicVolume(v: number) {
  volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  listen();
  if (ctx && bus) bus.gain.setTargetAtTime(volume * MASTER, ctx.currentTime, 0.05);
  if (volume <= 0) halt(STOP_FADE);
  else if (wanted && !active && !hidden()) start(wanted);
}

/** The tune currently playing, or null when stopped, muted, hidden or without audio. */
export function currentTrack(): TrackId | null {
  return active?.id ?? null;
}

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (hidden()) {
      if (active) resume = { id: active.id, step: active.step };
      halt(HIDE_FADE);
    } else if (wanted && volume > 0) {
      if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      start(wanted, resume?.id === wanted ? resume.step : 0);
      resume = null;
    }
  });
}
