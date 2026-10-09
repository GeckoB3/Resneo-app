import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ApiError } from '@/lib/api/client';
import { posErrorMessage, posFetch, type PosMethod } from '@/lib/pos/api';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosGate } from '@/lib/queries/usePos';
import type {
  PosCheckoutSettings,
  PosFieldError,
  PosSettingsDiscountPreset,
  PosSettingsPaymentType,
  PosSettingsResponse,
  PosSettingsTill,
} from '@/types/pos-settings';

/**
 * Checkout settings in the app (web: Settings, Checkout; `CheckoutSettingsContext.tsx`). The same
 * routes the web uses, with Bearer through `posFetch`, and like every POS call only at venues with
 * `pos_enabled` (`usePosGate`).
 *
 * The settings PATCH is versioned: every save sends the `version` it loaded and only the keys the
 * section changed, so one section's save never overwrites another's. A 412 reloads the fresh
 * settings and answers `stale`, and the section keeps its edits beside the fresh values to save
 * again (UX spec §9.1). The server's sentence shows word for word.
 */

export const settingsPaths = {
  settings: '/api/venue/pos/settings',
  tills: '/api/venue/pos/tills',
  till: (id: string) => `/api/venue/pos/tills/${encodeURIComponent(id)}`,
  paymentTypes: '/api/venue/pos/payment-types',
  paymentType: (id: string) => `/api/venue/pos/payment-types/${encodeURIComponent(id)}`,
  discountPresets: '/api/venue/pos/discount-presets',
  discountPreset: (id: string) => `/api/venue/pos/discount-presets/${encodeURIComponent(id)}`,
  trackAll: '/api/venue/retail/stock/track-all',
  /** DELETE takes the row's version in the query (like the web). */
  withVersion: (path: string, version: number) => `${path}?version=${version}`,
} as const;

export const settingsKeys = {
  settings: (accessToken?: string | null) => [...queryKeys.pos.all(), 'checkout-settings', keyScope(accessToken)] as const,
  tills: (accessToken?: string | null) => [...queryKeys.pos.all(), 'settings-tills', keyScope(accessToken)] as const,
  paymentTypes: (accessToken?: string | null) => [...queryKeys.pos.all(), 'settings-payment-types', keyScope(accessToken)] as const,
  discountPresets: (accessToken?: string | null) =>
    [...queryKeys.pos.all(), 'settings-discount-presets', keyScope(accessToken)] as const,
};

/** `GET /api/venue/pos/settings`: the settings, the staff capability map and what this login may change. */
export function useCheckoutSettingsQuery(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: settingsKeys.settings(accessToken),
    enabled,
    queryFn: () => posFetch<PosSettingsResponse>(settingsPaths.settings, { accessToken: accessToken! }),
  });
}

/** `GET /api/venue/pos/tills`: every till, the ones not in use too. */
export function useSettingsTills(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: settingsKeys.tills(accessToken),
    enabled,
    queryFn: async () =>
      (await posFetch<{ tills: PosSettingsTill[] }>(settingsPaths.tills, { accessToken: accessToken! })).tills ?? [],
  });
}

/** `GET /api/venue/pos/payment-types`: in till order, switched-off ones included. */
export function useSettingsPaymentTypes(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: settingsKeys.paymentTypes(accessToken),
    enabled,
    queryFn: async () =>
      (await posFetch<{ payment_types: PosSettingsPaymentType[] }>(settingsPaths.paymentTypes, { accessToken: accessToken! }))
        .payment_types ?? [],
  });
}

/** `GET /api/venue/pos/discount-presets`: the presets that are not archived. */
export function useSettingsDiscountPresets(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: settingsKeys.discountPresets(accessToken),
    enabled,
    queryFn: async () =>
      (await posFetch<{ discount_presets: PosSettingsDiscountPreset[] }>(settingsPaths.discountPresets, { accessToken: accessToken! }))
        .discount_presets ?? [],
  });
}

export type SaveResult =
  | { ok: true }
  | { ok: false; stale: true; message: string; fields: PosFieldError[] }
  | { ok: false; stale: false; message: string; fields: PosFieldError[] };

/** The field errors a 400 carries (`fields: [{ path, message }]`). */
export function fieldErrorsFrom(error: unknown): PosFieldError[] {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { fields?: unknown } | undefined;
  if (!Array.isArray(body?.fields)) return [];
  return body.fields.filter(
    (f): f is PosFieldError =>
      typeof f === 'object' && f !== null && typeof (f as PosFieldError).path === 'string' && typeof (f as PosFieldError).message === 'string',
  );
}

export function isStale(error: unknown): boolean {
  return error instanceof ApiError && error.status === 412;
}

/**
 * Save part of the settings at the loaded version (`PATCH /api/venue/pos/settings`). Answers, never
 * throws: the fresh settings replace the cached ones; a 412 reloads them and says `stale`.
 */
export function useSaveCheckoutSettings() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useCallback(
    async (partial: Partial<PosCheckoutSettings>): Promise<SaveResult> => {
      const key = settingsKeys.settings(accessToken);
      const current = queryClient.getQueryData<PosSettingsResponse>(key);
      if (!accessToken || !current) {
        return { ok: false, stale: false, message: SETTINGS_COPY['common.saveError'], fields: [] };
      }
      try {
        const next = await posFetch<PosSettingsResponse>(settingsPaths.settings, {
          accessToken,
          method: 'PATCH',
          body: { ...partial, version: current.settings.version },
        });
        queryClient.setQueryData(key, next);
        // The till reads its settings from the bootstrap.
        void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
        return { ok: true };
      } catch (error) {
        if (isStale(error)) {
          await queryClient.invalidateQueries({ queryKey: key });
          return { ok: false, stale: true, message: SETTINGS_COPY['err.POS_SETTINGS_STALE'], fields: [] };
        }
        return {
          ok: false,
          stale: false,
          message: posErrorMessage(error, SETTINGS_COPY['common.saveError']),
          fields: fieldErrorsFrom(error),
        };
      }
    },
    [accessToken, queryClient],
  );
}

export type WriteResult<T> =
  | { ok: true; body: T }
  | { ok: false; stale: boolean; status: number; message: string; fields: PosFieldError[] };

/**
 * One write to a settings list (tills, payment types, presets, Track stock's start). Answers, never
 * throws; a 412 answers `stale` with `err.POS_SETTINGS_STALE`. The caller reloads its list.
 */
export function useSettingsWrite() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useCallback(
    async <T = Record<string, unknown>>(path: string, method: PosMethod, body?: unknown): Promise<WriteResult<T>> => {
      if (!accessToken) {
        return { ok: false, stale: false, status: 0, message: SETTINGS_COPY['common.saveError'], fields: [] };
      }
      try {
        const res = await posFetch<T>(path, { accessToken, method, ...(body !== undefined ? { body } : {}) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
        return { ok: true, body: res };
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 412) {
          return { ok: false, stale: true, status, message: SETTINGS_COPY['err.POS_SETTINGS_STALE'], fields: [] };
        }
        return {
          ok: false,
          stale: false,
          status,
          message: posErrorMessage(error, SETTINGS_COPY['common.saveError']),
          fields: fieldErrorsFrom(error),
        };
      }
    },
    [accessToken, queryClient],
  );
}

/** Read the settings again (after a till was added, which may have turned on more than one till). */
export function useReloadCheckoutSettings() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: settingsKeys.settings(accessToken) }),
    [accessToken, queryClient],
  );
}
