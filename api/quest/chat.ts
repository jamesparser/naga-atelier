/**
 * POST /api/quest/chat   — public, rate-limited agent endpoint for the Quest client.
 *   JSON  {"text": "build a small house"}            -> AgentEnvelope
 *   audio (Content-Type: audio/*)                      -> STT, then AgentEnvelope (+ transcript)
 * GET  /api/quest/chat   — capability probe {ok, stt, llm, tts}
 *
 * Secrets stay server-side (Vercel env). The client bundle never contains keys.
 */
import { DEFAULT_SCULPT_MODELS, decide, synthesize, transcribeLang, type AgentEnv } from '../../shared/agentCore.js';
import { geoFromHeaders } from '../../shared/live.js';

export const config = { maxDuration: 30 };

const env = process.env as unknown as AgentEnv & { ALLOWED_ORIGINS?: string };
const MAX_AUDIO = 2_000_000;
const MAX_TEXT = 300;

// Best-effort per-instance rate limit: 30 requests / minute / IP.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok
    ? { 'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type, x-naga-scene', vary: 'origin' }
    : {};
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(req) },
  });
}

export function OPTIONS(req: Request): Response {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function GET(req: Request): Promise<Response> {
  // ?models=1 lists the model ids the configured LLM provider offers (ids only, no keys)
  if (new URL(req.url).searchParams.has('models') && env.LLM_API_KEY) {
    try {
      const base = (env.LLM_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, '');
      const r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${env.LLM_API_KEY}` }, signal: AbortSignal.timeout(8000) });
      const j = (await r.json()) as { data?: Array<{ id: string }> };
      return json({ models: (j.data ?? []).map((m) => m.id).slice(0, 200) }, 200, req);
    } catch (e) {
      return json({ error: String((e as Error).message).slice(0, 80) }, 502, req);
    }
  }
  return json(
    {
      ok: true,
      v: 1,
      stt: !!env.ASSEMBLYAI_API_KEY,
      llm: !!env.LLM_API_KEY,
      tts: !!env.TTS_BASE_URL,
      weather: true,
      search: !!(env.TAVILY_API_KEY || env.TAVILY_API_KEY_2),
      languages: 'auto',
      llmModel: env.LLM_MODEL || null,
      sculptModel: env.SCULPT_MODEL || DEFAULT_SCULPT_MODELS[0],
      llmBase: env.LLM_BASE_URL || 'https://api.tokenfactory.nebius.com/v1',
    },
    200,
    req,
  );
}

export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'anon').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'rate_limited', speech: 'Give me a second to catch up.' }, 429, req);

  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  let text = '';
  let heardLang: string | undefined;
  let scene = '';
  try {
    scene = decodeURIComponent(req.headers.get('x-naga-scene') ?? '').slice(0, 600);
  } catch {
    /* ignore */
  }
  try {
    if (type.startsWith('audio/') || type.startsWith('application/octet-stream')) {
      const buf = await req.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_AUDIO) return json({ error: 'bad_audio' }, 413, req);
      if (!env.ASSEMBLYAI_API_KEY) return json({ error: 'stt_unavailable' }, 501, req);
      const heard = await transcribeLang(env, buf);
      text = heard.text;
      heardLang = heard.lang;
      if (!text) return json({ speech: "Sorry, I didn't catch that.", build: null, transcript: '' }, 200, req);
    } else {
      const body = (await req.json().catch(() => null)) as { text?: unknown; scene?: unknown } | null;
      if (body && typeof body.scene === 'string') scene = body.scene.slice(0, 600);
      if (!body || typeof body.text !== 'string' || !body.text.trim()) return json({ error: 'bad_request' }, 400, req);
      text = body.text.trim().slice(0, MAX_TEXT);
    }
  } catch (e) {
    return json({ error: 'stt_failed', detail: String((e as Error).message).slice(0, 80) }, 502, req);
  }

  const envelope = await decide(env, text, scene, geoFromHeaders(req.headers));
  if (!envelope.lang && heardLang && heardLang !== 'en' && envelope.source?.startsWith('llm')) envelope.lang = heardLang;
  const audio = await synthesize(env, envelope.speech, envelope.lang).catch(() => null);
  return json({ ...envelope, audio }, 200, req);
}
