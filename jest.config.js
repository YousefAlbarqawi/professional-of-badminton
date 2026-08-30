module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // The integration suite needs a running local Supabase; it has its own
  // config and its own script. `npm test` must stay runnable without Docker.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/supabase/tests/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@formatjs/.*|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-gesture-handler|react-native-reanimated|react-native-worklets))',
  ],
  // React 19's test renderer leaves the worker alive after the last test; the
  // in-band run with --detectOpenHandles reports nothing, so there is nothing to
  // close. Without this, `npm test` passes and then hangs forever.
  forceExit: true,
  collectCoverageFrom: ['src/lib/**/*.ts', '!src/lib/**/__tests__/**'],
  coverageThreshold: {
    './src/lib/': { branches: 90, functions: 100, lines: 95, statements: 95 },
  },
};
