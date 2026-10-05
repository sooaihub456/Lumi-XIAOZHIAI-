export type Emotion = 'happy' | 'curious' | 'calm' | 'excited' | 'love' | 'sad';
export type Gesture = 'idle' | 'wave' | 'dance' | 'hug' | 'breathe';
export type WorldId = 'home' | 'garden' | 'clouds' | 'moon';
export type Panel = 'worlds' | 'memories' | 'customize' | 'settings' | null;
export type Activity = 'idle' | 'water' | 'read' | 'tea' | 'rest' | 'computer' | 'wander';
export type Daylight = 'day' | 'golden' | 'night';

export interface HomeSettings {
  daylight: Daylight;
  weather: 'clear' | 'fireflies' | 'rain';
  autonomous: boolean;
  decor: 'oak' | 'cream' | 'walnut';
  plantGrowth: number;
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

export interface ConnectionConfig {
  bridgeUrl: string;
  deviceId: string;
  clientId: string;
  token: string;
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