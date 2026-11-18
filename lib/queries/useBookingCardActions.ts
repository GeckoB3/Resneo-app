/**
 * A signed-in customer's card actions on one booking (web Docs/card-on-file-plan.md §5.4, §5.5, C4,
 * C6), through the session route the web portal uses:
 *
 *   POST /api/v1/me/bookings/[id]/card { action: 'not_me' }
 *        -> { success, message, booking_ids }   "This wasn't me": the saved card no longer secures
 *                                                this booking, the business is told.
 *   POST /api/v1/me/bookings/[id]/card { action: 'remove_card', preview: true }
 *        -> { success, preview, removed, message } the removal words only.
 *   POST /api/v1/me/bookings/[id]/card { action: 'remove_card' }
 *        -> { success, preview, removed, message } removes the card (bookings it protects stay
 *                                                protected).
 *
 * A refusal answers 409 with the server's own words in `error` (and `reason`: `not_covered`,
 * `saved_here`, `charged`, `not_yours`), which `ApiError.message` carries.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** The booking DTO's `card_hold.on_file` (a booking a card on file secures). */
export interface BookingCardOnFile {
  /** The card was saved in this booking: "This wasn't me" is not offered. */
  saved_here: boolean;
  /** The client's own card: "Remove my saved card" is offered. */
  own: boolean;
  /** Brand and last four, sent to a signed-in reader. */
  card: { brand: string | null; last4: string | null } | null;
}

/** `card_hold.on_file` from the booking DTO, or null when the booking is not secured by a card on file. */
export function bookingCardOnFile(hold: unknown): BookingCardOnFile | null {
  const h = hold as { state?: unknown; on_file?: Partial<BookingCardOnFile> | null } | null | undefined;
  const raw = h?.state === 'held' ? h.on_file : null;
  if (!raw || typeof raw !== 'object') return null;
  const card = raw.card && typeof raw.card === 'object' ? raw.card : null;
  return {
    saved_here: raw.saved_here === true,
    own: raw.own === true,
    card: card
      ? {
          brand: typeof card.brand === 'string' ? card.brand : null,
          last4: typeof card.last4 === 'string' ? card.last4 : null,
        }
      : null,
  };
}

const BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  maestro: 'Maestro',
};

/** "Visa ending 4242", as the web's `cardOnFileLabel`. */
export function bookingCardLabel(card: BookingCardOnFile['card']): string | null {
  if (!card || (!card.brand && !card.last4)) return null;
  const b = (card.brand ?? '').toLowerCase();
  const name = BRANDS[b] ?? (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
  return card.last4 ? `${name} ending ${card.last4}` : name;
}

export interface BookingCardActionResult {
  success?: boolean;
  message?: string;
  preview?: boolean;
  removed?: boolean;
  booking_ids?: string[];
}

export type BookingCardAction = { action: 'not_me' } | { action: 'remove_card'; preview?: boolean };

function cardPath(bookingId: string): string {
  return `/api/v1/me/bookings/${encodeURIComponent(bookingId)}/card`;
}

/**
 * The removal words for "Remove your saved card?", read fresh when the question opens. Falls back
 * to `fallback` when the server cannot say.
 */
export function useBookingCardRemovalText(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  return async (fallback: string): Promise<string> => {
    if (!accessToken || !bookingId) return fallback;
    try {
      const body = await apiFetch<BookingCardActionResult>(cardPath(bookingId), {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'remove_card', preview: true }),
      });
      return body.message || fallback;
    } catch {
      return fallback;
    }
  };
}

/** "This wasn't me" or "Remove my saved card" on one booking; refreshes the customer's bookings. */
export function useBookingCardAction(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: BookingCardAction): Promise<BookingCardActionResult> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<BookingCardActionResult>(cardPath(bookingId), {
        accessToken,
        method: 'POST',
        body: JSON.stringify(args.action === 'remove_card' && args.preview ? { action: 'remove_card', preview: true } : { action: args.action }),
      });
    },
    onSuccess: (_data, args) => {
      if (args.action === 'remove_card' && args.preview) return;
      // The booking, the bookings list and the Saved cards section all change.
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
    },
  });
}
