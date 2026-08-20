/**
 * Runtime configuration, read from the `EXPO_PUBLIC_*` variables that Expo
 * inlines at build time. BUILD-SPEC section 2.5.
 *
 * The service role key is never here. It exists only as an Edge Function
 * secret.
 */

export type Environment = 'development' | 'production';

/** D71: all player to coach communication goes through this number. */
const FALLBACK_WHATSAPP_NUMBER = '962792841696';

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
}

export const config = {
  supabaseUrl: readString(process.env.EXPO_PUBLIC_SUPABASE_URL, ''),
  supabaseAnonKey: readString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, ''),
  environment: readString(process.env.EXPO_PUBLIC_ENVIRONMENT, 'development') as Environment,
  whatsappNumber: readString(process.env.EXPO_PUBLIC_WHATSAPP_NUMBER, FALLBACK_WHATSAPP_NUMBER),
  sentryDsn: readString(process.env.EXPO_PUBLIC_SENTRY_DSN, ''),
} as const;

export const isProduction = config.environment === 'production';
