import { formatPence } from '@/lib/format';
import { formatGuestDisplayName } from '@/lib/guests/name';
import { vchT, type VouchersCopyId } from '@/lib/pos/settings-more/vouchers-copy';
import type { VoucherSettings } from '@/lib/pos/settings-more/types';
import type { GuestListItem } from '@/types/guest-list';

/**
 * The rules behind Settings, Gift vouchers, pure so each is tested on its own. They follow the
 * web's GiftVouchersCard.tsx (what a save sends) and VoucherImportDialog.tsx (the column guesses,
 * the template, the new codes file). The server checks everything again.
 */

export const MAX_PRESETS = 5;
export const TERMS_MAX = 2000;
/** The import's file cap (web `MAX_BYTES`, the server's `csv` limit). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type VoucherEditable = Pick<
  VoucherSettings,
  'preset_pence' | 'custom_allowed' | 'min_pence' | 'max_pence' | 'expiry_months' | 'terms' | 'online_sale_enabled' | 'accent_colour'
>;

/** A draft's values: an emptied money field is null, an emptied months field is NaN (as the web). */
export type VoucherDraft = Omit<VoucherEditable, 'min_pence' | 'max_pence'> & {
  min_pence: number | null;
  max_pence: number | null;
};

export const VOUCHER_KEYS: (keyof VoucherDraft)[] = [
  'preset_pence',
  'custom_allowed',
  'min_pence',
  'max_pence',
  'expiry_months',
  'terms',
  'online_sale_enabled',
  'accent_colour',
];

/** Same JSON, except that NaN (an emptied months field) never equals a saved value. */
export function sameVoucherValue(a: unknown, b: unknown): boolean {
  const nan = (v: unknown) => typeof v === 'number' && Number.isNaN(v);
  if (nan(a) || nan(b)) return nan(a) && nan(b);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * What a save sends (web `voucherSettingsPatch`): only what changed, or every field before the
 * venue is set up, so the first save creates the row with the defaults the person saw.
 */
export function voucherSettingsPatch(source: VoucherSettings, edits: Partial<VoucherDraft>): Partial<VoucherDraft> {
  const all: Partial<VoucherDraft> = source.set_up ? edits : { ...pickDraft(source), ...edits };
  const out: Partial<VoucherDraft> = {};
  for (const k of VOUCHER_KEYS) {
    if (!(k in all)) continue;
    if (!source.set_up || !sameVoucherValue(all[k], source[k])) (out as Record<string, unknown>)[k] = all[k];
  }
  return out;
}

export function pickDraft(source: VoucherSettings): VoucherDraft {
  return {
    preset_pence: source.preset_pence,
    custom_allowed: source.custom_allowed,
    min_pence: source.min_pence,
    max_pence: source.max_pence,
    expiry_months: source.expiry_months,
    terms: source.terms,
    online_sale_enabled: source.online_sale_enabled,
    accent_colour: source.accent_colour,
  };
}

/** The amount to add to the presets, or null when it can't be added (web `addPreset`). */
export function presetsWith(presets: number[], pence: number | null): number[] | null {
  if (pence == null || !Number.isFinite(pence) || pence <= 0) return null;
  if (presets.includes(pence) || presets.length >= MAX_PRESETS) return null;
  return [...presets, pence].sort((a, b) => a - b);
}

/** Online sale needs terms and card payments (`set.vch.online.needs`). */
export function canSellOnline(terms: string | null | undefined, cardPaymentsReady: boolean): boolean {
  return Boolean(terms?.trim()) && cardPaymentsReady;
}

/** Money with pence, as the web's `formatMoneyExact` ("£25.00"). */
export function moneyExact(pence: number): string {
  return formatPence(pence) ?? `£${(pence / 100).toFixed(2)}`;
}

/** Money as the web's `formatMoney`: whole amounts without pence ("£25"), else "£25.50". */
export function moneyShort(pence: number): string {
  const text = moneyExact(pence);
  return pence % 100 === 0 ? text.replace(/[.,]00(?!\d)/, '') : text;
}

// ─── Accent colour ──────────────────────────────────────────────────────────

/** The web's colour picker opens on the brand navy when no colour is chosen. */
export const DEFAULT_ACCENT = '#003B6F';

/** A few colours to tap (the web has a full colour picker; the app offers these and a code field). */
export const ACCENT_SWATCHES = ['#003B6F', '#00C2C7', '#0F766E', '#4F46E5', '#7C3AED', '#BE185D', '#B45309', '#1F2937'] as const;

/** A typed colour as the server takes it (`#RRGGBB`, upper case), or null when it isn't one. */
export function normaliseHex(text: string): string | null {
  const raw = text.trim().toUpperCase();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9A-F]{6}$/.test(withHash) ? withHash : null;
}

// ─── Linking a client ───────────────────────────────────────────────────────

/** The web's `guestSearchResultLabel`. */
export function guestRowLabel(row: Pick<GuestListItem, 'first_name' | 'last_name' | 'identifiability_tier'>): string {
  if (row.identifiability_tier === 'anonymous') return vchT('web.guest.anonymous');
  return formatGuestDisplayName(row.first_name, row.last_name);
}

