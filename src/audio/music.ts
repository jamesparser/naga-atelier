/**
 * Tiny generative music loops for the game modes (WebAudio, no files). Each game has its own style:
 * tempo, scale, chord loop, instruments and drum pattern. Scheduled with look-ahead so it never
 * blocks the frame loop; tempo can rise with the level.
 */
export interface MusicStyle {
  bpm: number;
  maxBpm?: number;
  /** semitone offsets used by the lead */
  scale: number[];
  /** chord roots per bar, relative to root */
  prog: number[];
  root: number; // midi
  bass: { type: OscillatorType; gain: number; cutoff: number; hit: (s: number) => boolean; bounce?: boolean };
  lead: { type: OscillatorType; gain: number; cutoff: number; hit: (s: number) => boolean; octave?: number; walk?: number };
  pad?: { type: OscillatorType; gain: number };
  kick?: (s: number) => boolean;
  snare?: (s: number) => boolean;
  hat?: (s: number) => boolean;
  volume?: number;
}

const MINOR_PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
const MAJOR_PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12];

/** One theme per game. All original, all synthesised. */
export const STYLES = {
  // Tetris: driving neon synthwave
  tetris: { bpm: 124, maxBpm: 176, scale: MINOR_PENTA, prog: [0, -4, -2, -5], root: 45,
    bass: { type: 'sawtooth', gain: 0.32, cutoff: 900, hit: (s) => s % 2 === 0, bounce: true },
    lead: { type: 'square', gain: 0.06, cutoff: 2600, hit: (s) => s % 2 === 0, octave: 24 },
    kick: (s) => s % 4 === 0, hat: (s) => s % 2 === 1 },
  // Angry Sling: bouncy, cheeky cartoon shuffle
  sling: { bpm: 112, scale: MAJOR_PENTA, prog: [0, 5, 7, 5], root: 48,
    bass: { type: 'triangle', gain: 0.38, cutoff: 1400, hit: (s) => s % 4 === 0 || s % 16 === 10 },
    lead: { type: 'triangle', gain: 0.1, cutoff: 4000, hit: (s) => s % 4 === 0 || s % 4 === 3, octave: 24, walk: 2 },
    kick: (s) => s % 8 === 0, snare: (s) => s % 8 === 4, hat: (s) => s % 4 === 2 },
  // Galago: fast space-arcade pulses
  galago: { bpm: 148, maxBpm: 184, scale: DORIAN, prog: [0, 0, -2, -4], root: 40,
    bass: { type: 'square', gain: 0.22, cutoff: 1200, hit: () => true },
    lead: { type: 'sawtooth', gain: 0.05, cutoff: 3200, hit: (s) => s % 3 === 0, octave: 24 },
    kick: (s) => s % 4 === 0, snare: (s) => s % 8 === 4, hat: (s) => s % 2 === 1 },
  // Marble Maze: calm wooden marimba
  maze: { bpm: 92, scale: MAJOR, prog: [0, 5, -3, 7], root: 53,
    bass: { type: 'sine', gain: 0.32, cutoff: 900, hit: (s) => s % 8 === 0 },
    lead: { type: 'sine', gain: 0.12, cutoff: 5000, hit: (s) => s % 2 === 0 && s % 6 !== 4, octave: 12, walk: 3 },
    pad: { type: 'triangle', gain: 0.03 }, hat: (s) => s % 4 === 2 },
  // Whack-a-Gloom: silly oom-pah
  whack: { bpm: 138, scale: MAJOR, prog: [0, 7, 0, 5], root: 48,
    bass: { type: 'triangle', gain: 0.4, cutoff: 1200, hit: (s) => s % 4 === 0 },
    lead: { type: 'square', gain: 0.07, cutoff: 3000, hit: (s) => s % 4 === 2 || s % 16 === 13, octave: 19, walk: 2 },
    kick: (s) => s % 8 === 0, snare: (s) => s % 4 === 2 },
  // Breakout: chiptune drive
  breakout: { bpm: 136, maxBpm: 168, scale: MINOR_PENTA, prog: [0, 3, 5, 3], root: 43,
    bass: { type: 'square', gain: 0.24, cutoff: 1500, hit: (s) => s % 2 === 0, bounce: true },
    lead: { type: 'square', gain: 0.06, cutoff: 5000, hit: (s) => true && s % 4 !== 1, octave: 24 },
    kick: (s) => s % 4 === 0, snare: (s) => s % 8 === 4, hat: (s) => s % 2 === 1 },
  // Block Tower: tense, quiet ticking with a walking bass
  tower: { bpm: 84, scale: DORIAN, prog: [0, -2, -4, -5], root: 41,
    bass: { type: 'sine', gain: 0.36, cutoff: 700, hit: (s) => s % 4 === 0, bounce: false },
    lead: { type: 'triangle', gain: 0.05, cutoff: 2200, hit: (s) => s % 8 === 6, octave: 24, walk: 1 },
    pad: { type: 'sine', gain: 0.025 }, hat: (s) => s % 2 === 0, volume: 0.12 },
  // Fappy Bro: sunny chip pop
  fappy: { bpm: 120, scale: MAJOR_PENTA, prog: [0, 5, 9, 7], root: 50,
    bass: { type: 'triangle', gain: 0.34, cutoff: 1600, hit: (s) => s % 4 === 0 || s % 4 === 3 },
    lead: { type: 'square', gain: 0.07, cutoff: 4500, hit: (s) => s % 2 === 0, octave: 24, walk: 2 },
    kick: (s) => s % 8 === 0, snare: (s) => s % 8 === 4, hat: (s) => s % 2 === 1 },
  // Mike Penguin: brisk snowy march
  penguin: { bpm: 152, maxBpm: 176, scale: MAJOR, prog: [0, 5, 7, 0], root: 52,
    bass: { type: 'triangle', gain: 0.36, cutoff: 1400, hit: (s) => s % 4 === 0 || s % 4 === 2, bounce: true },
    lead: { type: 'triangle', gain: 0.1, cutoff: 6000, hit: (s) => s % 2 === 0 && s % 16 !== 14, octave: 24, walk: 2 },
    kick: (s) => s % 4 === 0, snare: (s) => s % 8 === 4 || s % 16 === 14, hat: (s) => s % 2 === 1 },
  // Arcade picker: soft lobby loop
  arcade: { bpm: 100, scale: MAJOR_PENTA, prog: [0, -3, 5, 7], root: 48,
    bass: { type: 'sine', gain: 0.3, cutoff: 900, hit: (s) => s % 8 === 0 || s % 8 === 6 },
    lead: { type: 'triangle', gain: 0.07, cutoff: 4000, hit: (s) => s % 4 === 0, octave: 24, walk: 2 },
    hat: (s) => s % 4 === 2, volume: 0.12 },
} satisfies Record<string, MusicStyle>;
export type StyleId = keyof typeof STYLES;

