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
  testPathIgnorePatterns: ['/node_modules/', '/_reference/', '/.expo/', '/dist/'],
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', '!**/*.d.ts'],
};
