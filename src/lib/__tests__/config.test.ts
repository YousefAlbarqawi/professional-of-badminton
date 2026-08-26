/**
 * BUILD-SPEC 2.5 and 23.2.
 *
 * The interesting case is the one nobody sees coming: `EXPO_PUBLIC_*` values
 * are inlined into the bundle at build time, so a variable missing from the
 * EAS `production` environment produces a signed, submitted binary that cannot
 * reach the database at all. These assert that such a build refuses to load
 * rather than shipping quietly, and that a development build is unaffected —
 * a developer without a `.env` must still be able to run the tests and the app.
 */
import type * as ConfigModule from '../config';

type Config = typeof ConfigModule;

function loadConfig(env: Record<string, string | undefined>): Config {
  jest.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../config') as Config;
}

const ORIGINAL = {
  EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_CLIQ_ALIAS: process.env.EXPO_PUBLIC_CLIQ_ALIAS,
  EXPO_PUBLIC_EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  EXPO_PUBLIC_PASSWORD_RESET_URL: process.env.EXPO_PUBLIC_PASSWORD_RESET_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('a production build', () => {
  const PROD = {
    EXPO_PUBLIC_ENVIRONMENT: 'production',
    EXPO_PUBLIC_SUPABASE_URL: 'https://pob-prod.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  };

  it('loads when both Supabase values are set', () => {
    const loaded = loadConfig(PROD);

    expect(loaded.isProduction).toBe(true);
    expect(loaded.missingProductionConfig()).toEqual([]);
  });

  it('refuses to load without a Supabase URL', () => {
    expect(() => loadConfig({ ...PROD, EXPO_PUBLIC_SUPABASE_URL: '' })).toThrow(/supabaseUrl/);
  });

  it('refuses to load without an anon key', () => {
    expect(() => loadConfig({ ...PROD, EXPO_PUBLIC_SUPABASE_ANON_KEY: '' })).toThrow(
      /supabaseAnonKey/,
    );
  });

  it('names the environment to fix, not just the variable', () => {
    // The message is read by whoever is standing in front of a failed build.
    expect(() => loadConfig({ ...PROD, EXPO_PUBLIC_SUPABASE_URL: '' })).toThrow(/EAS/);
  });
});

describe('a development build', () => {
  it('loads with nothing set at all', () => {
    // A developer who has just cloned the repository has no `.env`, and the
    // test suite itself runs this way.
    const loaded = loadConfig({
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
    });

    expect(loaded.isProduction).toBe(false);
    expect(loaded.missingProductionConfig()).toEqual(['supabaseUrl', 'supabaseAnonKey']);
  });
});

describe('2.5, the values that have a working default', () => {
  it('falls back to D71’s WhatsApp number', () => {
    const loaded = loadConfig({
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_WHATSAPP_NUMBER: '',
    });

    expect(loaded.config.whatsappNumber).toBe('962792841696');
  });

  it('knows the CliQ alias is still a placeholder', () => {
    // Section 24 question 2. A fabricated alias on a real phone would send
    // somebody's money to nobody, so the sheet hides it until this is true.
    const loaded = loadConfig({
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_CLIQ_ALIAS: '',
    });

    expect(loaded.hasCliqAlias).toBe(false);
  });

  it('knows push cannot work without an EAS project', () => {
    const loaded = loadConfig({
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_EAS_PROJECT_ID: '',
    });

    expect(loaded.hasPushProject).toBe(false);
  });

  it('knows the password reset page is not hosted yet', () => {
    // Section 24 question 8. Until GitHub Pages exists, `requestPasswordReset`
    // omits `redirectTo` rather than pointing at a URL nobody has stood up.
    const loaded = loadConfig({
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_PASSWORD_RESET_URL: '',
    });

    expect(loaded.hasPasswordResetUrl).toBe(false);
    expect(loaded.config.passwordResetUrl).toBe('');
  });

  it('reports the reset URL once it is set', () => {
    const loaded = loadConfig({
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_PASSWORD_RESET_URL:
        'https://example.github.io/professional-of-badminton/reset-password/',
    });

    expect(loaded.hasPasswordResetUrl).toBe(true);
  });
});
