/**
 * Push-to-talk voice capture.
 *  1. Web Speech API (on-device / browser STT) when the browser has it.
 *  2. Otherwise record a short clip (MediaRecorder) and let the server transcribe it.
 * Recording auto-stops after ~0.9 s of silence following speech, or after 7 s.
 */

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type VoiceResult = { kind: 'text'; text: string } | { kind: 'audio'; blob: Blob } | { kind: 'none'; reason: string };

export class VoiceInput {
  private stream: MediaStream | null = null;
  private stopFn: (() => void) | null = null;
  level = 0;
  listening = false;
  /** Prefer browser STT; set false to force server STT (e.g. browser STT unreliable). */
  preferBrowserStt = true;

  static browserSttAvailable(): boolean {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  static recordingAvailable(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Ask for mic permission up front (from the 2D landing page). */
  async warmUp(): Promise<boolean> {
    try {
      await this.ensureStream();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureStream(): Promise<MediaStream> {
    if (this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live')) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    return this.stream;
  }

  stop(): void {
    this.stopFn?.();
  }

  async listen(audioCtx: AudioContext | null, useServer: boolean): Promise<VoiceResult> {
    if (this.listening) {
      this.stop();
      return { kind: 'none', reason: 'stopped' };
    }
    this.listening = true;
    try {
      // Our server speech recognition works in every browser (including Quest and Chromium forks
      // whose built-in recognition silently fails), so it goes first; the browser's own is a backup.
      if (useServer && VoiceInput.recordingAvailable()) return await this.record(audioCtx);
      if (this.preferBrowserStt && VoiceInput.browserSttAvailable()) {
        const r = await this.listenBrowser();
        if (r.kind !== 'none' || !useServer || !VoiceInput.recordingAvailable()) return r;
        if (r.reason !== 'not-allowed' && r.reason !== 'service-not-allowed' && r.reason !== 'network') return r;
      }
      if (useServer && VoiceInput.recordingAvailable()) return await this.record(audioCtx);
      return { kind: 'none', reason: 'no_stt' };
    } finally {
      this.listening = false;
      this.level = 0;
      this.stopFn = null;
    }
  }

  private listenBrowser(): Promise<VoiceResult> {
    return new Promise((resolve) => {
      const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
      const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
      const rec = new Ctor();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      let text = '';
      let err = '';
      rec.onresult = (e) => {
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      };
      rec.onerror = (e) => {
        err = e.error;
      };
      rec.onend = () => resolve(text.trim() ? { kind: 'text', text: text.trim() } : { kind: 'none', reason: err || 'silence' });
      this.stopFn = () => rec.stop();
      const pulse = setInterval(() => {
        this.level = 0.3 + 0.2 * Math.sin(performance.now() / 90);
        if (!this.listening) clearInterval(pulse);
      }, 50);
      try {
        rec.start();
      } catch {
        clearInterval(pulse);
        resolve({ kind: 'none', reason: 'start_failed' });
      }
    });
  }

  private async record(audioCtx: AudioContext | null): Promise<VoiceResult> {
    let stream: MediaStream;
    try {
      stream = await this.ensureStream();
    } catch {
      return { kind: 'none', reason: 'mic_denied' };
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
      (m) => MediaRecorder.isTypeSupported?.(m),
    );
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Simple energy VAD for auto-stop.
    let analyser: AnalyserNode | null = null;
    let srcNode: MediaStreamAudioSourceNode | null = null;
    if (audioCtx) {
      srcNode = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      srcNode.connect(analyser);
    }
    const buf = new Float32Array(512);
    const t0 = performance.now();
    let spoke = false;
    let lastLoud = t0;

    return new Promise<VoiceResult>((resolve) => {
      const finish = () => {
        clearInterval(timer);
        if (rec.state !== 'inactive') rec.stop();
      };
      this.stopFn = finish;
      rec.onstop = () => {
        srcNode?.disconnect();
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        resolve(blob.size > 1500 && (spoke || !analyser) ? { kind: 'audio', blob } : { kind: 'none', reason: 'silence' });
      };
      const timer = setInterval(() => {
        const now = performance.now();
        if (analyser) {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          this.level = Math.min(1, rms * 12);
          if (rms > 0.02) {
            spoke = true;
            lastLoud = now;
          }
          if (spoke && now - lastLoud > 900) finish();
          if (!spoke && now - t0 > 5000) finish();
        }
        if (now - t0 > 7000) finish();
      }, 50);
      rec.start(250);
    });
  }
}
