export type Emotion = 'happy' | 'curious' | 'calm' | 'excited' | 'love' | 'sad';
export type Gesture = 'idle' | 'wave' | 'dance' | 'hug' | 'breathe';
export type WorldId = 'home' | 'garden' | 'clouds' | 'moon';
export type Panel = 'worlds' | 'memories' | 'customize' | 'utilities' | 'settings' | null;
export type Activity = 'idle' | 'water' | 'read' | 'tea' | 'rest' | 'computer' | 'wander';
export type Daylight = 'day' | 'golden' | 'night';
export type ThemeMode = 'light' | 'dark';
export type ThemeColor = 'sage' | 'lavender' | 'peach' | 'sky' | 'rose' | 'cocoa';
export type TextSize = 'small' | 'normal' | 'large' | 'xlarge';
export type FontStyle = 'soft' | 'clean' | 'system';
export type ProactiveFrequency = 'calm' | 'balanced' | 'lively';

export interface HomeSettings {
  daylight: Daylight;
  weather: 'clear' | 'fireflies' | 'rain';
  autonomous: boolean;
  decor: 'oak' | 'cream' | 'walnut';
  plantGrowth: number;
}



export interface WeatherReport {
  location: string;
  country?: string;
  timezone?: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  condition: string;
  high: number;
  low: number;
  precipitationChance: number;
  updatedAt: number;
}

export interface DailyReminder {
  id: number;
  title: string;
  time: string;
  enabled: boolean;
  createdAt: number;
}

export interface Message {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp: number;
}

export interface Memory {
  id: string;
  text: string;
  savedAt: number;
}

export interface Profile {
  userName: string;
  companionName: string;
  color: 'sage' | 'lavender' | 'peach' | 'sky' | 'rose' | 'cocoa';
  personality: 'Gentle' | 'Playful' | 'Curious';
  accessory: 'none' | 'glasses' | 'scarf' | 'headphones';
  antenna: 'sprout' | 'star' | 'orb';
  eyeColor: 'mint' | 'amber' | 'sky' | 'rose';
  finish: 'ceramic' | 'clay' | 'chrome';
  motionSpeed: number;
  size: number;
}

export interface World {
  id: WorldId;
  name: string;
  subtitle: string;
  description: string;
  image: string;
  light: string;
}

export type AsrMode = 'server' | 'bilingual-auto';

export interface ConnectionConfig {
  bridgeUrl: string;
  xiaozhiUrl: string;
  deviceId: string;
  clientId: string;
  token: string;
  asrMode: AsrMode;
  asrLanguages: string;
}

export type ConnectionStatus = 'demo' | 'connecting' | 'connected' | 'error';

export interface XiaozhiEvent {
  type: string;
  transport?: string;
  session_id?: string;
  state?: string;
  text?: string;
  emotion?: string;
  message?: string;
  gesture?: string;
  payload?: {
    gesture?: string;
    emotion?: string;
    action?: string;
    query?: string;
    url?: string;
    jsonrpc?: string;
    method?: string;
    id?: string | number;
    params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string };
  };
}