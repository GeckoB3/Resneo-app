import { useQuery } from '@tanstack/react-query';

import { refreshExpiredAccessToken } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { posFetch, posHeaders } from '@/lib/pos/api';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { usePosGate } from '@/lib/queries/usePos';
import type { ProductAiExtractRequest, ProductAiExtractResponse } from '@/types/pos-setup';

import { aiT } from './copy';
import { normaliseAiResponse } from './model';

/**
 * The products reader's route (`/api/venue/retail/products/ai-extract`, contract
 * `types/pos-setup.ts`), over Bearer like every app call.
 *
 * - `GET` answers `{ enabled }`: on wherever the server has its AI key, unless
 *   PRODUCTS_AI_SETUP_ENABLED=false (OB7; the owner, 2026-10-11: on by default, one way to add
 *   products beside adding them by hand and the spreadsheet import). It is false for staff without
 *   `manage_products` and while Checkout is off. Anything but `enabled: true` (a server without the
 *   key, a refusal, a server before the route, no signal) hides the way in.
 * - `POST` reads one source and stores nothing. It goes through its own `fetch` rather than
 *   `apiFetch`, as the services set-up's read does: a read can take minutes, and a refusal from in
 *   front of the route (413 too big, 504 too slow) comes back as a page, not JSON, which `apiFetch`
 *   would turn into a bare 502 and lose the advice for each. It refreshes an expired token once.
 */

export const PRODUCTS_AI_PATH = '/api/venue/retail/products/ai-extract';

/** The route the Products screen and the set-up wizard's W7 open. */
export const PRODUCTS_AI_HREF = '/stock/ai-import';

/** Is "Add products with AI" offered here? Asked only while `enabled` (people who can manage products). */
export function useProductsAiAvailability(options: { enabled?: boolean } = {}): { offered: boolean; loading: boolean } {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const query = useQuery({
    queryKey: [...queryKeys.pos.all(), 'products-ai', keyScope(accessToken)] as const,
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => posFetch<{ enabled?: unknown }>(PRODUCTS_AI_PATH, { accessToken: accessToken! }),
  });
  return { offered: enabled && query.data?.enabled === true, loading: enabled && query.isLoading };
}

export type ProductsAiReadResult = { ok: true; data: ProductAiExtractResponse } | { ok: false; error: string; status: number };

/** A read runs up to the route's limit (300 s for the services set-up); this leaves room for the upload. */
const READ_TIMEOUT_MS = 320_000;

/** The advice for a refusal that carried no sentence of its own (the web's `ai.err.*`). */
function statusMessage(status: number): string {
  if (status === 0) return aiT('ai.err.network');
  if (status === 413) return aiT('ai.err.tooBig');
  if (status === 504 || status === 408) return aiT('ai.err.timeout');
  if (status === 404) return aiT('app.ai.unavailable');
  return aiT('ai.err.generic');
}

/** `POST` one source. Never throws. */
export async function readProductsAi(body: ProductAiExtractRequest, accessToken: string | null): Promise<ProductsAiReadResult> {
  const url = `${getApiUrl()}${PRODUCTS_AI_PATH}`;
  const json = JSON.stringify(body);

  const attempt = async (bearer: string | null): Promise<{ status: number; data: unknown }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: json,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...posHeaders(),
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
  if (out.status >= 200 && out.status < 300) {
    const data = normaliseAiResponse(out.data);
    if (data) return { ok: true, data };
    return { ok: false, error: aiT('ai.err.generic'), status: out.status };
  }
  // Refusals are `{ error, code, reason }`: `error` is the sentence to show as it is.
  const sentence = (out.data as { error?: unknown } | null)?.error;
  if (typeof sentence === 'string' && sentence.trim()) return { ok: false, error: sentence.trim(), status: out.status };
  return { ok: false, error: statusMessage(out.status), status: out.status };
}
