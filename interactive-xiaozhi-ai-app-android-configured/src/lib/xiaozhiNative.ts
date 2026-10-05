import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export const DEFAULT_XIAOZHI_WS_URL = 'wss://api.tenclass.net/xiaozhi/v1/';

export interface NativeXiaozhiMessageEvent {
  kind: 'text' | 'binary';
  data: string;
}

export interface NativeXiaozhiErrorEvent {
  message: string;
  httpStatus?: number;
}

export interface NativeXiaozhiClosedEvent {
  code: number;
  reason: string;
}

export interface NativeXiaozhiAudioErrorEvent {
  message: string;
}

interface NativeXiaozhiPlugin {
  connect(options: { url: string; deviceId: string; clientId: string; token: string }): Promise<{ connected: boolean }>;
  send(options: { text: string }): Promise<void>;
  stopAudio(): Promise<void>;
  setAudioEnabled(options: { enabled: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(eventName: 'message', listener: (event: NativeXiaozhiMessageEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'error', listener: (event: NativeXiaozhiErrorEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listener: (event: NativeXiaozhiClosedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'audioError', listener: (event: NativeXiaozhiAudioErrorEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'state', listener: (event: { state: string }) => void): Promise<PluginListenerHandle>;
}

export const NativeXiaozhi = registerPlugin<NativeXiaozhiPlugin>('MoriXiaozhi');
