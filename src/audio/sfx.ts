/**
 * Synthesised UI sounds (no audio files to load). Hand tracking has no haptics,
 * so every hand action gets an audible confirmation.
 */
export type Sfx = 'pickup' | 'snap' | 'place' | 'delete' | 'undo' | 'redo' | 'cast' | 'error' | 'click' | 'detach' | 'paint' | 'chime' | 'listen'
  | 'rotate' | 'lock' | 'clear' | 'bigclear' | 'levelup' | 'gameover' | 'tick'
  // arcade game sounds
  | 'laser' | 'explode' | 'swoop' | 'warp' | 'bounce' | 'brick' | 'bop' | 'boing' | 'squeak' | 'flap' | 'whoosh'
  | 'coin' | 'splash' | 'creak' | 'thud' | 'jump' | 'hurt' | 'marble' | 'hole' | 'pop';

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
      case 'laser': return this.tone(t, 1900 * pitch, 380 * pitch, 0.12, 0.09, 'sawtooth', 0.6);
      case 'explode':
        this.noise(t, 0.45, 0.32, 900, 90);
        return this.tone(t, 160, 40, 0.3, 0.3, 'sine');
      case 'swoop': return this.tone(t, 300, 1100, 0.35, 0.06, 'triangle');
      case 'warp':
        this.tone(t, 200, 2400, 0.9, 0.1, 'sawtooth', 0.5);
        return this.noise(t, 0.9, 0.08, 400, 6000);
      case 'bounce': return this.tone(t, 520 * pitch, 480 * pitch, 0.06, 0.16, 'square', 0.5);
      case 'brick':
        this.tone(t, 880 * pitch, 700 * pitch, 0.08, 0.14, 'square', 0.5);
        return this.noise(t, 0.12, 0.12, 3000, 1200);
      case 'bop':
        this.noise(t, 0.06, 0.3, 1200, 300);
        return this.tone(t, 420 * pitch, 160 * pitch, 0.12, 0.3, 'sine');
      case 'boing': return this.tone(t, 180, 720, 0.25, 0.18, 'triangle');
      case 'squeak': return this.tone(t, 1500, 2300, 0.08, 0.1, 'sine');
      case 'flap':
        this.noise(t, 0.12, 0.22, 900, 400);
        return this.tone(t, 340 * pitch, 520 * pitch, 0.08, 0.06, 'triangle');
      case 'whoosh': return this.noise(t, 0.35, 0.18, 400, 2400);
      case 'coin':
        this.tone(t, 988, 988, 0.07, 0.12, 'square', 0.4);
        return this.tone(t + 0.07, 1319, 1319, 0.18, 0.12, 'square', 0.4);
      case 'splash':
        this.noise(t, 0.5, 0.3, 2400, 300);
        return this.tone(t, 500, 120, 0.25, 0.15, 'sine');
      case 'creak': return this.tone(t, 110 * pitch, 92 * pitch, 0.3, 0.12, 'sawtooth', 0.35);
      case 'thud':
        this.noise(t, 0.12, 0.3, 260, 80);
        return this.tone(t, 110, 50, 0.16, 0.35, 'sine');
      case 'jump': return this.tone(t, 330, 880, 0.16, 0.14, 'square', 0.35);
      case 'hurt':
        this.tone(t, 420, 140, 0.3, 0.2, 'sawtooth', 0.35);
        return this.noise(t, 0.2, 0.2, 800, 200);
      case 'marble': return this.tone(t, 2600 * pitch, 2400 * pitch, 0.03, 0.08, 'sine');
      case 'hole': return this.tone(t, 700, 90, 0.5, 0.2, 'triangle');
      case 'pop':
        this.tone(t, 260, 900, 0.07, 0.18, 'sine');
        return this.noise(t, 0.04, 0.1, 2500, 2500);
      case 'error':
        this.tone(t, 300, 220, 0.12, 0.2, 'square', 0.15);
        return this.tone(t + 0.13, 220, 180, 0.15, 0.2, 'square', 0.15);
    }
  }

  /** Continuous looping sound (marble rolling, wind, skates). level 0 = silent. */
  private loops = new Map<string, { g: GainNode; f: BiquadFilterNode }>();
  loop(id: string, level: number, freq = 600): void {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out) return;
    let l = this.loops.get(id);
    if (!l) {
      if (level <= 0.001) return;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(out);
      src.start();
      l = { g, f };
      this.loops.set(id, l);
    }
    const lv = this.muted ? 0 : Math.min(1, level);
    l.g.gain.setTargetAtTime(lv * 0.25, ctx.currentTime, 0.05);
    l.f.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
  }
  stopLoops(): void {
    for (const id of this.loops.keys()) this.loop(id, 0);
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
