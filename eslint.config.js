// ESLint flat config. Enforces the non-negotiables in CLAUDE.md that a linter
// can actually catch: no `any`, no raw `new Date()` in business logic, and no
// browser storage APIs.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'coverage/**',
      'assets/**',
      'supabase/functions/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'No browser storage APIs. Use expo-secure-store or AsyncStorage.',
        },
        {
          name: 'sessionStorage',
          message: 'No browser storage APIs. Use expo-secure-store or AsyncStorage.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"]',
          message:
            'Never use `new Date()` for business logic. Use the helpers in src/lib/time.ts (BUILD-SPEC 5.1).',
        },
      ],
    },
  },
  {
    // time.ts is the one place allowed to construct Dates, and tests need to
    // build fixed instants to assert against.
    files: ['src/lib/time.ts', '**/__tests__/**/*.ts', '**/__tests__/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // The tooling configs are CommonJS, so require() is correct there.
    files: ['eslint.config.js', 'jest.config.js', 'babel.config.js'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
