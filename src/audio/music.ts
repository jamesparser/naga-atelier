/**
 * Tiny generative synthwave loop for Tetris mode (WebAudio, no files).
 * Driving bass + arpeggio + hats; tempo rises with the level. Scheduled with look-ahead
 * so it never blocks the frame loop.
 */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // minor pentatonic-ish
const PROG = [0, -4, -2, -5]; // i – VI – VII – v (relative semitones)

export class SynthMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private nextT = 0;
  private step = 0;
  private bpm = 124;
  private accentUntil = 0;
  playing = false;

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
    this.out.gain.setTargetAtTime(0.16, ctx.currentTime, 0.3);
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
    this.bpm = Math.min(176, 120 + (level - 1) * 6);
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
    const bar = Math.floor(step / 16);
    const root = 45 + PROG[bar % PROG.length]; // A2-ish
    const s = step % 16;
    // bass: driving eighths with an octave bounce
    if (s % 2 === 0) this.voice(t, midi(root + (s % 8 === 4 ? 12 : 0)), len * 1.8, 'sawtooth', 0.32, 900);
    // kick on beats
    if (s % 4 === 0) this.kick(t);
    // hats on offbeats
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.06 : 0.035);
    // arpeggio
    const bright = t < this.accentUntil;
    if (bright || s % 2 === 0) {
      const deg = SCALE[(s * 3 + bar) % SCALE.length];
      this.voice(t, midi(root + 24 + deg), len * 0.9, 'square', bright ? 0.1 : 0.06, bright ? 6000 : 2600);
    }
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
