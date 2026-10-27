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

  async speak(text: string, audio?: { mime: string; b64: string } | null, lang = 'en'): Promise<void> {
    if (this.muted || !text) return;
    this.stop();
    const ctx = this.getCtx();
    // browsers start audio muted until a click; make sure it's running before Naga talks
    if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
    if (audio && ctx && ctx.state === 'running') {
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
    const l = (lang || 'en').toLowerCase();
    u.lang = l === 'en' ? 'en-US' : (BCP47[l.slice(0, 2)] ?? l);
    u.rate = 1.04;
    const v = pickMaleVoice(l);
    if (v) u.voice = v;
    // no clearly male voice for this language on the device: deepen the default one
    u.pitch = v ? 0.9 : 0.6;
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

const BCP47: Record<string, string> = {
  es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR',
  hi: 'hi-IN', km: 'km-KH', th: 'th-TH', vi: 'vi-VN', ru: 'ru-RU', ar: 'ar-SA', id: 'id-ID', nl: 'nl-NL', tr: 'tr-TR',
};
/** Known male system voices across platforms (English + other languages). */
const MALE_HINTS =
  /\b(male|david|daniel|alex|fred|guy|mark|george|james|tom|aaron|arthur|oliver|rishi|reed|eddy|jorge|diego|juan|carlos|pablo|thomas|nicolas|henri|paul|luca|cosimo|diego|otoya|ichiro|keita|hattori|kangkang|yunxi|yunyang|liang|rocko|grandpa|hemant|prabhat|madhur|piseth|niwat|stefan|markus|conrad|yuri|pavel|felipe|reed)\b/i;
function pickMaleVoice(lang = 'en'): SpeechSynthesisVoice | null {
  const want = lang.slice(0, 2);
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(want));
  return voices.find((v) => MALE_HINTS.test(v.name) && !/female/i.test(v.name)) ?? null;
}
