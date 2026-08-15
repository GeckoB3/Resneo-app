/**
 * Jest configuration for the Resneo mobile app.
 *
 * Uses the `jest-expo` preset so Expo / React Native modules transform correctly.
 * Pure-logic suites under lib/** run fine; component suites use
 * @testing-library/react-native. `@/` path alias is mapped to the repo root to
 * match the app's tsconfig + Metro resolver.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  /**
   * `/.claude/` covers git worktrees, which the Claude Code harness creates at
   * `.claude/worktrees/<name>/` — INSIDE the repo. A worktree is a full second
   * checkout of the app, so without this every suite is discovered twice and the
   * run reports double: 330 suites / 3,426 tests against a real 165 / 1,713.
   * The inflated count is the harmless half. The dangerous half is that a
   * failure in a STALE worktree reads as a failure on the branch you are
   * actually on. Found by the 2026-08-15 go-live check, whose first numbers were
   * wrong because of it.
   *
   * `/_reference/` is the same idea for the web app's own clone — dropping it
   * makes this run the WEB suite, which is how the pattern above was diagnosed.
   */
  testPathIgnorePatterns: ['/node_modules/', '/_reference/', '/.expo/', '/dist/', '/.claude/'],
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', '!**/*.d.ts'],
};
