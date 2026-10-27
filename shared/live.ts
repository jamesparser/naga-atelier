/**
 * Live information for Naga (server-side only).
 *  - Weather: Open-Meteo (free, no key). Uses the city you name, or your approximate location
 *    from the request (Vercel's IP geolocation headers).
 *  - Anything else current (news, prices, scores): Tavily web search, when TAVILY_API_KEY is set.
 */
import type { AgentEnvelope } from './protocol.js';

export interface Geo {
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  /** IANA time zone, e.g. Asia/Phnom_Penh */
  tz?: string;
}

/** Read Vercel's IP-geolocation headers (approximate city; nothing is stored). */
export function geoFromHeaders(h: { get(name: string): string | null }): Geo {
  const num = (k: string) => {
    const v = parseFloat(h.get(k) ?? '');
    return Number.isFinite(v) ? v : undefined;
  };
  let city = h.get('x-vercel-ip-city') ?? undefined;
  try {
    if (city) city = decodeURIComponent(city);
  } catch {
    /* keep raw */
  }
  return {
    city,
    country: h.get('x-vercel-ip-country') ?? undefined,
    lat: num('x-vercel-ip-latitude'),
    lon: num('x-vercel-ip-longitude'),
    tz: h.get('x-vercel-ip-timezone') ?? undefined,
  };
}

const TIME_RE = /\b(what time is it|what'?s the time|current time|what (day|date) is (it|today)|today'?s date)\b/i;
export function isTimeQuestion(text: string): boolean {
  return TIME_RE.test(text);
}

export function timeAnswer(geo: Geo, now = new Date()): AgentEnvelope {
  const tz = geo.tz || 'UTC';
  let t: string;
  try {
    t = now.toLocaleString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    t = now.toUTCString();
  }
  const where = geo.city ? ` in ${geo.city}` : '';
  return { speech: `It's ${t}${where}.`, build: null, source: 'clock', lang: 'en' };
}

const WEATHER_RE = /\b(weather|forecast|temperature|how (hot|cold|warm) is it|is it (raining|sunny|cold|hot)|going to rain|will it rain|umbrella)\b/i;

export function isWeatherQuestion(text: string): boolean {
  return WEATHER_RE.test(text) && !/\b(build|make|sculpt|create)\b/i.test(text);
}

const CODES: Array<[number[], string]> = [
  [[0], 'clear skies'],
  [[1, 2], 'partly cloudy'],
  [[3], 'overcast'],
  [[45, 48], 'foggy'],
  [[51, 53, 55, 56, 57], 'drizzly'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rainy'],
  [[71, 73, 75, 77, 85, 86], 'snowy'],
  [[95, 96, 99], 'stormy'],
];
const describe = (code: number) => CODES.find(([c]) => c.includes(code))?.[1] ?? 'mixed weather';

function withTimeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** "weather in Tokyo", "what's the forecast for New York?" → "Tokyo" */
export function cityFromText(text: string): string | null {
  const m = text.match(/\b(?:in|at|for)\s+([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ .'-]{1,40}?)\s*(?:today|tomorrow|now|right now|this week)?\s*[?.!]*$/i);
  if (!m) return null;
  const c = m[1].trim();
  return /^(the|my|here|there|me|it|today|tomorrow)$/i.test(c) ? null : c;
}

export async function weatherAnswer(text: string, geo: Geo, city?: string | null): Promise<AgentEnvelope> {
  let lat = geo.lat, lon = geo.lon, place = geo.city ?? '';
  const named = city || cityFromText(text);
  try {
    if (named) {
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(named)}`, { signal: withTimeout(5000) });
      const j = (await g.json()) as { results?: Array<{ latitude: number; longitude: number; name: string; country_code?: string }> };
      const r = j.results?.[0];
      if (!r) return { speech: `I couldn't find a place called ${named}.`, build: null, source: 'weather', lang: 'en' };
      lat = r.latitude;
      lon = r.longitude;
      place = r.name;
      geo = { ...geo, country: r.country_code };
    }
    if (lat === undefined || lon === undefined || Number.isNaN(lat) || Number.isNaN(lon)) {
      return { speech: 'Which city? Try “weather in Phnom Penh”.', build: null, source: 'weather', lang: 'en' };
    }
    const us = geo.country === 'US';
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto` +
      (us ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
    const w = await fetch(url, { signal: withTimeout(6000) });
    const d = (await w.json()) as {
      current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
      daily?: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
    };
    if (!d.current) throw new Error('no data');
    const u = us ? '°F' : '°C';
    const t = Math.round(d.current.temperature_2m), feels = Math.round(d.current.apparent_temperature);
    const hi = d.daily ? Math.round(d.daily.temperature_2m_max[0]) : null, lo = d.daily ? Math.round(d.daily.temperature_2m_min[0]) : null;
    const rain = d.daily?.precipitation_probability_max?.[0];
    const where = place ? `${decodeURIComponent(place)}: ` : '';
    let speech = `${where}${t}${u} and ${describe(d.current.weather_code)}`;
    if (Math.abs(feels - t) >= 3) speech += `, feels like ${feels}${u}`;
    if (hi !== null && lo !== null) speech += `. High ${hi}, low ${lo}`;
    if (typeof rain === 'number') speech += `, ${rain}% chance of rain`;
    return { speech: `${speech}.`, build: null, source: 'weather', lang: 'en' };
  } catch {
    return { speech: "I couldn't reach the weather service just now. Try again in a moment.", build: null, source: 'weather(error)', lang: 'en' };
  }
}

/** Tavily web search → a short spoken answer (first two sentences). */
export async function webAnswer(apiKey: string, query: string): Promise<string | null> {
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: query.slice(0, 200), search_depth: 'basic', include_answer: 'basic', max_results: 3 }),
      signal: withTimeout(9000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { answer?: string; results?: Array<{ content?: string }> };
    const text = (j.answer || j.results?.[0]?.content || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const two = text.match(/^(.+?[.!?])(\s+.+?[.!?])?/);
    return (two ? two[0] : text).slice(0, 260);
  } catch {
    return null;
  }
}
