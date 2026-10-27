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
