import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';
import type { DailyReminder, WeatherReport } from '../types';

type GeocodingResult = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type GeocodingResponse = { results?: GeocodingResult[] };

type ForecastResponse = {
  timezone?: string;
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

interface MoriUtilitiesNativePlugin {
  openNavigation(options: { destination: string }): Promise<{ opened: boolean; target: string }>;
  scheduleDailyReminder(options: { id: number; title: string; time: string }): Promise<{ scheduled: boolean; permissionRequested?: boolean }>;
  cancelReminder(options: { id: number }): Promise<{ cancelled: boolean }>;
}

const NativeUtilities = registerPlugin<MoriUtilitiesNativePlugin>('MoriUtilities');

const weatherLabels: Record<number, string> = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Heavy freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Rain showers', 82: 'Heavy rain showers', 85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
};

function cleanLocation(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function weatherCondition(code: number) {
  return weatherLabels[Math.round(code)] ?? 'Changing weather';
}

export async function getWeather(location: string): Promise<WeatherReport> {
  const query = cleanLocation(location);
  if (query.length < 2) throw new Error('Enter a city or place name for the weather report.');

  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.searchParams.set('name', query);
  geocodeUrl.searchParams.set('count', '1');
  geocodeUrl.searchParams.set('language', 'en');
  geocodeUrl.searchParams.set('format', 'json');
  const geocodeResponse = await fetch(geocodeUrl.toString(), { headers: { Accept: 'application/json' } });
  if (!geocodeResponse.ok) throw new Error('The location search service is unavailable right now.');
  const geocode = await geocodeResponse.json() as GeocodingResponse;
  const place = geocode.results?.[0];
  if (!place) throw new Error(`I couldn't find “${query}”. Try adding the country or region.`);

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(place.latitude));
  forecastUrl.searchParams.set('longitude', String(place.longitude));
  forecastUrl.searchParams.set('timezone', 'auto');
  forecastUrl.searchParams.set('forecast_days', '1');
  forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code');
  forecastUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  const forecastResponse = await fetch(forecastUrl.toString(), { headers: { Accept: 'application/json' } });
  if (!forecastResponse.ok) throw new Error('The weather service is unavailable right now.');
  const forecast = await forecastResponse.json() as ForecastResponse;
  if (!forecast.current) throw new Error('No current weather report was returned for this place.');

  const code = Number(forecast.current.weather_code ?? 0);
  return {
    location: [place.name, place.admin1].filter(Boolean).join(', '),
    country: place.country,
    timezone: forecast.timezone || place.timezone,
    temperature: Number(forecast.current.temperature_2m ?? 0),
    apparentTemperature: Number(forecast.current.apparent_temperature ?? forecast.current.temperature_2m ?? 0),
    humidity: Number(forecast.current.relative_humidity_2m ?? 0),
    windSpeed: Number(forecast.current.wind_speed_10m ?? 0),
    weatherCode: code,
    condition: weatherCondition(code),
    high: Number(forecast.daily?.temperature_2m_max?.[0] ?? forecast.current.temperature_2m ?? 0),
    low: Number(forecast.daily?.temperature_2m_min?.[0] ?? forecast.current.temperature_2m ?? 0),
    precipitationChance: Number(forecast.daily?.precipitation_probability_max?.[0] ?? 0),
    updatedAt: Date.now(),
  };
}

export function weatherSummary(report: WeatherReport) {
  const place = report.country ? `${report.location}, ${report.country}` : report.location;
  return `${place}: ${report.condition}, ${Math.round(report.temperature)}°C (feels like ${Math.round(report.apparentTemperature)}°C). Today's range is ${Math.round(report.low)}–${Math.round(report.high)}°C, humidity ${Math.round(report.humidity)}%, wind ${Math.round(report.windSpeed)} km/h, and precipitation chance up to ${Math.round(report.precipitationChance)}%.`;
}

export function navigationUrl(destination: string) {
  const place = cleanLocation(destination);
  if (!place) throw new Error('Enter a destination first.');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}&travelmode=driving`;
}

export async function openNavigation(destination: string) {
  const place = cleanLocation(destination);
  if (!place) throw new Error('Enter a destination first.');
  if (isNative) return NativeUtilities.openNavigation({ destination: place });
  const url = navigationUrl(place);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
  return { opened: true, target: place };
}

export function validateReminderTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) throw new Error('Use a 24-hour time such as 08:30 or 21:15.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Use a valid 24-hour time.');
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function newReminderId() {
  return Math.max(1, Math.floor((Date.now() + Math.random() * 10000) % 2_000_000_000));
}

export async function scheduleNativeReminder(reminder: DailyReminder) {
  if (!isNative) return { scheduled: false, webFallback: true };
  return NativeUtilities.scheduleDailyReminder({ id: reminder.id, title: reminder.title, time: validateReminderTime(reminder.time) });
}

export async function cancelNativeReminder(id: number) {
  if (!isNative) return { cancelled: true };
  return NativeUtilities.cancelReminder({ id });
}
