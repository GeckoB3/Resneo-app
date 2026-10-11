import { ApiError, apiErrorCode } from '@/lib/api/client';
import { posFetch } from '@/lib/pos/api';
import type { PosCollectPhonesResponse } from '@/lib/pos/setup/phone';
import type { PosReceiptPreviewResponse, PosSetupProgressPatch, PosSetupStatus } from '@/types/pos-setup';

/**
 * The set-up routes over Bearer (contract: the web's `src/lib/pos/setup/types.ts`). They sit under
 * `/api/venue/pos/`, so they go through `posFetch` with the POS headers, and like every POS call
 * they are only made at a venue with Checkout on.
 */
export const setupPaths = {
  status: '/api/venue/pos/setup-status',
  progress: '/api/venue/pos/setup-progress',
  /** The people with a phone that can take a card now (W3's list, "Get this phone ready"). */
  collectPhones: '/api/venue/pos/collect-phones',
  receiptPreview: (saleId?: string | null) =>
    `/api/venue/pos/receipt-preview${saleId ? `?sale_id=${encodeURIComponent(saleId)}` : ''}`,
} as const;

export function fetchSetupStatus(accessToken: string): Promise<PosSetupStatus> {
  return posFetch<PosSetupStatus>(setupPaths.status, { accessToken });
}

export function sendSetupProgress(accessToken: string, patch: PosSetupProgressPatch): Promise<PosSetupStatus> {
  return posFetch<PosSetupStatus>(setupPaths.progress, { accessToken, method: 'PATCH', body: patch });
}

export function fetchCollectPhones(accessToken: string): Promise<PosCollectPhonesResponse> {
  return posFetch<PosCollectPhonesResponse>(setupPaths.collectPhones, { accessToken });
}

export function fetchReceiptPreview(accessToken: string, saleId?: string | null): Promise<PosReceiptPreviewResponse> {
  return posFetch<PosReceiptPreviewResponse>(setupPaths.receiptPreview(saleId), { accessToken });
}

function looksLikeStatus(value: unknown): value is PosSetupStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PosSetupStatus).steps) &&
    typeof (value as PosSetupStatus).version === 'number'
  );
}

/**
 * The fresh status a 412 `SETUP_STALE` carries (someone else saved first), wherever the body puts
 * it (`status`, or the body itself), or null when it carries none.
 */
export function staleSetupStatus(error: unknown): PosSetupStatus | null {
  if (!(error instanceof ApiError) || error.status !== 412) return null;
  const body = error.body as Record<string, unknown> | undefined;
  if (looksLikeStatus(body?.status)) return body.status;
  if (looksLikeStatus(body)) return body;
  return null;
}

/** True for any 412, whether or not it carried the fresh status. */
export function isSetupStale(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 412 || apiErrorCode(error) === 'SETUP_STALE');
}

/**
 * The routes answer only once Checkout is on, to admins, and on a server that has them: a 401, 403
 * or 404 is an answer (no card, nothing to save), not a hiccup to retry.
 */
export function isSetupRefusal(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
