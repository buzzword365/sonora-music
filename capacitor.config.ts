import type { CapacitorConfig } from '@capacitor/cli';

// iOS: bundle the production interface into a standalone WKWebView app.
// No development server, remote host, or internet service is needed to launch.
const config: CapacitorConfig = {
  appId: 'com.sonora.personalplayer',
  appName: 'Sonora Music',
  webDir: 'dist',
  ios: {
    contentInset: 'always'
  }
};

export default config;
