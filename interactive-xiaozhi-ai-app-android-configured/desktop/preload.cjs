const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel, callback) => {
  if (typeof callback !== 'function') throw new TypeError('An event callback is required.');
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// Only this fixed API reaches the trusted Mori UI. Internet tabs have no preload.
contextBridge.exposeInMainWorld('moriDesktop', Object.freeze({
  version: 1,
  platform: process.platform,
  info: () => ipcRenderer.invoke('mori:info'),
  takeLaunchUrl: () => ipcRenderer.invoke('mori:take-launch-url'),
  onLaunchReady: (callback) => listen('mori:launch-ready', callback),
  openExternal: (url) => ipcRenderer.invoke('mori:external', { url }),
  copyText: (text) => ipcRenderer.invoke('mori:clipboard', { text }),
  saveFile: (name, bytes) => ipcRenderer.invoke('mori:save-file', { name, bytes }),
  onShortcut: (callback) => listen('mori:shortcut', callback),
  onAppState: (callback) => listen('mori:app-state', callback),
  browser: Object.freeze({
    open: (options) => ipcRenderer.invoke('mori:browser-open', options),
    navigate: (options) => ipcRenderer.invoke('mori:browser-navigate', options),
    bounds: (options) => ipcRenderer.invoke('mori:browser-bounds', options),
    command: (options) => ipcRenderer.invoke('mori:browser-command', options),
    inspect: (options) => ipcRenderer.invoke('mori:browser-inspect', options),
    close: (options) => ipcRenderer.invoke('mori:browser-close', options),
    state: () => ipcRenderer.invoke('mori:browser-state'),
    tab: (options) => ipcRenderer.invoke('mori:browser-tab', options),
    sharing: (enabled) => ipcRenderer.invoke('mori:browser-sharing', { enabled }),
    clearData: () => ipcRenderer.invoke('mori:browser-clear'),
    diagnose: (url) => ipcRenderer.invoke('mori:browser-diagnose', { url }),
    profile: (profile) => ipcRenderer.invoke('mori:browser-profile', { profile }),
    downloads: () => ipcRenderer.invoke('mori:downloads'),
    onState: (callback) => listen('mori:browser-state', callback),
    onDownload: (callback) => listen('mori:download', callback),
  }),
}));