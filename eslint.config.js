// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

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
]);
