import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage } from '@/lib/pos/api';
import { POS_COPY } from '@/lib/pos/copy';
import { useStartSale } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';

/** The route of one sale. */
export function saleHref(saleId: string): Href {
  return `/checkout/${saleId}` as Href;
}

/**
 * "Check out" (`bk.checkout`, UX spec §13.3): opens the sale a booking is already on, or starts
 * one from the booking with the rest of its visit, then shows it. "New sale" starts a blank sale.
 * One request id per tap, so a double tap opens one sale.
 */
export function useOpenCheckout() {
  const router = useRouter();
  const toast = useToast();
  const start = useStartSale();
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  const open = useCallback(
    async (source: { bookingId: string } | 'blank', options: { replace?: boolean; onOpened?: () => void } = {}) => {
      const key = source === 'blank' ? 'blank' : source.bookingId;
      if (openingKey) return;
      setOpeningKey(key);
      try {
        const sale = await start.mutateAsync(
          source === 'blank'
            ? { clientRequestId: newPaymentAttemptId(), source: { type: 'blank' } }
            : { clientRequestId: newPaymentAttemptId(), source: { type: 'booking', booking_id: source.bookingId } },
        );
        if (options.replace) router.replace(saleHref(sale.id));
        else router.push(saleHref(sale.id));
        options.onOpened?.();
      } catch (error) {
        toast.error(posErrorMessage(error, POS_COPY['app.sale.openFailed']));
      } finally {
        setOpeningKey(null);
      }
    },
    [openingKey, router, start, toast],
  );

  return { open, openingKey };
}
