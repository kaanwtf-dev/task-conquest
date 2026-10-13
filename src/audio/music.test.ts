import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { THEMES } from '../pixel/themes';
import {
  SONGS, THEME_MUSIC, compileSong, currentTrack, parseChord, parseNote, playMusic, setMusicVolume, stopMusic,
  type TrackId,
} from './music';

const TRACKS = Object.keys(SONGS) as TrackId[];

describe('music data', () => {
  it('maps every zone theme to one of the four tunes', () => {
    for (const t of THEMES) expect(TRACKS).toContain(THEME_MUSIC[t.id]);
    expect(new Set(Object.values(THEME_MUSIC)).size).toBe(4);
    expect(THEME_MUSIC.snow).toBe('forest');
    expect(THEME_MUSIC.desert).toBe('beach');
    expect(THEME_MUSIC.castle).toBe('tavern');
    expect(THEME_MUSIC.volcano).toBe('dungeon');
  });

  it('parses note names and chord symbols', () => {
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('F#5')).toBe(78);
    expect(parseNote('Bb3')).toBe(58);
    expect(() => parseNote('H2')).toThrow();
    expect(parseChord('Am')).toEqual({ root: 9, tones: [0, 3, 7] });
    expect(parseChord('Bbmaj7')).toEqual({ root: 10, tones: [0, 4, 7, 11] });
    expect(() => parseChord('Cfoo')).toThrow();
  });

  it.each(TRACKS)('%s compiles into a sane 8-16 bar loop', (id) => {
    const s = compileSong(SONGS[id]);
    expect(s.bars).toBeGreaterThanOrEqual(8);
    expect(s.bars).toBeLessThanOrEqual(16);
    expect(s.notes).toHaveLength(s.steps);
    const loopSeconds = s.steps * s.stepDur;
    expect(loopSeconds).toBeGreaterThan(10);
    expect(loopSeconds).toBeLessThan(60);
    const all = s.notes.flat();
    for (const voice of ['lead', 'bass', 'arp'] as const) expect(all.some((n) => n.voice === voice)).toBe(true);
    for (const n of all) {
      expect(n.midi).toBeGreaterThanOrEqual(33); // A1
      expect(n.midi).toBeLessThanOrEqual(96); // C7
      expect(n.len).toBeGreaterThan(0);
      expect(n.at).toBeGreaterThanOrEqual(0);
      expect(n.at).toBeLessThan(1);
    }
    expect(s.drums.some((d) => d.length > 0)).toBe(true);
  });

  it('gives each tune its mood', () => {
    const first = (id: TrackId) => parseChord(SONGS[id].harmony.trim().split(/\s+/)[0]).tones[1];
    expect(SONGS.tavern.stepsPerBar / SONGS.tavern.stepsPerBeat).toBe(2); // 6/8: two dotted-quarter beats
    expect(first('tavern')).toBe(4); // major
    expect(first('forest')).toBe(4);
    expect(first('beach')).toBe(4);
    expect(first('dungeon')).toBe(3); // minor
    expect(SONGS.beach.bpm).toBeGreaterThan(SONGS.forest.bpm);
  });

  it('rejects malformed lanes', () => {
    const bad = { ...SONGS.forest, lead: SONGS.forest.lead.replace('A4 - - C5', 'A4 - C5') };
    expect(() => compileSong(bad)).toThrow(/bar 1/);
    expect(() => compileSong({ ...SONGS.forest, harmony: 'F C' })).toThrow(/harmony/);
    expect(() => compileSong({ ...SONGS.forest, drums: 'k x . . . . . .' })).toThrow(/drum/);
  });
});

describe('music without WebAudio', () => {
  it('never throws and reports nothing playing', () => {
    expect(() => {
      setMusicVolume(0.5);
      playMusic('castle');
      setMusicVolume(Number.NaN);
      stopMusic();
      setMusicVolume(0);
    }).not.toThrow();
    expect(currentTrack()).toBeNull();
  });
});

// ---------------------------------------------------------------- fake WebAudio

type Ev = [string, number, number];

class FakeParam {
  value = 0;
  events: Ev[] = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['lin', v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
  }
  setTargetAtTime(v: number, t: number) {
    this.events.push(['target', v, t]);
  }
  cancelScheduledValues(t: number) {
    this.events.push(['cancel', 0, t]);
  }
}

