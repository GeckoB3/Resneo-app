/**
 * Every request to the API carries the chosen site (web roles plan §6.2c), so no request may reach
 * the API except through the client in `lib/api/client.ts`: `apiFetch`, `apiRawFetch` (uploads,
 * CSV text, the Ask ResNeo stream), or a file download whose headers pass `withApiSiteHeader`.
 *
 * This test reads the app's source and fails on a raw network call anywhere else. A raw call that
 * never reaches the API (reading a file the person picked, a signed storage URL) is allowed by name
 * below, with the reason. A file that downloads API files straight to disk is allowed only while it
 * still adds the site header itself.
 */
// The Node built-ins this static check needs, with local shapes rather than widening every other
// file's global types (as `components/ui/sheet-scroll-contract.test.ts` does).
declare const __dirname: string;
declare function require(id: string): unknown;
const fs = require('fs') as {
  existsSync: (p: string) => boolean;
  readdirSync: (dir: string, options: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[];
  readFileSync: (file: string, encoding: string) => string;
};
const path = require('path') as {
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
  posix: { join: (...parts: string[]) => string };
};

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'providers', 'modules', 'hooks'];

/** The client itself. */
const CLIENT = 'lib/api/client.ts';

/** Raw calls that never reach the API, with why. */
const NOT_THE_API: Record<string, string> = {
  'components/reports/vouchers/VoucherImportSheet.tsx': 'reads the file the person picked (a local uri)',
  'lib/retail/read-picked-file.ts': 'reads the file the person picked (a local uri)',
  'lib/queries/useGuestDocuments.ts': 'uploads to the signed storage URL the API hands back, not to the API',
};

/** Download helpers that reach the API and must add the site header themselves. */
const ADDS_SITE_HEADER = ['lib/share/share-binary-file.ts', 'lib/reports/pos-report-download.ts'];

/**
 * A raw network call: `fetch(` not part of another name (`apiFetch(`, `refetch(`, `.fetch(` on a
 * query), the `expo/fetch` alias, the file system's own downloads and uploads, and XHR.
 */
const RAW_CALL = /(?<![\w.$])fetch\s*\(|streamingFetch\s*\(|\.downloadAsync\s*\(|createDownloadResumable\s*\(|createUploadTask\s*\(|\.uploadAsync\s*\(|new\s+XMLHttpRequest\b/;

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
  return out;
}

/** The source with comments removed, so a sentence about `fetch()` is not a call. */
function code(file: string): string {
  return fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('requests to the API go through the client (X-ResNeo-Venue on every one)', () => {
  const files = SOURCE_DIRS.flatMap(sourceFiles);

  it('finds the app source', () => {
    expect(files).toContain(CLIENT);
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no raw network call outside the client and the files allowed by name', () => {
    const offenders = files.filter(
      (file) => file !== CLIENT && !(file in NOT_THE_API) && !ADDS_SITE_HEADER.includes(file) && RAW_CALL.test(code(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the site header on the download helpers that reach the API', () => {
    for (const file of ADDS_SITE_HEADER) {
      expect(`${file}: ${code(file).includes('withApiSiteHeader(')}`).toBe(`${file}: true`);
    }
  });

  it('keeps the allowed files honest: none of them builds an API URL', () => {
    for (const file of Object.keys(NOT_THE_API)) {
      const source = code(file);
      expect(`${file}: ${/getApiUrl\(|apiUrl\(/.test(source)}`).toBe(`${file}: false`);
    }
  });
});
