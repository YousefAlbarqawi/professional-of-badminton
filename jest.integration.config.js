/**
 * Integration tests against a local Supabase. Kept out of `npm test` on
 * purpose: the unit suite must stay runnable without Docker.
 *
 *   npm run db:start && npm run test:db
 */
module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/supabase/tests/globalSetup.ts',
  testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  // Signing in as a dozen accounts over HTTP is not fast.
  testTimeout: 30000,
};
