/**
 * Synthesised UI sounds (no audio files to load). Hand tracking has no haptics,
 * so every hand action gets an audible confirmation.
 */
export type Sfx = 'pickup' | 'snap' | 'place' | 'delete' | 'undo' | 'redo' | 'cast' | 'error' | 'click' | 'detach' | 'paint' | 'chime' | 'listen'
  | 'rotate' | 'lock' | 'clear' | 'bigclear' | 'levelup' | 'gameover' | 'tick';

export class SoundBoard {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture (Enter button). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    void this.ctx?.resume();
  }

  play(s: Sfx, pitch = 1): void {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (s) {
      case 'pickup': return this.tone(t, 880 * pitch, 1320 * pitch, 0.06, 0.18, 'triangle');
      case 'click': return this.tone(t, 1400, 1100, 0.035, 0.12, 'square', 0.25);
      case 'snap':
        this.noise(t, 0.05, 0.22, 900);
        return this.tone(t, 180 * pitch, 110 * pitch, 0.09, 0.32, 'sine');
      case 'place':
        this.noise(t, 0.04, 0.15, 1400);
        return this.tone(t, 330 * pitch, 220 * pitch, 0.08, 0.25, 'sine');
      case 'paint': return this.tone(t, 660 * pitch, 990 * pitch, 0.07, 0.15, 'sine');
      case 'detach':
        this.tone(t, 520, 780, 0.05, 0.16, 'triangle');
        return this.tone(t + 0.05, 780, 1040, 0.05, 0.12, 'triangle');
      case 'delete': return this.noise(t, 0.28, 0.3, 2400, 300);
      case 'undo':
        this.tone(t, 990, 990, 0.08, 0.14, 'sine');
        return this.tone(t + 0.07, 660, 660, 0.12, 0.14, 'sine');
      case 'redo':
        this.tone(t, 660, 660, 0.08, 0.14, 'sine');
        return this.tone(t + 0.07, 990, 990, 0.12, 0.14, 'sine');
      case 'cast':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.06, f, f * 1.01, 0.35, 0.09, 'sine'));
        return this.noise(t, 0.6, 0.06, 5000, 2000);
      case 'chime':
        [784, 1175, 1568].forEach((f, i) => this.tone(t + i * 0.09, f, f, 0.5, 0.11, 'sine'));
        return;
      case 'listen': return this.tone(t, 600, 900, 0.1, 0.12, 'sine');
      case 'tick': return this.tone(t, 1800, 1600, 0.02, 0.06, 'square', 0.2);
      case 'rotate': return this.tone(t, 700 * pitch, 1050 * pitch, 0.05, 0.12, 'triangle');
      case 'lock':
        this.noise(t, 0.05, 0.18, 700);
        return this.tone(t, 140, 90, 0.1, 0.3, 'sine');
      case 'clear':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(t + i * 0.045, f * pitch, f * pitch * 1.02, 0.22, 0.12, 'triangle'));
        return this.noise(t + 0.05, 0.5, 0.12, 6000, 1500);
      case 'bigclear':
        [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => this.tone(t + i * 0.05, f, f * 1.01, 0.4, 0.12, 'triangle'));
        this.noise(t, 0.25, 0.3, 300, 80);
        return this.noise(t + 0.1, 0.9, 0.15, 7000, 2000);
      case 'levelup':
        [392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, f, f, 0.25, 0.12, 'square', 0.4));
        return;
      case 'gameover':
        [523, 466, 415, 349, 262].forEach((f, i) => this.tone(t + i * 0.16, f, f * 0.98, 0.3, 0.14, 'triangle'));
        return;
      case 'error':
        this.tone(t, 300, 220, 0.12, 0.2, 'square', 0.15);
        return this.tone(t + 0.13, 220, 180, 0.15, 0.2, 'square', 0.15);
    }
  }

  private tone(t: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType, cut = 1): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * cut, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number, f0: number, f1 = f0): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t);
  }
}

export const sfx = new SoundBoard();
