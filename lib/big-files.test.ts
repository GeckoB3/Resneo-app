/**
 * Big files cannot grow (codebase standards plan P1.6, matching the web app's
 * `src/lib/testing/big-files.test.ts`).
 *
 * Every non-test source file over 1,500 lines is listed in
 * `big-files-baseline.json` with its length. This test fails when:
 *  - a listed file grows by more than 50 lines over its recorded length;
 *  - a file not on the list goes over 1,500 lines;
 *  - a listed file is gone or now under 1,500 lines (take it off the list).
 *
 * When you shrink a big file, lower its number:
 *   UPDATE_BIG_FILES=1 npx jest lib/big-files.test.ts
 * The update only ever lowers numbers and removes entries, never raises one.
 */
// The project has no `@types/node` (it is an Expo app); see sheet-scroll-contract.test.ts.
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readdirSync, readFileSync, statSync, writeFileSync } = require('fs') as {
  readdirSync: (p: string) => string[];
  readFileSync: (p: string, e: string) => string;
  statSync: (p: string) => { isDirectory: () => boolean };
  writeFileSync: (p: string, data: string) => void;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join, relative, sep } = require('path') as {
  join: (...p: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
};

const LIMIT = 1500;
const ALLOWED_GROWTH = 50;
const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'providers', 'modules', 'theme', 'types'];
const BASELINE_PATH = join(__dirname, 'big-files-baseline.json');

function isSource(path: string): boolean {
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(path)) return false;
  if (/\.d\.ts$/.test(path)) return false;
  if (/\.(test|spec)\.[a-z]+$/.test(path)) return false;
  if (path.includes(`${sep}__tests__${sep}`) || path.includes(`${sep}__snapshots__${sep}`)) return false;
  return true;
}

function lineCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (isSource(path)) {
        const lines = readFileSync(path, 'utf8').split('\n').length;
        if (lines > LIMIT) out[relative(ROOT, path).split(sep).join('/')] = lines;
      }
    }
  };
  for (const dir of DIRS) walk(join(ROOT, dir));
  return out;
}

describe('big files cannot grow (P1.6)', () => {
  it('no big file grows, and no new one appears', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>;
    const actual = lineCounts();

    if (process.env.UPDATE_BIG_FILES === '1') {
      const lowered: Record<string, number> = {};
      for (const [file, recorded] of Object.entries(baseline)) {
        if (actual[file] !== undefined) lowered[file] = Math.min(recorded, actual[file]);
      }
      writeFileSync(BASELINE_PATH, `${JSON.stringify(lowered, null, 2)}\n`);
      return;
    }

    const problems: string[] = [];
    for (const [file, lines] of Object.entries(actual)) {
      const recorded = baseline[file];
      if (recorded === undefined) {
        problems.push(`${file} is ${lines} lines, over the ${LIMIT}-line limit. Split it before it grows further.`);
      } else if (lines > recorded + ALLOWED_GROWTH) {
        problems.push(`${file} grew from ${recorded} to ${lines} lines. Move code out instead of adding to it.`);
      }
    }
    for (const file of Object.keys(baseline)) {
      if (actual[file] === undefined) {
        problems.push(`${file} is gone or under ${LIMIT} lines. Run with UPDATE_BIG_FILES=1 to take it off the list.`);
      }
    }
    expect(problems).toEqual([]);
  });
});
