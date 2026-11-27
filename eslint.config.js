// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require('globals');

const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', '**/__mocks__/**', 'jest.setup.js'];

module.exports = defineConfig([
  expoConfig,
  {
    // `.claude/**` covers harness-created git worktrees, which live INSIDE the
    // repo at `.claude/worktrees/<name>/`. Each is a full second checkout, so
    // without this every file is linted twice and the error count doubles (30
    // against a real 15) — which makes the standing baseline unreadable, and
    // that baseline is how each go-live check tells a new error from an old one.
    // Mirrors the same entry in `jest.config.js`; keep the two in step.
    ignores: ["dist/*", "_reference/**", ".claude/**"],
  },
  {
    // Codebase standards plan P5.5: hook dependencies and unused variables are errors. A deliberate
    // exception is an eslint-disable-next-line with its reason on the line, never a silent change.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // P5.5: tests mock modules before importing them (jest.mock is hoisted) and require inside a
    // mock factory, so the import-order and require rules only add noise there (about 990 warnings).
    files: TEST_FILES,
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
    },
  },
  {
    // Build scripts run in Node.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]);
