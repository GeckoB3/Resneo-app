/**
 * The web routes the AI services setup calls (web `ServicesSetupWizard.tsx`, which calls them
 * with `fetch` from the dashboard).
 *
 * @see _reference/Resneo/src/app/api/venue/services-setup/extract/route.ts
 *
 * Reading a source goes through its own `fetch` rather than `apiFetch`: a read can take a few
 * minutes (the route's `maxDuration` is 300 s), and a refusal from in front of the route (413 for
 * an upload that is too big, 504 for one that ran out of time) comes back as a page, not JSON,
 * which `apiFetch` would turn into a generic 502 and lose the advice the web gives for each. It
 * refreshes an expired token once, as `apiFetch` does, through the client's own helper.
 */

import { apiFetch, refreshExpiredAccessToken } from '@/lib/api/client';
import { formDataFile } from '@/lib/api/form-data-file';
import { getApiUrl } from '@/lib/env';

import type { ServicesSetupExtractResponse } from './types';

/** A file ready to upload: a picked document, a photo, or one slice of a long screenshot. */
export interface SetupFilePart {
  uri: string;
  name: string;
  type: string;
  size: number;
}

/** What one read sends (web `SetupSource`: a link, a typed list, or one file or its slices). */
export interface SetupReadInput {
  kind: 'url' | 'text' | 'file';
  label: string;
  url?: string;
  text?: string;
  files?: SetupFilePart[];
}

export type SetupReadResult = { ok: true; data: ServicesSetupExtractResponse } | { ok: false; error: string };

/** A read runs up to the route's 300 s; this leaves room for the upload and the answer. */
const READ_TIMEOUT_MS = 320_000;

export const COULD_NOT_REACH = 'We could not reach ResNeo. Check your connection and try again.';

function buildForm(input: SetupReadInput, instructions: string): FormData {
  const body = new FormData();
  body.append('kind', input.kind);
  if (input.url) body.append('url', input.url);
  if (input.text) body.append('text', input.text);
  // The label travels as its own field, so the part's file name does not matter.
  for (const f of input.files ?? []) body.append('file', formDataFile(f.uri, f.name, f.type));
  if (input.files?.length) body.append('label', input.label);
  if (instructions.trim()) body.append('instructions', instructions.trim());
  return body;
}

/** The web wizard's message for a refusal that carried no sentence of its own. */
function statusMessage(status: number): string {
  if (status === 413) return 'That file is too big to send. Try a photo or screenshot instead.';
  if (status === 504 || status === 408) return 'That took too long to read. Try a shorter part of your list, or a screenshot.';
  return 'We could not read that just now. Please try again.';
}

/** `POST /api/venue/services-setup/extract` for one source. Never throws. */
export async function readSetupSource(
  input: SetupReadInput,
  instructions: string,
  accessToken: string | null,
): Promise<SetupReadResult> {
  const url = `${getApiUrl()}/api/venue/services-setup/extract`;

  const attempt = async (bearer: string | null): Promise<{ status: number; data: unknown }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: buildForm(input, instructions),
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      });
      const text = await res.text().catch(() => '');
      let data: unknown = null;
      try {
        data = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        data = null;
      }
      return { status: res.status, data };
    } catch {
      return { status: controller.signal.aborted ? 408 : 0, data: null };
    } finally {
      clearTimeout(timer);
    }
  };

  let out = await attempt(accessToken);
  if (out.status === 401 && accessToken) {
    const refreshed = await refreshExpiredAccessToken(accessToken);
    if (refreshed) out = await attempt(refreshed);
  }
  if (out.status === 0) return { ok: false, error: COULD_NOT_REACH };
  const data = out.data as ServicesSetupExtractResponse | { ok?: boolean; error?: unknown } | null;
  if (out.status >= 200 && out.status < 300 && data && data.ok === true) {
    return { ok: true, data: data as ServicesSetupExtractResponse };
  }
  if (data && data.ok === false && typeof data.error === 'string' && data.error.trim()) {
    return { ok: false, error: data.error };
  }
  return { ok: false, error: statusMessage(out.status) };
}

// ---------------------------------------------------------------------------
// The ordinary routes the setup writes through (as the web wizard does)
// ---------------------------------------------------------------------------

export interface CategoryRef {
  id: string;
  name: string;
  sort_order?: number;
}

export function createServiceCategory(name: string, accessToken: string | null) {
  return apiFetch<{ category?: CategoryRef }>('/api/venue/service-categories', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ name }),
  });
}

export function listServiceCategories(accessToken: string | null) {
  return apiFetch<{ categories?: CategoryRef[] }>('/api/venue/service-categories', { accessToken });
}

export function createAppointmentService(body: Record<string, unknown>, accessToken: string | null) {
  return apiFetch<{ id?: string; service?: { id?: string } }>('/api/venue/appointment-services', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(body),
  });
}

export function patchAppointmentService(body: Record<string, unknown>, accessToken: string | null) {
  return apiFetch<unknown>('/api/venue/appointment-services', {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(body),
  });
}

export function deleteAppointmentService(id: string, accessToken: string | null) {
  return apiFetch<unknown>('/api/venue/appointment-services', {
    method: 'DELETE',
    accessToken,
    body: JSON.stringify({ id }),
  });
}

/** A fresh services list: Undo reads the page item from it, as the web does. */
export function fetchAppointmentServices(accessToken: string | null) {
  return apiFetch<{
    services?: { id: string; collective?: { role?: string; collective_id?: string; item_id?: string | null } | null }[];
  }>('/api/venue/appointment-services', { accessToken });
}

/** Put a service on the collective's combined page (web `setOnPage(id, true)`). */
export function offerOnCollectivePage(collectiveId: string, serviceId: string, accessToken: string | null) {
  return apiFetch<unknown>(`/api/venue/collectives/${collectiveId}/offerings`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ service_id: serviceId }),
  });
}

/** Take a service off the combined page (web `setOnPage(id, false, itemId)`). */
export function takeOffCollectivePage(collectiveId: string, itemId: string, accessToken: string | null) {
  return apiFetch<unknown>(`/api/venue/collectives/${collectiveId}/offerings/${itemId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export interface SetupAddonGroupBody {
  group: {
    name: string;
    prompt_to_client: string;
    selection_type: 'multi';
    min_select: number;
    max_select: null;
    addons: {
      name: string;
      additional_price_pence: number;
      additional_duration_minutes: number;
      sort_order: number;
      is_active: boolean;
    }[];
  };
  service_links: { service_item_ids: string[] };
}

export function createAddonGroup(body: SetupAddonGroupBody, accessToken: string | null) {
  return apiFetch<{ group?: { id?: string } }>('/api/venue/addon-groups', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(body),
  });
}

export function updateAddonGroup(id: string, body: SetupAddonGroupBody, accessToken: string | null) {
  return apiFetch<{ group?: { id?: string } }>(`/api/venue/addon-groups/${id}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(body),
  });
}

export function deleteAddonGroup(id: string, accessToken: string | null) {
  return apiFetch<unknown>(`/api/venue/addon-groups/${id}`, { method: 'DELETE', accessToken });
}
