// The app's tsconfig has no Node types; the same pattern as sheet-scroll-contract.test.ts.
declare const __dirname: string;
declare function require(id: string): unknown;
const { readFileSync } = require('fs') as { readFileSync: (file: string, encoding: string) => string };
const { join } = require('path') as { join: (...parts: string[]) => string };

import { CSV_BOM, csvCellQuoted, neutraliseCsvFormula, withCsvBom } from '@/lib/csv/csv-cell';

/** QA A-6 / D-11 (web, 2026-09-23): exports turned guest-supplied text into live spreadsheet formulas. */
describe('neutraliseCsvFormula', () => {
  it.each(['=1+2', '=HYPERLINK("http://x","Click")', '+cmd|/C calc!A0', '-2+3+cmd|x!A0', '@SUM(A1)', '\tx', '\rx'])(
    'makes %j text',
    (value) => {
      expect(neutraliseCsvFormula(value)).toBe(`'${value}`);
    },
  );

  it.each(['-5', '+447700900123', '-£12.50', '12.5%', '1,250.00', '-€3', 'Siobhán', 'QA-D Formula', ''])(
    'leaves %j alone',
    (value) => {
      expect(neutraliseCsvFormula(value)).toBe(value);
    },
  );
});

describe('csvCellQuoted', () => {
  it('always quotes and still neutralises', () => {
    expect(csvCellQuoted('plain')).toBe('"plain"');
    expect(csvCellQuoted('=1+2')).toBe(`"'=1+2"`);
    expect(csvCellQuoted('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCellQuoted('-£4.00')).toBe('"-£4.00"');
    expect(csvCellQuoted(null)).toBe('""');
    expect(csvCellQuoted(-5)).toBe('"-5"');
  });
});

describe('withCsvBom', () => {
  it('adds the mark once', () => {
    expect(withCsvBom('a,b')).toBe(`${CSV_BOM}a,b`);
    expect(withCsvBom(`${CSV_BOM}a,b`)).toBe(`${CSV_BOM}a,b`);
  });
});

/**
 * Bypass guard: every CSV writer uses the shared cell, so a new escaper cannot
 * quietly skip the formula rule again. If you add a CSV writer, route it
 * through csv-cell and list it here.
 */
describe('every CSV writer uses the shared cell', () => {
  const WRITERS = ['lib/reports/csv-export.ts', 'app/(app)/(tabs)/clients.tsx'];
  it.each(WRITERS)('%s', (file) => {
    const source = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    expect(source).toContain('csvCellQuoted');
    expect(source).not.toMatch(/replace\(\/"\/g, '""'\)/);
  });
});
