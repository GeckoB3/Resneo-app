import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { saleHref } from '@/components/pos/useOpenCheckout';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, posPaths } from '@/lib/pos/api';
import { POS_COPY } from '@/lib/pos/copy';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { invalidateAfterSaleWrite, usePosGate } from '@/lib/queries/usePos';
import type { PosSale, PosSaleResponse } from '@/types/pos';
import type { PosReceiptPreviewResponse } from '@/types/pos-setup';

import { practiceT } from './copy';
import { isPracticeSale, practiceSaleBody } from './model';

/**
 * The practice sale's two calls of its own (POS test round 2026-10-11, Part 4, OB4): the receipt
 * preview, and starting a practice sale, which the set-up wizard's W11 calls ("Start a practice
 * sale"). Everything else a practice does goes through the sale screen's ordinary writes, except
 * paying, which a practice only shows.
 */

export const practicePaths = {
  /** `GET /api/venue/pos/receipt-preview?sale_id=`: the receipt the client would get. Nothing is sent. */
  receiptPreview: (saleId: string) => `/api/venue/pos/receipt-preview?sale_id=${encodeURIComponent(saleId)}`,
} as const;

/**
 * The receipt preview for a practice sale, read again whenever the sale changes (its `version`).
 * Under the POS gate like every Checkout read; asked only while `enabled`.
 */
export function useReceiptPreview(sale: Pick<PosSale, 'id' | 'version'>, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: [...queryKeys.pos.all(), 'receipt-preview', keyScope(accessToken), sale.id, sale.version] as const,
    enabled,
    retry: false,
    staleTime: 0,
    queryFn: () => posFetch<PosReceiptPreviewResponse>(practicePaths.receiptPreview(sale.id), { accessToken: accessToken! }),
  });
}

/**
 * "Start a practice sale" (W11, for the set-up wizard): starts a blank practice sale and opens it on
 * the sale screen, which shows practice mode because the sale says `practice: true`.
 *
 * A server that does not know practice sales would start an ordinary sale instead. That sale is
 * voided at once (with an ordinary reason, since "Practice" belongs to practice sales only) and the
 * person is told practice isn't ready, so a real sale is never offered as a practice one.
 */
export function useOpenPracticeSale() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A plain function: `react-hooks/preserve-manual-memoization` refuses a memoised one that returns
  // from inside `try`.
  async function open(): Promise<boolean> {
    if (opening) return false;
    if (!accessToken) {
      setError(POS_COPY['common.networkError']);
      return false;
    }
    setOpening(true);
    setError(null);
    try {
      const res = await posFetch<PosSaleResponse>(posPaths.sales, {
        accessToken,
        method: 'POST',
        body: practiceSaleBody(newPaymentAttemptId()),
      });
      const sale = res.sale;
      if (!isPracticeSale(sale)) {
        try {
          await posFetch<PosSaleResponse>(posPaths.saleAction(sale.id, 'void'), {
            accessToken,
            method: 'POST',
            body: { version: sale.version, reason: 'Started by mistake' },
          });
        } catch {
          // An open sale with nothing on it is harmless; the daily clean-up and the lists show it.
        }
        invalidateAfterSaleWrite(queryClient, { money: false });
        setError(practiceT('app.setup.practice.unavailable'));
        return false;
      }
      queryClient.setQueryData(queryKeys.pos.sale(accessToken, sale.id), sale);
      router.push(saleHref(sale.id));
      return true;
    } catch (e) {
      setError(posErrorMessage(e, POS_COPY['app.sale.openFailed']));
      return false;
    } finally {
      setOpening(false);
    }
  }

  return { open, opening, error };
}