class FakeNode {
  out: unknown[] = [];
  disconnected = false;
  connect<T>(n: T): T {
    this.out.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  type = 'sine';
  buffer: unknown = null;
  frequency = new FakeParam();
  startAt = -1;
  start(t: number) {
    this.startAt = t;
  }
  stop() {}
  setPeriodicWave() {}
}

class FakeCtx {
  static last: FakeCtx | null = null;
  state = 'running';
  sampleRate = 8000;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  private t0 = Date.now();
  constructor() {
    FakeCtx.last = this;
  }
  get currentTime() {
    return (Date.now() - this.t0) / 1000;
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBufferSource() {
    return this.createOscillator();
  }
  createBiquadFilter() {
    return { type: '', frequency: new FakeParam(), connect: <T>(n: T) => n };
  }
  createBuffer(_ch: number, len: number) {
    return { getChannelData: () => new Float32Array(len) };
  }
  createPeriodicWave() {
    return {};
  }
}

const listeners: (() => void)[] = [];
const doc = {
  visibilityState: 'visible',
  addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
};
function setVisible(v: boolean) {
  doc.visibilityState = v ? 'visible' : 'hidden';
  listeners.forEach((fn) => fn());
}

describe('music with WebAudio', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { AudioContext: FakeCtx });
    vi.stubGlobal('document', doc);
  });
  afterAll(() => {
    stopMusic();
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const ctx = () => FakeCtx.last!;
  // music bus = a gain wired to the speakers that track faders feed into
  const faders = () => {
    const c = ctx();
    const buses = c.gains.filter((g) => g.out.includes(c.destination));
    return c.gains.filter((g) => g.out.some((o) => buses.includes(o as FakeGain)));
  };
  const started = () => ctx().sources.filter((s) => s.startAt >= 0).length;

  it('schedules the mapped tune only a short lookahead in advance', () => {
    setMusicVolume(0.5);
    playMusic('castle');
    expect(currentTrack()).toBe('tavern');
    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(25);
      const now = ctx().currentTime;
      const latest = Math.max(...ctx().sources.map((s) => s.startAt));
      expect(latest).toBeLessThanOrEqual(now + 0.12 + 1e-9); // tavern: no swing, one arp note per step
    }
    expect(started()).toBeGreaterThan(10);
    expect(ctx().sources.every((s) => Number.isFinite(s.startAt))).toBe(true);
  });

  it('crossfades on a track change and keeps the same tune on a same-tune theme', () => {
    playMusic('volcano');
    expect(currentTrack()).toBe('dungeon');
    const [old, cur] = faders().slice(-2);
    expect(old.gain.events.some(([k, v]) => k === 'lin' && v === 0)).toBe(true);
    expect(cur.gain.events.some(([k, v]) => k === 'lin' && v === 1)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(old.disconnected).toBe(true);
    const n = faders().length;
    playMusic('dungeon');
    expect(faders()).toHaveLength(n);
  });

  it('volume 0 stops and raising it resumes the requested tune', () => {
    setMusicVolume(0);
    expect(currentTrack()).toBeNull();
    vi.advanceTimersByTime(2000);
    const before = started();
    vi.advanceTimersByTime(2000);
    expect(started()).toBe(before);
    playMusic('beach'); // remembered while muted
    expect(currentTrack()).toBeNull();
    setMusicVolume(0.4);
    expect(currentTrack()).toBe('beach');
  });

  it('pauses while the page is hidden and resumes when visible', () => {
    setVisible(false);
    expect(currentTrack()).toBeNull();
    vi.advanceTimersByTime(2000);
    const before = started();
    vi.advanceTimersByTime(3000);
    expect(started()).toBe(before);
    setVisible(true);
    expect(currentTrack()).toBe('beach');
    vi.advanceTimersByTime(500);
    expect(started()).toBeGreaterThan(before);
  });

  it('skips ahead instead of bursting after the clock jumps', () => {
    vi.advanceTimersByTime(100);
    const before = started();
    vi.setSystemTime(Date.now() + 10_000); // e.g. a throttled timer
    vi.advanceTimersByTime(25);
    expect(started() - before).toBeLessThan(30);
    const now = ctx().currentTime;
    expect(ctx().sources.slice(before).every((s) => s.startAt >= now - 0.01)).toBe(true);
  });

  it('loops past the end of a tune', () => {
    const before = started();
    vi.advanceTimersByTime(40_000); // longer than any loop
    expect(currentTrack()).toBe('beach');
    expect(started() - before).toBeGreaterThan(200);
  });

  it('goes quiet instead of throwing when the context breaks', () => {
    const c = ctx();
    const orig = c.createOscillator;
    c.createOscillator = () => {
      throw new Error('InvalidStateError');
    };
    playMusic('forest');
    expect(currentTrack()).toBeNull();
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    c.createOscillator = orig;
    playMusic('forest');
    expect(currentTrack()).toBe('forest');
  });

  it('stopMusic forgets the tune', () => {
    stopMusic();
    expect(currentTrack()).toBeNull();
    setMusicVolume(0.8);
    expect(currentTrack()).toBeNull();
    setVisible(false);
    setVisible(true);
    expect(currentTrack()).toBeNull();
  });
});
