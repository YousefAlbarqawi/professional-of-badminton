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
    infoPlist: {
      // Arabic is the default language of the app (16.1) and of most of its
      // players, and iOS picks a permission string by the *device* language.
      // Without this, a device set to Arabic falls back to the base
      // localisation and reads the English string. 23.3.
      CFBundleAllowMixedLocalizations: true,
    },
  },
  // 23.3: "camera and photo library usage strings in both languages". Expo
  // writes each of these into its own `InfoPlist.strings` under an `.lproj`
  // directory, which is the only place iOS looks for a translated system
  // prompt — a config plugin takes one string per key and cannot express two.
  // The English copy here is 23.3's, verbatim, and it is also what the
  // `expo-image-picker` plugin below writes as the base localisation.
  locales: {
    en: './assets/locales/en.json',
    ar: './assets/locales/ar.json',
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
    // 10.1 steps 3 and 4: the CliQ screenshot is picked and then resized to
    // 1600px and compressed to JPEG 0.7 before it leaves the phone.
    [
      'expo-image-picker',
      {
        // 23.3's two strings, verbatim. These are the base localisation; the
        // Arabic ones come from `locales` above.
        photosPermission: 'To attach your CliQ transfer screenshot when you reserve a spot.',
        cameraPermission: 'To photograph your CliQ transfer receipt.',
        // The plugin adds RECORD_AUDIO by default, because a picker can pick
        // video. This app picks one still image, in one flow (10.1), and
        // 23.3's data safety form has to be able to say the app records no
        // audio. `false` both drops the permission and blocks anything else
        // from adding it back.
        microphonePermission: false,
      },
    ],
    // Section 18's two notifications. The plugin exists for the native side of
    // it — the Android notification icon and colour, and the iOS entitlement —
    // not for anything the JavaScript reads.
    [
      'expo-notifications',
      {
        color: '#A8D5BA',
      },
    ],
    // Tokens live in the keychain / Android keystore, never in AsyncStorage.
    'expo-secure-store',
    // A35's amendment, phase 10 — see OPEN-ITEMS.md. No config of its own; the
    // plugin only links the native module.
    '@react-native-community/datetimepicker',
    // 23.4: "Sentry for crashes and unhandled promise rejections." The plugin
    // is the native half — the crash handlers and the source map upload. What
    // the SDK is allowed to collect is decided in `src/lib/monitoring.ts`, and
    // it is deliberately much less than the default.
    '@sentry/react-native',
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
    cliqAlias: process.env.EXPO_PUBLIC_CLIQ_ALIAS ?? '',
    // Which EAS project the push credentials belong to. Section 18 and 2.1.
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
    // Section 24 question 8: where the Supabase recovery link lands. Empty
    // until the GitHub Pages site exists.
    passwordResetUrl: process.env.EXPO_PUBLIC_PASSWORD_RESET_URL ?? '',
  },
};

export default config;
