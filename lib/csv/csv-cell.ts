/**
 * CSV cells that are safe to open in a spreadsheet. Port of the web's
 * `src/lib/csv/csv-cell.ts` (QA A-6 / D-11, 2026-09-23); every CSV the app
 * writes goes through here.
 *
 * Excel, Numbers and Google Sheets run a cell that starts with = + - @ (or a
 * tab or carriage return) as a formula, and quoting the cell does not stop
 * them. Guest names, notes and form answers reach these files from the public
 * booking pages, so a guest who books as `=HYPERLINK(...)` became a live formula
 * in the owner's export. Such a cell is written with a leading apostrophe, which
 * makes the spreadsheet treat it as text. Plain numbers and money amounts (-5,
 * +447700900123, -£12.50, 12.5%) are left alone: they cannot carry a formula and
 * must stay numbers.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?[£$€]?\d[\d,]*(\.\d+)?%?$/;

/** Byte-order mark: without it Excel reads a UTF-8 file as Windows-1252 and garbles £ and accents. */
export const CSV_BOM = String.fromCharCode(0xfeff);

export function neutraliseCsvFormula(text: string): string {
  return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return neutraliseCsvFormula(String(value));
}

/** A cell that is always quoted, as every CSV the app writes has always quoted its cells. */
export function csvCellQuoted(value: unknown): string {
  return `"${cellText(value).replace(/"/g, '""')}"`;
}

/** Prefix the byte-order mark unless the text already carries one (a server-built file may). */
export function withCsvBom(text: string): string {
  return text.startsWith(CSV_BOM) ? text : `${CSV_BOM}${text}`;
}
