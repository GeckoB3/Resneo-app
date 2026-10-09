import { useCallback, useMemo, useState } from 'react';

import type { SaveResult } from '@/lib/queries/useCheckoutSettings';
import type { PosCheckoutSettings, PosFieldError, PosSettingsKey } from '@/types/pos-settings';

/**
 * One section's draft over some settings keys (web: `useSectionForm` in
 * `CheckoutSettingsContext.tsx`). It follows the loaded settings until edited, keeps only the
 * fields the person changed, saves only what differs from the loaded values, and keeps the edits
 * through a stale save so the fresh values show in every field they did not touch.
 */

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function pickKeys<K extends PosSettingsKey>(settings: PosCheckoutSettings, keys: readonly K[]): Pick<PosCheckoutSettings, K> {
  const out = {} as Pick<PosCheckoutSettings, K>;
  for (const k of keys) out[k] = settings[k];
  return out;
}

/** Only the edited keys whose value differs from the loaded one: what a save sends. */
export function changedKeys<K extends PosSettingsKey>(
  edits: Partial<Pick<PosCheckoutSettings, K>>,
  source: Pick<PosCheckoutSettings, K>,
  keys: readonly K[],
): Partial<PosCheckoutSettings> {
  const out: Partial<PosCheckoutSettings> = {};
  for (const k of keys) {
    if (k in edits && !same(edits[k], source[k])) (out as Record<string, unknown>)[k] = edits[k];
  }
  return out;
}

/** The first field error for a path or anything under it (`business_address` covers `business_address.town`). */
export function fieldErrorFor(fields: PosFieldError[], path: string): string | null {
  return fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message ?? null;
}

export interface SectionForm<K extends PosSettingsKey> {
  value: Pick<PosCheckoutSettings, K>;
  set: <F extends K>(field: F, v: PosCheckoutSettings[F]) => void;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  stale: boolean;
  fieldError: (path: string) => string | null;
  submit: () => Promise<boolean>;
  discard: () => void;
}

export function useSectionForm<K extends PosSettingsKey>(
  settings: PosCheckoutSettings,
  keys: readonly K[],
  save: (partial: Partial<PosCheckoutSettings>) => Promise<SaveResult>,
): SectionForm<K> {
  const source = useMemo(() => pickKeys(settings, keys), [settings, keys]);
  const [edits, setEdits] = useState<Partial<Pick<PosCheckoutSettings, K>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fields, setFields] = useState<PosFieldError[]>([]);
  const value = useMemo(() => ({ ...source, ...edits }), [source, edits]);
  const changes = useMemo(() => changedKeys(edits, source, keys), [edits, source, keys]);
  const dirty = Object.keys(changes).length > 0;

  const set = useCallback(<F extends K>(field: F, v: PosCheckoutSettings[F]) => {
    setEdits((prev) => ({ ...prev, [field]: v }));
    setFields((prev) => prev.filter((f) => f.path !== field && !f.path.startsWith(`${String(field)}.`)));
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (saving) return false;
    if (Object.keys(changes).length === 0) {
      setEdits({});
      return true;
    }
    setSaving(true);
    setError(null);
    setStale(false);
    const result = await save(changes);
    setSaving(false);
    if (result.ok) {
      setEdits({});
      setFields([]);
      return true;
    }
    setError(result.message);
    if (result.stale) setStale(true);
    else setFields(result.fields);
    return false;
  }, [changes, save, saving]);

  const discard = useCallback(() => {
    setEdits({});
    setError(null);
    setStale(false);
    setFields([]);
  }, []);

  const fieldError = useCallback((path: string) => fieldErrorFor(fields, path), [fields]);

  return { value, set, dirty, saving, error, stale, fieldError, submit, discard };
}

/** Pence as the text a money field shows: 1250 to "12.50". */
export function penceToText(pence: number | null | undefined): string {
  if (pence == null || !Number.isFinite(pence)) return '';
  return (pence / 100).toFixed(2);
}

/** "12.5", "12.50" or "£12" to 1250; null when it is not an amount. */
export function textToPence(text: string): number | null {
  const cleaned = text.replace(/[^\d.]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** A whole number typed in a field, NaN when it is not one (the server's sentence then explains). */
export function textToInt(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

/** The currency's symbol for a money field's prefix. */
export function currencySymbol(currency: string | null | undefined): string {
  const code = (currency ?? 'GBP').toUpperCase();
  if (code === 'GBP') return '£';
  if (code === 'EUR') return '€';
  if (code === 'USD') return '$';
  return code;
}

/** Pence as money in the venue's currency: 1250 to "£12.50". */
export function formatMoney(pence: number, currency: string | null | undefined): string {
  const code = (currency ?? 'GBP').toUpperCase();
  try {
    return new Intl.NumberFormat(code === 'EUR' ? 'en-IE' : 'en-GB', { style: 'currency', currency: code }).format(pence / 100);
  } catch {
    return `${currencySymbol(code)}${(pence / 100).toFixed(2)}`;
  }
}
