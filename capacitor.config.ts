import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourschool.suarasiswa',
  appName: 'SuaraSiswa',
  webDir: 'public',
  server: {
    // IMPORTANT: replace this with your real deployed HTTPS URL
    // (from Render, Railway, Fly.io, etc.) once your backend is live.
    url: 'https://REPLACE-WITH-YOUR-DEPLOYED-URL.example.com',
    cleartext: false,
    androidScheme: 'https'
  }
};

export default config;
