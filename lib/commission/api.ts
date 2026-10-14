import { ApiError, apiErrorCode, isApiErrorBody } from '@/lib/api/client';
import type { PosRangeChoice } from '@/types/pos-reports';
import type { CommissionSettingsResponse, SplitPreviewParams } from '@/types/commission-splits';

import { splitsT } from './splits-copy';

/**
 * The routes Commission splits calls (web `/api/venue/commission/*`, the contract agreed 2026-10-14).
 * Every one works with the Bearer token and none needs Checkout on, so they go through `apiFetch`,
 * never `posFetch`. The old Checkout routes (`/api/venue/pos/commission/*`) stay on the server for
 * app versions already in people's hands; this build no longer calls them, except Checkout set-up's
 * "Your team at the till" step.
 */
export const commissionPaths = {
  settings: '/api/venue/commission/settings',
  rates: '/api/venue/commission/rates',
  /** One person's share in one step: their own rates (or your standard ones), the label and the start date. */
  share: '/api/venue/commission/share',
  /** The team report (`preset=`, `from=&to=`, `calendar_id=`). */
  report: (query: string) => `/api/venue/commission/report?${query}`,
  /** One person's lines in the team report. */
  reportPerson: (query: string, personKey: string) =>
    `/api/venue/commission/report?${query}&person=${encodeURIComponent(personKey)}`,
  /** "My sales": any team member's own figures (`mine=1`). */
  mine: (period: string) => `/api/venue/commission/report?mine=1&period=${encodeURIComponent(period)}`,
  splits: '/api/venue/commission/splits',
  /** The worked example; `query` is `previewQuery(params)`. */
  preview: (query: string) => `/api/venue/commission/splits/preview?${query}`,
  respond: (splitId: string) => `/api/venue/commission/splits/${encodeURIComponent(splitId)}/respond`,
  terms: (splitId: string) => `/api/venue/commission/splits/${encodeURIComponent(splitId)}/terms`,
  withdraw: (splitId: string) => `/api/venue/commission/splits/${encodeURIComponent(splitId)}/withdraw`,
  end: (splitId: string) => `/api/venue/commission/splits/${encodeURIComponent(splitId)}/end`,
  /** Business split figures (`preset=` or `from=&to=`). */
  splitsReport: (query: string) => `/api/venue/commission/splits/report?${query}`,
  /** One split's lines in the range. */
  splitLines: (query: string, splitId: string) =>
    `/api/venue/commission/splits/report?${query}&split=${encodeURIComponent(splitId)}`,
  statements: (splitId: string) => `/api/venue/commission/splits/${encodeURIComponent(splitId)}/statements`,
  settlements: (splitId: string) => `/api/venue/commission/splits/${encodeURIComponent(splitId)}/settlements`,
  undo: (splitId: string, settlementId: string) =>
    `/api/venue/commission/splits/${encodeURIComponent(splitId)}/settlements/${encodeURIComponent(settlementId)}/undo`,
} as const;

/** The preview's query string, in the contract's order. Products are left out when not included. */
export function previewQuery(params: SplitPreviewParams): string {
  const parts = [
    `calendar_id=${encodeURIComponent(params.calendar_id)}`,
    `other_venue_id=${encodeURIComponent(params.other_venue_id)}`,
    `services_rate_percent=${encodeURIComponent(String(params.services_rate_percent))}`,
  ];
  if (params.products_rate_percent !== null) {
    parts.push(`products_rate_percent=${encodeURIComponent(String(params.products_rate_percent))}`);
  }
  parts.push(`vat_basis=${encodeURIComponent(params.vat_basis)}`);
  return parts.join('&');
}

/**
 * The range the commission routes read: a preset (`preset=this-month`) or two dates
 * (`from=&to=`), and one of your own calendars for the team report (`calendar_id`). No grain: these
 * reports have no time series.
 */
export function commissionRangeQuery(choice: PosRangeChoice, calendarId?: string | null): string {
  const parts =
    choice.kind === 'preset'
      ? [`preset=${encodeURIComponent(choice.preset)}`]
      : [`from=${encodeURIComponent(choice.from)}`, `to=${encodeURIComponent(choice.to)}`];
  if (calendarId) parts.push(`calendar_id=${encodeURIComponent(calendarId)}`);
  return parts.join('&');
}

/** A field a write refused (`VALIDATION_FAILED`: `fields: [{ path, message }]`). */
export interface CommissionFieldError {
  path: string;
  message: string;
}

/** The server's sentence for a failed call, word for word, or the app's own when none came back. */
export function commissionErrorMessage(error: unknown, fallback: string = splitsT('app.saveError')): string {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.status === 408) return splitsT('app.networkError');
    if (isApiErrorBody(error.body) && error.body.error.trim()) return error.body.error;
    return fallback;
  }
  return fallback;
}

/** The fields a 400 named, for the messages beside the inputs. */
export function commissionFieldErrors(error: unknown): CommissionFieldError[] {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { fields?: unknown } | undefined;
  if (!Array.isArray(body?.fields)) return [];
  return body.fields.filter(
    (f): f is CommissionFieldError =>
      typeof f === 'object' && f !== null && typeof (f as CommissionFieldError).path === 'string' && typeof (f as CommissionFieldError).message === 'string',
  );
}

/** The first message for `path` (or anything under it). */
export function fieldMessage(fields: CommissionFieldError[], path: string): string | null {
  return fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message ?? null;
}

/** A 412: someone else saved the settings first (`STALE_RESOURCE`). */
export function isStaleSettings(error: unknown): boolean {
  return error instanceof ApiError && error.status === 412;
}

/** The fresh settings a 412 carries (`{ error, code: 'STALE_RESOURCE', settings }`), when it does. */
export function staleSettingsFrom(error: unknown): CommissionSettingsResponse | null {
  if (!isStaleSettings(error)) return null;
  const settings = ((error as ApiError).body as { settings?: unknown } | undefined)?.settings;
  return settings && typeof settings === 'object' && Array.isArray((settings as CommissionSettingsResponse).rates)
    ? (settings as CommissionSettingsResponse)
    : null;
}

/**
 * A split that ended because the link or collective no longer allows it: read only. The routes
 * refuse "Mark as paid" and Undo on it (409 `SPLIT_NOT_ACTIVE`, `err.readOnly`), so the screen hides them.
 */
export function isReadOnlySplit(split: { end_reason: string | null }): boolean {
  return split.end_reason === 'link_ended';
}

/** A 404 `NOT_FOUND`: a split this venue is not party to (or that no longer exists). */
export function isSplitNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** The refusal's code, when it carries one. */
export function commissionErrorCode(error: unknown): string | null {
  return apiErrorCode(error);
}
