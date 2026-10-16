/**
 * Speech out. Uses server audio (e.g. Kokoro am_adam) when the envelope carries it,
 * otherwise the browser's speechSynthesis with a male English voice when one exists.
 */
export class Speaker {
  private current: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(256);
  speaking = false;
  muted = false;

  constructor(private getCtx: () => AudioContext | null) {}

  get level(): number {
    if (!this.speaking) return 0;
    if (!this.analyser) return 0.35 + 0.25 * Math.sin(performance.now() / 70);
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.min(1, Math.sqrt(s / this.buf.length) * 6);
  }

  stop(): void {
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    this.current = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.speaking = false;
  }

  async speak(text: string, audio?: { mime: string; b64: string } | null): Promise<void> {
    if (this.muted || !text) return;
    this.stop();
    const ctx = this.getCtx();
    if (audio && ctx) {
      try {
        const bytes = Uint8Array.from(atob(audio.b64), (c) => c.charCodeAt(0));
        const decoded = await ctx.decodeAudioData(bytes.buffer);
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        this.analyser ??= ctx.createAnalyser();
        this.analyser.fftSize = 256;
        src.connect(this.analyser);
        this.analyser.connect(ctx.destination);
        this.current = src;
        this.speaking = true;
        await new Promise<void>((resolve) => {
          src.onended = () => resolve();
          src.start();
        });
        this.speaking = false;
        return;
      } catch {
        /* fall back to browser TTS */
      }
    }
    if (!('speechSynthesis' in window)) return;
    this.analyser = null;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.04;
    u.pitch = 0.9;
    const v = pickMaleVoice();
    if (v) u.voice = v;
    this.speaking = true;
    await new Promise<void>((resolve) => {
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
      setTimeout(resolve, 9000); // never hang the caller
    });
    this.speaking = false;
  }
}

const MALE_HINTS = /\b(male|david|daniel|alex|fred|guy|mark|george|james|tom|aaron|arthur|oliver|rishi|reed|eddy)\b/i;
function pickMaleVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  return voices.find((v) => MALE_HINTS.test(v.name) && !/female/i.test(v.name)) ?? null;
}
