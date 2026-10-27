import { describe, expect, it } from 'vitest';
import { cityFromText, geoFromHeaders, isTimeQuestion, isWeatherQuestion, timeAnswer } from '../shared/live.js';
import { voiceFor } from '../shared/agentCore.js';
import { sanitizeEnvelope } from '../shared/protocol.js';

describe('live info', () => {
  it('spots weather questions but not builds', () => {
    expect(isWeatherQuestion("what's the weather like")).toBe(true);
    expect(isWeatherQuestion('will it rain tomorrow?')).toBe(true);
    expect(isWeatherQuestion('build a weather station')).toBe(false);
    expect(isWeatherQuestion('build a house')).toBe(false);
  });
  it('pulls a city out of the question', () => {
    expect(cityFromText('weather in Tokyo')).toBe('Tokyo');
    expect(cityFromText("what's the forecast for New York today?")).toBe('New York');
    expect(cityFromText('what is the weather')).toBeNull();
  });
  it('reads Vercel geo headers', () => {
    const h = new Headers({ 'x-vercel-ip-city': 'Phnom%20Penh', 'x-vercel-ip-country': 'KH', 'x-vercel-ip-latitude': '11.55', 'x-vercel-ip-longitude': '104.92', 'x-vercel-ip-timezone': 'Asia/Phnom_Penh' });
    expect(geoFromHeaders(h)).toEqual({ city: 'Phnom Penh', country: 'KH', lat: 11.55, lon: 104.92, tz: 'Asia/Phnom_Penh' });
    expect(geoFromHeaders(new Headers()).lat).toBeUndefined();
  });
  it('tells the local time', () => {
    expect(isTimeQuestion('what time is it?')).toBe(true);
    const e = timeAnswer({ tz: 'Asia/Phnom_Penh', city: 'Phnom Penh' }, new Date('2026-10-27T05:30:00Z'));
    expect(e.speech).toContain('12:30');
    expect(e.speech).toContain('Phnom Penh');
  });
});

describe('languages', () => {
  it('picks a male voice per language, none where Kokoro has no male voice', () => {
    expect(voiceFor({}, 'en')).toBe('am_adam');
    expect(voiceFor({}, 'es')).toBe('em_alex');
    expect(voiceFor({}, 'ja')).toBe('jm_kumo');
    expect(voiceFor({}, 'fr')).toBeNull();
    expect(voiceFor({}, 'km')).toBeNull();
  });
  it('keeps a valid lang on the envelope and drops junk', () => {
    expect(sanitizeEnvelope({ speech: 'Hola', build: null, lang: 'es' })?.lang).toBe('es');
    expect(sanitizeEnvelope({ speech: 'x', build: null, lang: '<script>' })?.lang).toBeUndefined();
  });
});

describe('web search', () => {
  it('catches explicit search requests', async () => {
    const { explicitSearch, tavilyKeys } = await import('../shared/live.js');
    expect(explicitSearch('search for the price of bitcoin')).toBe('the price of bitcoin');
    expect(explicitSearch('look up who won the world cup?')).toBe('who won the world cup');
    expect(explicitSearch('build a house')).toBeNull();
    expect(tavilyKeys({ TAVILY_API_KEY: 'a, b', TAVILY_API_KEY_2: 'c' })).toEqual(['a', 'b', 'c']);
    expect(tavilyKeys({})).toEqual([]);
  });
  it('falls back to the second key when the first fails', async () => {
    const { webAnswerAny } = await import('../shared/live.js');
    const seen: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).authorization;
      seen.push(auth);
      if (auth.endsWith('bad')) return new Response('{}', { status: 432 });
      return new Response(JSON.stringify({ answer: 'Bitcoin is about 100k. Source says so. Extra.' }), { status: 200 });
    }) as typeof fetch;
    try {
      expect(await webAnswerAny(['bad', 'good'], 'btc')).toBe('Bitcoin is about 100k. Source says so.');
      expect(seen).toEqual(['Bearer bad', 'Bearer good']);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('current-events routing', () => {
  it('sends news/price questions to search, not builds', async () => {
    const { isCurrentQuestion } = await import('../shared/live.js');
    expect(isCurrentQuestion("what's the latest news about nvidia")).toBe(true);
    expect(isCurrentQuestion('what is the price of bitcoin')).toBe(true);
    expect(isCurrentQuestion('who won the game last night')).toBe(true);
    expect(isCurrentQuestion('build the latest iphone')).toBe(false);
    expect(isCurrentQuestion('how many blocks are on my desk')).toBe(false);
  });
});
