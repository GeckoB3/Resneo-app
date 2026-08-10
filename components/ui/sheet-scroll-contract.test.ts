/**
 * A `Sheet` whose body is content-sized cannot scroll AND pushes its pinned
 * action row off the bottom — the form can be read but neither finished nor
 * scrolled. The fix is always the same: `fill` on the Sheet, `flex: 1` on the
 * ScrollView.
 *
 * This has now shipped SIX times — the Event, Resource and ClassType editors,
 * then ModifyBookingSheet (9b52e15), then GuestEditSheet, then five more found
 * by sweeping. Each one reached a user before it was caught, because it only
 * misbehaves once the content outgrows the sheet, which depends on the data.
 *
 * So it is checked statically rather than left to the next bug report. The
 * fingerprint is narrow on purpose: a `flexGrow: 0` style, applied to a
 * ScrollView, in a file that renders a Sheet. Styles named for other things
 * (`chipRow`, `archiveBtn`) legitimately use `flexGrow: 0` and must not trip it.
 */
// The project has no `@types/node` (it's an Expo app), so the few Node APIs
// this static check needs are pulled in with local shapes rather than adding a
// dependency and widening every other file's global types.
declare const __dirname: string;
declare function require(id: string): unknown;

const { readdirSync, readFileSync, statSync } = require('fs') as {
  readdirSync: (dir: string) => string[];
  readFileSync: (file: string, encoding: string) => string;
  statSync: (p: string) => { isDirectory: () => boolean };
};
const { join, relative, resolve } = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
  resolve: (...parts: string[]) => string;
};

const ROOT = resolve(__dirname, '..', '..');
const SCAN_DIRS = ['components', 'app'];
const SKIP_DIRS = new Set(['node_modules', '_reference', '.expo', 'dist', 'build']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.tsx') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Style keys declared with `flexGrow: 0` that are then handed to a ScrollView's
 * `style` prop. Returns the offending keys, empty when the file is clean.
 */
export function findFrozenScrollStyles(source: string): string[] {
  if (!source.includes('<Sheet')) return [];

  const frozen = new Set<string>();
  const styleBlock = /(\w+):\s*\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = styleBlock.exec(source)) !== null) {
    if (/flexGrow:\s*0\b/.test(match[2])) frozen.add(match[1]);
  }
  if (frozen.size === 0) return [];

  // Only flag the ones actually applied to a ScrollView's `style`. A HORIZONTAL
  // ScrollView is exempt: `flexGrow: 0` on a sideways chip row is what stops it
  // stretching down the form, which is correct.
  const applied = new Set<string>();
  const scrollView = /<ScrollView\b[\s\S]{0,400}?>/g;
  while ((match = scrollView.exec(source)) !== null) {
    const tag = match[0];
    if (/\bhorizontal\b(?!=\{false\})/.test(tag)) continue;
    const styleProp = /\bstyle=\{([^}]*)\}/.exec(tag);
    if (!styleProp) continue;
    for (const key of frozen) {
      if (new RegExp(`styles\\.${key}\\b`).test(styleProp[1])) applied.add(key);
    }
  }
  return [...applied];
}

describe('Sheet scroll contract', () => {
  it('detects the pattern it is meant to catch', () => {
    // Guards the guard: if this stops matching, the sweep below silently passes.
    const bad = `
      <Sheet visible={open} onClose={onClose} maxHeight="92%">
        <View style={styles.body}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            <Text>x</Text>
          </ScrollView>
        </View>
      </Sheet>
      const styles = StyleSheet.create({
        body: { gap: spacing.md },
        scroll: { flexGrow: 0 },
      });
    `;
    expect(findFrozenScrollStyles(bad)).toEqual(['scroll']);
  });

  it('exempts a horizontal ScrollView, where flexGrow: 0 is the right call', () => {
    // A sideways chip row must not stretch down the form (ComplianceCaptureSheet).
    const chips = `
      <Sheet visible fill>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} />
      </Sheet>
      const styles = StyleSheet.create({ chipRow: { flexGrow: 0 } });
    `;
    expect(findFrozenScrollStyles(chips)).toEqual([]);
  });

  it('ignores flexGrow: 0 on styles that are not the scroll body', () => {
    const fine = `
      <Sheet visible fill><ScrollView style={styles.scroll} /></Sheet>
      const styles = StyleSheet.create({
        scroll: { flex: 1 },
        chipRow: { flexGrow: 0 },
        archiveBtn: { flexGrow: 0 },
      });
    `;
    expect(findFrozenScrollStyles(fine)).toEqual([]);
  });

  it('no sheet in the app freezes its ScrollView', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const keys = findFrozenScrollStyles(readFileSync(file, 'utf8'));
        if (keys.length) {
          offenders.push(`${relative(ROOT, file).replace(/\\/g, '/')} → ${keys.join(', ')}`);
        }
      }
    }
    // A ScrollView in a Sheet must flex, and the Sheet must be `fill`, or the
    // body sizes to its content: no scrolling, and the pinned actions fall off.
    expect(offenders).toEqual([]);
  });
});
