// Makes Jest's global test APIs (describe/it/expect/jest) visible to `tsc`.
// Co-located *.test.ts files are part of the typecheck (tsconfig includes
// **/*.ts), so reference the Jest ambient types globally here.
/// <reference types="jest" />
