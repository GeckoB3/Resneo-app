import { ApiError, apiErrorCode } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';

import { SM_COPY } from './copy';
import type { FieldError } from './types';

/**
 * The routes the second half of Checkout settings calls, all through `posFetch` (so they carry the
 * POS headers) and all Bearer-friendly through the web's `posRoute`. The same routes the web's
 * Settings, Checkout cards call, so the server's checks and sentences are the same.
 */
export const settingsMorePaths = {
  settings: '/api/venue/pos/settings',
  tills: '/api/venue/pos/tills',
  readers: (refresh: boolean) => `/api/venue/pos/readers${refresh ? '?refresh=1' : ''}`,
  readersCreate: '/api/venue/pos/readers',
  reader: (id: string) => `/api/venue/pos/readers/${encodeURIComponent(id)}`,
  readerTestCard: (id: string) => `/api/venue/pos/readers/${encodeURIComponent(id)}/test-card`,
  voucherSettings: '/api/venue/pos/voucher-settings',
  vouchers: '/api/venue/pos/vouchers',
  voucherImport: '/api/venue/pos/vouchers/import',
  loyaltyProgramme: '/api/venue/pos/loyalty/programme',
  commissionRates: '/api/venue/pos/commission/rates',
  trackAll: '/api/venue/retail/stock/track-all',
  shopSettings: '/api/venue/shop/settings',
  deliveryZones: '/api/venue/shop/delivery-zones',
} as const;

/** The server's sentence for a failed call, word for word, or the network sentence. */
export function settingsErrorMessage(error: unknown, fallback: string = SM_COPY['common.saveError']): string {
  if (error instanceof ApiError && error.status === 0) return SM_COPY['common.networkError'];
  if (error instanceof ApiError && error.status === 408) return SM_COPY['common.networkError'];
  return posErrorMessage(error, fallback);
}

/** True for a 412: someone else saved first (POS_SETTINGS_STALE and the shop's own stale answer). */
export function isStaleWrite(error: unknown): boolean {
  return error instanceof ApiError && error.status === 412;
}

/** True when the request never reached the server (a retry may send the same request id again). */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 408);
}

/** The fields a 400 named (`fields: [{ path, message }]`). */
export function fieldErrorsFrom(error: unknown): FieldError[] {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { fields?: unknown } | undefined;
  if (!Array.isArray(body?.fields)) return [];
  return body.fields.filter(
    (f): f is FieldError => typeof f === 'object' && f !== null && typeof (f as FieldError).path === 'string' && typeof (f as FieldError).message === 'string',
  );
}

/** The first message for `path` or anything under it (`preset_pence.2`). */
export function fieldErrorFor(fields: FieldError[], path: string): string | null {
  return fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message ?? null;
}

/** The refusal's code (`feature_disabled`, `POS_PAYMENT_IN_PROGRESS`, ...). */
export function settingsErrorCode(error: unknown): string | null {
  return apiErrorCode(error);
}

/** A 403 that means the feature (or Checkout) is switched off for the venue. */
export function isFeatureOff(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && apiErrorCode(error) === 'feature_disabled';
}

/** The JSON a refused write carried (a 412 answers with the fresh row). */
export function errorBody<T>(error: unknown): T | null {
  if (!(error instanceof ApiError)) return null;
  return (error.body as T | undefined) ?? null;
}

/** Same JSON, for "did anything change" checks (missing and null read the same). */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
