/**
 * Server-side agent brain (runtime-agnostic: works in Vercel Node functions, Workers, or Node).
 * text -> AgentEnvelope, using a fast deterministic parser plus an OpenAI-compatible LLM.
 */
import { BLUEPRINT_IDS, PALETTE_NAMES, sanitizeEnvelope, type AgentEnvelope } from './protocol.js';
import { fallbackEnvelope, parseIntent } from './intent.js';

export interface AgentEnv {
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  ASSEMBLYAI_API_KEY?: string;
  TTS_BASE_URL?: string;
  TTS_API_KEY?: string;
  TTS_VOICE?: string;
  AGENT_MODE?: string; // "hybrid" (default) | "llm" | "rules"
}

export const SYSTEM_PROMPT = `You are Naga, a friendly spatial building companion in a Quest 3 mixed-reality desk app.
The user speaks English. You place small voxel structures on their real desk; they fix details with their hands.
Reply with a SHORT spoken line (max 12 words) AND at most one build command, as JSON only:
{"speech":"<short line>","build":{"v":1,"type":"build|clear|color|move|undo|redo|scale|rotate|export|grid|game","blueprintId":"<id>","anchor":"desk_center|desk_left|desk_right|floating","color":"<palette>","scale":1.0,"target":"last|all|<part>","dx":0,"dy":0,"dz":0,"turns":1,"message":"<same as speech>"}}
Omit fields that do not apply. blueprintIds: ${BLUEPRINT_IDS.join(', ')}.
Palette: ${PALETTE_NAMES.join(', ')} (red=roof_red, green=grass, blue=sky, yellow=gold, black=ink, grey=stone).
Parts users may name as "target": roof, walls, windows, door, chimney, tower, top, flag, lawn, pond, tree, flowers, steps, books, pillars, arch, keystone, seat, legs, backrest, hearth, fire, hedges.
type "scale": "scale" is a relative factor (bigger 1.25, smaller 0.8). type "move": dx/dy/dz in metres, +x right, +z toward the user, typical 0.08.
type "game" controls the 3D Tetris mode: add "action":"start|stop|pause|drop|retry|next" and for start "game":"tetris|sling" ("let's play tetris" -> start tetris, "slingshot"/"angry birds" -> start sling, "back to building" -> stop).
Map loose requests to the closest blueprint (somewhere to sit -> bench, a place for books -> desk_shelf, a castle -> tower).
If the user is only chatting, or asks for something you cannot build, set "build": null and suggest what you can build.
Never invent blueprint ids. Output JSON only, no markdown, no reasoning.`;

function withTimeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Extract the first JSON object from an LLM reply (tolerates think tags / fences). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/g, '');
  const starts: number[] = [];
  for (let i = 0; i < cleaned.length; i++) if (cleaned[i] === '{') starts.push(i);
  let best: unknown = null;
  let bestScore = -1;
  for (const start of starts) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        const slice = cleaned.slice(start, i + 1);
        let obj: unknown = null;
        try {
          obj = JSON.parse(slice);
        } catch {
          try {
            obj = JSON.parse(slice.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"'));
          } catch {
            break;
          }
        }
        // Prefer a full envelope over a nested build command.
        const o = obj as Record<string, unknown> | null;
        const score = o && typeof o === 'object' ? (typeof o.speech === 'string' ? 2 : 0) + ('build' in o ? 1 : 0) : 0;
        if (score > bestScore) {
          bestScore = score;
          best = obj;
        }
        break;
      }
    }
  }
  return best;
}

export async function askLLM(env: AgentEnv, text: string, timeoutMs = 12000): Promise<AgentEnvelope | null> {
  if (!env.LLM_API_KEY) return null;
  const base = (env.LLM_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: env.LLM_MODEL || 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
      temperature: 0.2,
      // Nemotron reasoning consumes completion budget before content; 400 leaves content empty.
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    }),
    signal: withTimeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string; reasoning?: string } }> };
  const msg = data.choices?.[0]?.message;
  // Prefer content; if reasoning model spent the budget there, salvage the tail JSON.
  const content = (msg?.content ?? msg?.reasoning ?? '').trim();
  const env2 = sanitizeEnvelope(extractJson(content));
  if (env2) {
    env2.source = 'llm';
    return env2;
  }
  // Model replied in prose without a usable envelope — still give the user a voice line.
  const speech = content.replace(/^[^"'\w]*/, '').replace(/\s+/g, ' ').slice(0, 160) || "I'm not sure how to build that yet.";
  return { speech, build: null, source: 'llm_speech' };
}

/** Decide what to do with one utterance. Never throws. */
export async function decide(env: AgentEnv, text: string): Promise<AgentEnvelope> {
  const mode = (env.AGENT_MODE || 'hybrid').toLowerCase();
  const rules = parseIntent(text);
  const done = (e: AgentEnvelope): AgentEnvelope => ({ ...e, transcript: text });
  if (mode === 'rules' || !env.LLM_API_KEY) return done(rules ?? fallbackEnvelope(text));
  // Hybrid: clear, recognised commands take the fast deterministic path (sub-100 ms);
  // anything open-ended goes to the model.
  if (mode === 'hybrid' && rules?.build) return done(rules);
  try {
    const llm = await askLLM(env, text);
    if (llm) {
      if (!llm.build && rules?.build) return done({ ...rules, speech: llm.speech || rules.speech });
      return done(llm);
    }
  } catch (e) {
    // Surface a short reason so ops can see why we fell back (never throw).
    const reason = String((e as Error)?.message || e).slice(0, 80);
    return done({ ...(rules ?? fallbackEnvelope(text)), source: `fallback(${reason})` });
  }
  return done({ ...(rules ?? fallbackEnvelope(text)), source: rules ? 'rules' : 'fallback(llm_empty)' });
}

/** AssemblyAI batch transcription of a short clip. */
export async function transcribe(env: AgentEnv, audio: ArrayBuffer, timeoutMs = 15000): Promise<string> {
  const key = env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error('stt_unavailable');
  const t0 = Date.now();
  const up = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/octet-stream' },
    body: audio,
    signal: withTimeout(timeoutMs),
  });
  if (!up.ok) throw new Error(`stt upload ${up.status}`);
  const { upload_url } = (await up.json()) as { upload_url: string };
  const job = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, language_code: 'en', punctuate: true, format_text: true }),
    signal: withTimeout(timeoutMs),
  });
  if (!job.ok) throw new Error(`stt job ${job.status}`);
  const { id } = (await job.json()) as { id: string };
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 350));
    const r = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers: { authorization: key } });
    const j = (await r.json()) as { status: string; text?: string; error?: string };
    if (j.status === 'completed') return (j.text ?? '').trim();
    if (j.status === 'error') throw new Error(`stt ${j.error}`);
  }
  throw new Error('stt timeout');
}

/** Optional OpenAI-compatible TTS (Kokoro-FastAPI etc). Male voice by default. */
export async function synthesize(env: AgentEnv, text: string): Promise<{ mime: string; b64: string } | null> {
  if (!env.TTS_BASE_URL || !text) return null;
  const base = env.TTS_BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.TTS_API_KEY ? { authorization: `Bearer ${env.TTS_API_KEY}` } : {}),
    },
    body: JSON.stringify({ model: 'kokoro', input: text, voice: env.TTS_VOICE || 'am_adam', response_format: 'mp3' }),
    signal: withTimeout(5000),
  });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mime: 'audio/mpeg', b64: btoa(bin) };
}
