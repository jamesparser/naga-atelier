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
  /** optional stronger model for open-ended "build me a …" requests that need sculpting */
  SCULPT_MODEL?: string;
  ASSEMBLYAI_API_KEY?: string;
  TTS_BASE_URL?: string;
  TTS_API_KEY?: string;
  TTS_VOICE?: string;
  AGENT_MODE?: string; // "hybrid" (default) | "llm" | "rules"
}

export const SYSTEM_PROMPT = `You are Naga, a friendly spatial building companion in a Quest 3 mixed-reality desk app.
The user speaks English. You place small voxel structures on their real desk; they fix details with their hands.
Reply with a SHORT spoken line (max 12 words) AND at most one build command, as JSON only:
{"speech":"<short line>","build":{"v":1,"type":"build|sculpt|duplicate|delete|mirror|replace|text|chart|floorplan|info|save|load|clear|color|move|undo|redo|scale|rotate|export|grid|game","blueprintId":"<id>","anchor":"desk_center|desk_left|desk_right|floating","color":"<palette>","scale":1.0,"target":"last|all|<part>","dx":0,"dy":0,"dz":0,"turns":1,"message":"<same as speech>"}}
Omit fields that do not apply. blueprintIds: ${BLUEPRINT_IDS.join(', ')}.
Palette: ${PALETTE_NAMES.join(', ')} (red=roof_red, green=grass, blue=sky, yellow=gold, black=ink, grey=stone).
Parts users may name as "target": roof, walls, windows, door, chimney, tower, top, flag, lawn, pond, tree, flowers, steps, books, pillars, arch, keystone, seat, legs, backrest, hearth, fire, hedges, wheels, sail, mast, deck, railings, river, wings, tail, nose, eyes, head, arms, leaves, trunk, hat, blanket, turrets, keep, lights, wagons, engine.
type "scale": "scale" is a relative factor (bigger 1.25, smaller 0.8). type "move": dx/dy/dz in metres, +x right, +z toward the user, typical 0.08.
type "game" controls the games: add "action":"start|stop|pause|drop|retry|next" and for start "game":"tetris|sling|arcade|swarm|maze|whack|breakout|tower|flapbro|penguin" (tetris; sling = Angry Sling slingshot; arcade = game menu; swarm = Star Swarm space shooter; maze = marble tilt maze; whack = whack-a-gloom; breakout = 3D brick breaker; tower = block-stacking tower game; flapbro = Flap Bro first-person flapping bird; penguin = Mike Penguin first-person ice run). "back to building" -> stop. Only start a game when the user asks to PLAY; "build a tower" is a build.
Map loose requests to a blueprint when one fits (somewhere to sit -> chair, a place for books -> desk_shelf, a truck -> car, a ship -> boat, a spaceship -> rocket, a puppy -> dog).
If NO blueprint fits (a dragon, a giraffe, a guitar, a cup, a laptop, a letter A...), SCULPT it yourself with type "sculpt": the same JSON but instead of blueprintId give
"label":"<what it is>","boxes":[[x,y,z,w,h,d,"<palette>","<part>"],...] — solid boxes of cells, x 0-13 left to right, y 0-14 up from the desk, z 0-9 back to front (front faces the user), w/h/d sizes in cells.
Sculpt like a voxel artist: 10 to 45 boxes, about 80-450 cells; stand it on y=0; get the silhouette and proportions right first, then add details (eyes, windows, wheels, spikes) as small boxes on top;
use 2-5 palette colours that suit the object; keep creatures and vehicles symmetric left-right; later boxes paint over earlier ones; give parts short lowercase names (body, head, legs, neck, wings, tail, handle, screen...).
Example "a mug": {"speech":"Here is a mug.","build":{"v":1,"type":"sculpt","label":"mug","boxes":[[0,0,0,5,1,5,"white","mug"],[0,1,0,5,4,1,"white","mug"],[0,1,4,5,4,1,"white","mug"],[0,1,1,1,4,3,"white","mug"],[4,1,1,1,4,3,"white","mug"],[5,2,2,2,1,1,"white","handle"],[6,2,2,1,3,1,"white","handle"],[5,4,2,2,1,1,"white","handle"],[1,1,1,3,3,3,"oak","coffee"]]}}
Desk tools (use them, they make you useful for real work):
- "duplicate": copy target, "count":1-6 copies in a row ("make three more chairs" -> target "chair", count 3).
- "delete": remove a part or object by name ("get rid of the chimney" -> target "chimney").
- "mirror": flip target left-right. "replace": swap colours, "fromColor" -> "color" (target "all" by default).
- "text": blocks spelling "text" (max 24 chars A-Z 0-9), e.g. a sign or label, optional "color".
- "chart": a 3D bar chart, "values":[numbers], optional "labels" (spoken), e.g. "chart our sales 3 5 8 4".
- "floorplan": a room layout, "rooms":2-6, e.g. "sketch a floor plan with 3 rooms".
- "info": answer about the desk, "question":"count|describe|size|saves" ("how many blocks", "what's on my desk", "how big is the house" -> size, target house).
- "save" / "load": store or restore the whole desk under "name" ("save this as kitchen v2").
- "grid": block size; "preset":"draft|studio|detail|fine|mosaic|finer|coarser" ("I need more room" -> finer). The build is kept when the grid changes.
The user message may start with "On the desk now: ..." listing objects (name@position[parts] blocks); use those names as "target".
If the user is only chatting, set "build": null.
Never invent blueprint ids — use "sculpt" instead. Output JSON only, no markdown, no reasoning.`;

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

export async function askLLM(env: AgentEnv, text: string, timeoutMs = 18000, scene = '', model?: string): Promise<AgentEnvelope | null> {
  if (!env.LLM_API_KEY) return null;
  const base = (env.LLM_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: model || env.LLM_MODEL || 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
      temperature: 0.2,
      // Nemotron reasoning consumes completion budget before content; 400 leaves content empty.
      max_tokens: 1800,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: scene ? `On the desk now: ${scene}\nUser says: ${text}` : text },
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
export async function decide(env: AgentEnv, text: string, scene = ''): Promise<AgentEnvelope> {
  const mode = (env.AGENT_MODE || 'hybrid').toLowerCase();
  const rules = parseIntent(text);
  const done = (e: AgentEnvelope): AgentEnvelope => ({ ...e, transcript: text });
  if (mode === 'rules' || !env.LLM_API_KEY) return done(rules ?? fallbackEnvelope(text));
  // Hybrid: clear, recognised commands take the fast deterministic path (sub-100 ms);
  // anything open-ended goes to the model.
  if (mode === 'hybrid' && rules?.build) return done(rules);
  try {
    // open-ended build requests ("build me a dragon") go to the sculpt model when one is set
    const wantsMaking = !rules?.build && /\b(build|make|create|sculpt|draw|construct|give me|i want|can you do)\b/i.test(text);
    const llm = await askLLM(env, text, 20000, scene, wantsMaking ? env.SCULPT_MODEL : undefined);
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
