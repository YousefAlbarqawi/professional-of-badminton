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

/**
 * The academy's CliQ alias, shown with a copy button in the payment sheet.
 * BUILD-SPEC 10.1 step 2, and the answer to section 24 question 2.
 *
 * Hardcoded as the fallback for the same reason D71's WhatsApp number is: it is
 * a public value the app cannot work without, so a build that reaches a phone
 * without the variable set must still show the right alias rather than none.
 */
const FALLBACK_CLIQ_ALIAS = 'prof2023';

/**
 * The account holder the alias resolves to, which is what a player's banking
 * app shows him before he confirms the transfer. Displayed under the alias so
 * that an unfamiliar personal name reads as confirmation rather than as a
 * reason to stop — the academy's CliQ account is a personal one.
 */
const FALLBACK_CLIQ_ACCOUNT_NAME = 'MOHAMMAD YOUSEF A. ABUDABBOUR';

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
  cliqAlias: readString(process.env.EXPO_PUBLIC_CLIQ_ALIAS, FALLBACK_CLIQ_ALIAS),
  cliqAccountName: readString(
    process.env.EXPO_PUBLIC_CLIQ_ACCOUNT_NAME,
    FALLBACK_CLIQ_ACCOUNT_NAME,
  ),
  /**
   * The EAS project the push credentials belong to. BUILD-SPEC 2.1: push is
   * expo-notifications over FCM and APNs, so Expo holds the credentials and
   * `getExpoPushTokenAsync` has to be told which project's.
   *
   * Empty until the project exists, and empty is handled: `acquireDeviceToken`
   * skips registration rather than throwing, so a build without it works in
   * every respect except being reachable by a notification. Recorded in
   * OPEN-ITEMS.md as a deployment step rather than code.
   */
  easProjectId: readString(process.env.EXPO_PUBLIC_EAS_PROJECT_ID, ''),
  /**
   * Section 24 question 8: the hosted page a Supabase recovery link redirects
   * to. `requestPasswordReset` passes this as `redirectTo` when it is set;
   * when it is not, the call omits `redirectTo` and Supabase falls back to
   * `site_url`, which is the flow's pre-existing (dead-ends on a mobile-only
   * app) behaviour rather than a new failure mode.
   */
  passwordResetUrl: readString(process.env.EXPO_PUBLIC_PASSWORD_RESET_URL, ''),
} as const;

/** False until an EAS project id is configured, and therefore until push can work. */
export const hasPushProject = config.easProjectId !== '';

/** False until the hosted reset-password page exists. */
export const hasPasswordResetUrl = config.passwordResetUrl !== '';

export const isProduction = config.environment === 'production';

/**
 * The variables a production build cannot run without. BUILD-SPEC 23.2.
 *
 * `EXPO_PUBLIC_*` values are inlined at build time, so one missing from the
 * EAS environment produces a binary that is broken for everybody and looks
 * fine until it is launched — after `eas submit`, which is the expensive place
 * to find out. Exported so the check is a value rather than a comment.
 */
export const REQUIRED_IN_PRODUCTION = ['supabaseUrl', 'supabaseAnonKey'] as const;

/** Which of them are empty. Empty array means the build is configured. */
export function missingProductionConfig(): string[] {
  return REQUIRED_IN_PRODUCTION.filter((key) => config[key] === '');
}

// A production build that reached a phone without a Supabase URL can do
// nothing at all — `createClient` throws on the next line of the next module,
// with a message about a URL rather than about a build. Failing here says
// which variable and which environment, which is the difference between a
// five minute fix and an afternoon.
if (isProduction) {
  const missing = missingProductionConfig();
  if (missing.length > 0) {
    throw new Error(
      `Production build is missing ${missing.join(', ')}. ` +
        'Set them on the EAS `production` environment; see store/README.md.',
    );
  }
}
