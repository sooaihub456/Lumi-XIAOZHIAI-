import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mori.companion',
  appName: 'Mori',
  webDir: 'dist',
  backgroundColor: '#fcfcf9',
  loggingBehavior: 'none',
  android: {
    backgroundColor: '#fcfcf9',
    allowMixedContent: false,
    minWebViewVersion: 100,
  },
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'webview-update.html',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
    },
  },
};

export default config;