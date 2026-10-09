import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { posFetch, type PosMethod } from '@/lib/pos/api';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { settingsKeys } from '@/lib/queries/useCheckoutSettings';
import { usePosGate } from '@/lib/queries/usePos';

import { fieldErrorFor, fieldErrorsFrom, isStaleWrite, sameValue, settingsErrorMessage, settingsMorePaths } from './api';
import { SM_COPY } from './copy';
import type { FieldError, PosCheckoutSettings, PosSettingsResponse } from './types';

/**
 * Loads and saves for the second half of Checkout settings. Every query is behind the POS gate
 * (`usePosGate`), so a venue without Checkout never calls a POS route. Each screen loads what it
 * needs itself, so it works when opened straight from a link.
 */

export const settingsMoreKeys = {
  root: () => [...queryKeys.pos.all(), 'settings-more'] as const,
  // The same cache entry as the first half of Checkout settings (lib/queries/useCheckoutSettings.ts),
  // so a save on any settings screen is seen by every other one. (Tills stay apart: that half caches
  // the bare list; the card readers screen refetches its own on every open.)
  settings: (t: string | null) => settingsKeys.settings(t),
  readers: (t: string | null) => [...settingsMoreKeys.root(), 'readers', keyScope(t)] as const,
  tills: (t: string | null) => [...settingsMoreKeys.root(), 'tills', keyScope(t)] as const,
  vouchers: (t: string | null) => [...settingsMoreKeys.root(), 'voucher-settings', keyScope(t)] as const,
  loyalty: (t: string | null) => [...settingsMoreKeys.root(), 'loyalty', keyScope(t)] as const,
  commission: (t: string | null) => [...settingsMoreKeys.root(), 'commission', keyScope(t)] as const,
  shop: (t: string | null) => [...settingsMoreKeys.root(), 'shop', keyScope(t)] as const,
};

/** One GET for a settings screen: no retry on a refusal, read fresh each time the screen opens. */
export function useSettingsQuery<T>(
  key: (accessToken: string | null) => QueryKey,
  path: string,
  options: { enabled?: boolean } = {},
) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: key(accessToken),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: () => posFetch<T>(path, { accessToken: accessToken! }),
  });
}

/** A write from a settings screen: the token comes from the POS gate. */
export function useSettingsSend() {
  const { accessToken } = usePosGate();
  return useCallback(
    <T>(path: string, method: PosMethod, body?: unknown): Promise<T> => {
      if (!accessToken) return Promise.reject(new Error(SM_COPY['common.networkError']));
      return posFetch<T>(path, { accessToken, method, ...(body !== undefined ? { body } : {}) });
    },
    [accessToken],
  );
}

/** `GET /api/venue/pos/settings`: the settings row, who may change it, and the venue. */
export function usePosSettings(options: { enabled?: boolean } = {}) {
  return useSettingsQuery<PosSettingsResponse>(settingsMoreKeys.settings, settingsMorePaths.settings, options);
}

export type SaveResult =
  | { ok: true; data: PosSettingsResponse }
  | { ok: false; stale: true; message: string }
  | { ok: false; stale?: false; message: string; fields: FieldError[] };

/**
 * Saves a part of the POS settings at the loaded version (web `CheckoutSettingsContext.save`). A
 * 412 reloads the fresh settings and says so (`err.POS_SETTINGS_STALE`); any other refusal is the
 * server's sentence, with the fields it named. The till's bootstrap is read again after a save, as
 * the switches here change what the till shows.
 */
export function usePosSettingsSave() {
  const { accessToken } = usePosGate();
  const queryClient = useQueryClient();
  const send = useSettingsSend();
  return useCallback(
    async (partial: Partial<PosCheckoutSettings>): Promise<SaveResult> => {
      const key = settingsMoreKeys.settings(accessToken);
      const current = queryClient.getQueryData<PosSettingsResponse>(key);
      if (!current) return { ok: false, message: SM_COPY['common.saveError'], fields: [] };
      try {
        const data = await send<PosSettingsResponse>(settingsMorePaths.settings, 'PATCH', {
          ...partial,
          version: current.settings.version,
        });
        queryClient.setQueryData(key, data);
        void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
        return { ok: true, data };
      } catch (error) {
        if (isStaleWrite(error)) {
          await queryClient.invalidateQueries({ queryKey: key });
          return { ok: false, stale: true, message: SM_COPY['err.POS_SETTINGS_STALE'] };
        }
        return { ok: false, message: settingsErrorMessage(error), fields: fieldErrorsFrom(error) };
      }
    },
    [accessToken, queryClient, send],
  );
}

export interface SettingsDraft<K extends keyof PosCheckoutSettings> {
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

/**
 * A screen's draft over some POS settings keys (web `useSectionForm`): it follows the loaded
 * settings until edited, saves only what changed, and keeps the edits through a stale save so they
 * sit beside the fresh values, ready to save again.
 */
export function useSettingsDraft<K extends keyof PosCheckoutSettings>(
  settings: PosCheckoutSettings | undefined,
  keys: readonly K[],
): SettingsDraft<K> {
  const save = usePosSettingsSave();
  const source = useMemo(() => {
    const out = {} as Pick<PosCheckoutSettings, K>;
    if (settings) for (const k of keys) out[k] = settings[k];
    return out;
  }, [settings, keys]);
  const [edits, setEdits] = useState<Partial<Pick<PosCheckoutSettings, K>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const value = useMemo(() => ({ ...source, ...edits }), [source, edits]);
  const changes = useMemo(() => {
    const out: Partial<PosCheckoutSettings> = {};
    for (const k of keys) if (k in edits && !sameValue(edits[k], source[k])) (out as Record<string, unknown>)[k as string] = edits[k];
    return out;
  }, [edits, keys, source]);
  const dirty = Object.keys(changes).length > 0;

  const set = useCallback(<F extends K>(field: F, v: PosCheckoutSettings[F]) => {
    setEdits((prev) => ({ ...prev, [field]: v }));
    setFields((prev) => prev.filter((f) => f.path !== field && !f.path.startsWith(`${String(field)}.`)));
  }, []);

  const submit = useCallback(async () => {
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
