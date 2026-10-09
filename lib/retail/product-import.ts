import { gs1CheckDigit } from '@/lib/retail/barcode';

/**
 * Importing products from a CSV in the app (UX spec §6.5), following the web's
 * `src/components/retail/products/import-fields.ts` and `ProductImport.tsx`: the fields a venue
 * matches, first guesses from the file's headers, the template, and reading the header row. The
 * file itself goes to `POST /api/venue/retail/import` as text, as the web sends it, and the server
 * reads every row.
 */

export const IMPORT_FIELDS = [
  'name',
  'brand',
  'category',
  'option_name',
  'sku',
  'barcode',
  'price',
  'cost',
  'supplier',
  'stock_on_hand',
  'reorder_level',
  'description',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: 'Name',
  brand: 'Brand',
  category: 'Category',
  option_name: 'Option',
  sku: 'SKU',
  barcode: 'Barcode',
  price: 'Price',
  cost: 'Cost',
  supplier: 'Supplier',
  stock_on_hand: 'Stock on hand',
  reorder_level: 'Reorder level',
  description: 'Description',
};

export const IMPORT_STOCK_ONLY: readonly ImportField[] = ['stock_on_hand', 'reorder_level'];
export const IMPORT_REQUIRED: readonly ImportField[] = ['name', 'price'];

/** Up to 5 MB, as the web reads it in the browser. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** The fields a venue matches: the stock ones only with Track stock on (§9.16). */
export function importFields(trackStock: boolean): ImportField[] {
  return IMPORT_FIELDS.filter((f) => trackStock || !IMPORT_STOCK_ONLY.includes(f));
}

const GUESS: Partial<Record<ImportField, RegExp>> = {
  name: /^(product )?name$|^product$|^item$/i,
  brand: /brand|manufacturer/i,
  category: /categor/i,
  option_name: /^option|variant|size|shade/i,
  sku: /sku|stock code|product code/i,
  barcode: /barcode|ean|upc|gtin/i,
  price: /^(retail |selling |sale )?price$|^rrp$/i,
  cost: /cost|supply price|wholesale/i,
  supplier: /supplier|vendor/i,
  stock_on_hand: /on hand|stock$|^stock|quantity|qty/i,
  reorder_level: /reorder|min(imum)? stock/i,
  description: /descr/i,
};

/** First guesses for each field from the file's headers: the label itself, then a likely name. */
export function guessImportColumns(headers: string[], trackStock: boolean): Partial<Record<ImportField, string>> {
  const out: Partial<Record<ImportField, string>> = {};
  const used = new Set<string>();
  const fields = importFields(trackStock);
  for (const f of fields) {
    const hit = headers.find((h) => !used.has(h) && h.trim().toLowerCase() === IMPORT_FIELD_LABELS[f].toLowerCase());
    if (hit) {
      out[f] = hit;
      used.add(hit);
    }
  }
  for (const f of fields) {
    if (out[f]) continue;
    const re = GUESS[f];
    const hit = re ? headers.find((h) => !used.has(h) && re.test(h.trim())) : undefined;
    if (hit) {
      out[f] = hit;
      used.add(hit);
    }
  }
  return out;
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The template: a header row of the field labels and one example row. */
export function importTemplateCsv(trackStock: boolean): string {
  const body = '501234567890';
  const example: Record<ImportField, string> = {
    name: 'Argan oil shampoo',
    brand: 'Example Brand',
    category: 'Shampoo',
    option_name: '250 ml',
    sku: 'ARG-250',
    barcode: `${body}${gs1CheckDigit(body)}`,
    price: '14.50',
    cost: '6.20',
    supplier: 'Example Supplies Ltd',
    stock_on_hand: '12',
    reorder_level: '3',
    description: 'A gentle daily shampoo for dry hair.',
  };
  const fields = importFields(trackStock);
  const head = fields.map((f) => csvCell(IMPORT_FIELD_LABELS[f])).join(',');
  const row = fields.map((f) => csvCell(example[f])).join(',');
  return `${head}\r\n${row}\r\n`;
}

/** The records of a CSV (RFC 4180 quoting; CRLF, LF or CR line ends). */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const s = text.replace(/^﻿/, '');
  while (i < s.length) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r' || c === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Rows with nothing in them are skipped, as the web's reader skips them.
  return records.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** The header row (trimmed, blanks dropped) and how many data rows follow. */
export function readCsvHeaders(text: string): { headers: string[]; rows: number } {
  const data = parseCsvRecords(text);
  const headers = (data[0] ?? []).map((h) => h.trim()).filter(Boolean);
  return { headers, rows: Math.max(0, data.length - 1) };
}

/** A picked file is a CSV by its name or its type (the web's test). */
export function looksLikeCsv(name: string | null | undefined, mimeType: string | null | undefined): boolean {
  return /\.csv$/i.test(name ?? '') || mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel' || mimeType === 'text/comma-separated-values';
}

export interface ImportRow {
  row: number;
  status: 'new' | 'exists' | 'error';
  problem: string | null;
  name: string;
  option_name: string | null;
  sku: string | null;
}

export interface ImportResult {
  rows: ImportRow[];
  summary: { new: number; skipped: number; problems: number };
  imported: number;
  dry_run: boolean;
}

/** The import body: only matched fields the venue can import. */
export function importBody(
  csv: string,
  columns: Partial<Record<ImportField, string>>,
  trackStock: boolean,
  dryRun: boolean,
): { csv: string; dry_run: boolean; columns: Record<string, string> } {
  const fields = importFields(trackStock);
  const picked: Record<string, string> = {};
  for (const [f, v] of Object.entries(columns)) {
    if (v && fields.includes(f as ImportField)) picked[f] = v;
  }
  return { csv, dry_run: dryRun, columns: picked };
}

/** Rows the check passed that the save then refused: shown after the import so none go quietly. */
export function rowsNotSaved(checked: ImportResult | null, result: ImportResult | null): ImportRow[] {
  const checkedNew = new Set((checked?.rows ?? []).filter((r) => r.status === 'new').map((r) => r.row));
  return (result?.rows ?? []).filter((r) => r.status === 'error' && checkedNew.has(r.row));
}
