import type { ExpoConfig } from 'expo/config';

/**
 * Expo configuration. Every environment-specific value comes from `.env`
 * (see `.env.example`). The service role key is never present here; it exists
 * only as an Edge Function secret. BUILD-SPEC section 2.5.
 */
const config: ExpoConfig = {
  name: 'Professional of Badminton',
  slug: 'professional-of-badminton',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'pob',
  // Dark theme only. There is no light theme and no system theme following.
  // BUILD-SPEC section 17.1.
  userInterfaceStyle: 'dark',
  backgroundColor: '#111111',
  assetBundlePatterns: ['**/*'],
  ios: {
    // Mobile only. No tablet layouts. D79.
    supportsTablet: false,
    bundleIdentifier: 'jo.professionalofbadminton.app',
  },
  android: {
    package: 'jo.professionalofbadminton.app',
    adaptiveIcon: {
      backgroundColor: '#111111',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-font',
    'expo-localization',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        backgroundColor: '#111111',
        imageWidth: 200,
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
    whatsappNumber: process.env.EXPO_PUBLIC_WHATSAPP_NUMBER ?? '962792841696',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  },
};

export default config;