/** The web's `guestSearchResultSubtitle`. */
export function guestRowSubtitle(row: Pick<GuestListItem, 'email' | 'phone'>): string {
  const email = row.email?.trim();
  const phone = row.phone?.trim();
  if (email && phone) return `${email} · ${phone}`;
  return email || phone || vchT('web.guest.noContact');
}

// ─── Importing from a CSV ───────────────────────────────────────────────────

export type ImportColumnKey = 'code' | 'balance' | 'expiry' | 'holder_name' | 'holder_email' | 'note';

/** The columns to match, with the web's guesses (`COLUMNS`). */
export const IMPORT_COLUMNS: { key: ImportColumnKey; labelId: VouchersCopyId; required?: boolean; guess: RegExp }[] = [
  { key: 'code', labelId: 'web.imp.col.code', guess: /code|number|voucher/i },
  { key: 'balance', labelId: 'web.imp.col.balance', required: true, guess: /amount|balance|left|value/i },
  { key: 'expiry', labelId: 'web.imp.col.expiry', guess: /expir|use by|valid|until/i },
  { key: 'holder_name', labelId: 'web.imp.col.holder_name', guess: /name|holder/i },
  { key: 'holder_email', labelId: 'web.imp.col.holder_email', guess: /e-?mail/i },
  { key: 'note', labelId: 'web.imp.col.note', guess: /note|comment/i },
];

/** First guesses for each column from the file's headers; each header used once (web `guessColumns`). */
export function guessColumns(headers: string[]): Partial<Record<ImportColumnKey, string>> {
  const out: Partial<Record<ImportColumnKey, string>> = {};
  const used = new Set<string>();
  // Email before name, so "Holder's email" is not taken as the name.
  for (const key of ['holder_email', 'balance', 'expiry', 'code', 'holder_name', 'note'] as ImportColumnKey[]) {
    const col = IMPORT_COLUMNS.find((c) => c.key === key)!;
    const hit = headers.find((h) => !used.has(h) && col.guess.test(h));
    if (hit) {
      out[key] = hit;
      used.add(hit);
    }
  }
  return out;
}

/** The byte order mark a spreadsheet may put first. */
const BOM = /^\uFEFF/;

const DELIMITERS = [',', '\t', ';', '|'] as const;

/**
 * The first record of a CSV, split into its cells and trimmed, empty cells dropped (what the web
 * reads with `Papa.parse(text, { preview: 1 })`). Quote aware: a quoted cell may hold the
 * delimiter, a doubled quote, or a line break. The delimiter is the most common of comma, tab,
 * semicolon and bar outside quotes on the first line, as Papa guesses it; the server parses the
 * whole file again itself.
 */
export function readCsvHeaders(text: string): string[] {
  // Blank lines before the header are skipped, as `skipEmptyLines` does.
  const src = text.replace(BOM, '').replace(/^[\r\n]+/, '');
  const delimiter = guessDelimiter(src);
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  for (; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      break;
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim()).filter(Boolean);
}

function guessDelimiter(src: string): string {
  let best: string = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const ch of src) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && (ch === '\n' || ch === '\r')) break;
      else if (!quoted && ch === d) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** The web's template file (`TEMPLATE`): the column names, then one example row. */
export function importTemplateCsv(): string {
  const header = IMPORT_COLUMNS.map((c) => {
    const label = vchT(c.labelId);
    return label.includes("'") ? `"${label}"` : label;
  }).join(',');
  return `${header}\r\nAB12CD34,25.00,31/12/2026,Sam Smith,sam@example.com,Paper voucher 101\r\n`;
}

/** The new codes file (web `takeCodes`): row, code and its last four. */
export function newCodesCsv(codes: { row: number; code: string; last4: string }[]): string {
  const lines = ['Row,Code,Ending', ...codes.map((c) => `${c.row},${c.code},${c.last4}`)];
  return `${lines.join('\r\n')}\r\n`;
}

/** The import body (web `body`): only the matched columns. */
export function importBody(
  csv: string,
  columns: Partial<Record<ImportColumnKey, string>>,
  dryRun: boolean,
  newCodes: boolean,
): { csv: string; dry_run: boolean; new_codes: boolean; columns: Record<string, string> } {
  return {
    csv,
    dry_run: dryRun,
    new_codes: newCodes,
    columns: Object.fromEntries(Object.entries(columns).filter(([, v]) => Boolean(v))) as Record<string, string>,
  };
}

export interface ImportRow {
  row: number;
  status: 'new' | 'exists' | 'error';
  problem: string | null;
  balance_pence: number;
}

export interface ImportResult {
  dry_run: boolean;
  rows: ImportRow[];
  summary: { count: number; amount_pence: number; exists: number; problems: number };
  codes: { row: number; code: string; last4: string }[];
}

export interface AddedVoucher {
  voucher: { id: string; code_last4: string | null; balance_pence: number };
  code: string | null;
  replayed?: boolean;
}