export class SynthMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private nextT = 0;
  private step = 0;
  private bpm = 124;
  private accentUntil = 0;
  private melody = 0;
  playing = false;
  private style: MusicStyle;

  constructor(style: StyleId | MusicStyle = 'tetris') {
    this.style = typeof style === 'string' ? STYLES[style] : style;
    this.bpm = this.style.bpm;
  }

  start(ctx: AudioContext | null, level = 1): void {
    if (!ctx) return;
    this.ctx = ctx;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0.0001;
      // gentle lowpass to keep it under the SFX
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      this.out.connect(lp).connect(ctx.destination);
    }
    this.setLevel(level);
    if (this.playing) return;
    this.playing = true;
    this.out.gain.setTargetAtTime(this.style.volume ?? 0.16, ctx.currentTime, 0.3);
    this.nextT = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    if (!this.playing || !this.ctx || !this.out) return;
    this.playing = false;
    this.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
    clearInterval(this.timer);
  }

  setLevel(level: number): void {
    this.bpm = Math.min(this.style.maxBpm ?? this.style.bpm, this.style.bpm + (level - 1) * 6);
  }

  /** brighter arpeggio for a moment (line clears) */
  accent(): void {
    if (this.ctx) this.accentUntil = this.ctx.currentTime + 1.6;
  }

  private schedule(): void {
    const ctx = this.ctx!;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextT < ctx.currentTime + 0.12) {
      this.note(this.step, this.nextT, sixteenth);
      this.nextT += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private note(step: number, t: number, len: number): void {
    const st = this.style;
    const bar = Math.floor(step / 16);
    const root = st.root + st.prog[bar % st.prog.length];
    const s = step % 16;
    if (st.bass.hit(s)) this.voice(t, midi(root + (st.bass.bounce && s % 8 === 4 ? 12 : 0)), len * 1.8, st.bass.type, st.bass.gain, st.bass.cutoff);
    if (st.kick?.(s)) this.kick(t);
    if (st.snare?.(s)) this.snare(t);
    if (st.hat?.(s)) this.hat(t, s % 4 === 3 ? 0.06 : 0.035);
    if (st.pad && s === 0) for (const iv of [0, 7, 16]) this.voice(t, midi(root + 12 + iv), len * 15, st.pad.type, st.pad.gain, 1800);
    const bright = t < this.accentUntil;
    if (bright || st.lead.hit(s)) {
      // either an arpeggio (fixed pattern) or a gentle random-walk melody
      let deg: number;
      if (st.lead.walk) {
        this.melody = Math.max(0, Math.min(st.scale.length - 1, this.melody + Math.round((Math.sin(step * 12.9898 + bar * 78.233) * 43758.5453 % 1) * st.lead.walk)));
        deg = st.scale[this.melody];
      } else deg = st.scale[(s * 3 + bar) % st.scale.length];
      this.voice(t, midi(root + (st.lead.octave ?? 24) + deg), len * 0.9, st.lead.type, bright ? st.lead.gain * 1.6 : st.lead.gain, bright ? 6000 : st.lead.cutoff);
    }
  }

  private snare(t: number): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(bp).connect(g).connect(this.out!);
    src.start(t);
  }

  private voice(t: number, f: number, dur: number, type: OscillatorType, gain: number, cutoff: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.3), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(t: number, gain: number): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(this.out!);
    src.start(t);
  }
}

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}
