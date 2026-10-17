/**
 * AgentClient: talks to the agent endpoint. Never blocks the XR frame loop (all async),
 * never throws to callers, and degrades to the on-device parser when offline.
 */
import { sanitizeEnvelope, type AgentEnvelope } from '../../shared/protocol.js';
import { fallbackEnvelope, parseIntent } from '../../shared/intent.js';

const ENDPOINT: string = (import.meta.env.VITE_AGENT_URL as string | undefined) || '/api/quest/chat';

export interface AgentCaps {
  online: boolean;
  stt: boolean;
  llm: boolean;
  tts: boolean;
}

export class AgentClient {
  caps: AgentCaps = { online: false, stt: false, llm: false, tts: false };

  async probe(): Promise<AgentCaps> {
    try {
      const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const j = (await r.json()) as Partial<AgentCaps> & { ok?: boolean };
        this.caps = { online: !!j.ok, stt: !!j.stt, llm: !!j.llm, tts: !!j.tts };
      }
    } catch {
      this.caps = { online: false, stt: false, llm: false, tts: false };
    }
    return this.caps;
  }

  /** Text utterance -> envelope. Falls back to the local parser on any failure. */
  async sendText(text: string, scene = ''): Promise<AgentEnvelope> {
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, scene }),
        // sculpting something new can take the model ~10–15 s
        signal: AbortSignal.timeout(22000),
      });
      const env = sanitizeEnvelope(await r.json());
      if (r.ok && env) return { ...env, transcript: env.transcript ?? text };
    } catch {
      /* offline */
    }
    const local = parseIntent(text) ?? fallbackEnvelope(text);
    return { ...local, transcript: text, source: `local-${local.source ?? ''}` };
  }

  /** Recorded clip -> server STT -> envelope. Throws 'stt_unavailable' so the caller can explain. */
  async sendAudio(blob: Blob, scene = ''): Promise<AgentEnvelope> {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'audio/webm', 'x-naga-scene': encodeURIComponent(scene.slice(0, 600)) },
      body: blob,
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j as { error?: string } | null)?.error ?? `http_${r.status}`);
    const env = sanitizeEnvelope(j);
    if (!env) throw new Error('bad_envelope');
    return env;
  }
}
