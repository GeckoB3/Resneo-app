import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * The customer hub, from `GET /api/v1/me/home`.
 *
 * These types MIRROR the web's `AccountHomeData` rather than reinterpreting it.
 * Only the fields this screen renders are declared, because a type that claims
 * to describe the whole payload has to be kept in step with it, and the parts
 * it gets wrong are invisible until something reads them.
 */

/** A booking, as the customer surface returns it. */
export interface CustomerBooking {
  id: string;
  venue_id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  booking_model: string;
  payment_state?: string | null;
  booking_total_price_pence?: number | null;
  amount_paid_pence?: number | null;
}

export interface CustomerVenue {
  id: string;
  name: string;
}

export interface CustomerHome {
  next_booking: CustomerBooking | null;
  next_booking_form_links: { name: string; url: string }[];
  /**
   * FALSE when the forms lookup failed.
   *
   * The distinction the web went out of its way to preserve, and it must
   * survive the trip: an empty list with `checked: false` means "we do not
   * know", not "nothing to do". A customer told they have nothing outstanding,
   * who in fact has an unsigned waiver, finds out at the door.
   */
  next_booking_forms_checked: boolean;
  /** How many of the OTHER listed bookings still need a form. */
  later_bookings_needing_forms: number;
  next_booking_appointment: { service: string | null; practitioner: string | null };
  upcoming_count: number;
  upcoming_after_next: CustomerBooking[];
  outstanding_payments: CustomerBooking[];
  venues: CustomerVenue[];
  credits: { total_remaining: number; venue_count: number; next_expiry: string | null };
  memberships: { active_count: number; cancelling_count: number };
}

export function useCustomerHome() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.customer.home(accessToken),
    enabled,
    queryFn: async (): Promise<CustomerHome> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CustomerHome>('/api/v1/me/home', { accessToken });
    },
  });
}

/** Venue name for a booking, falling back to a neutral word rather than an id. */
export function venueNameFor(home: CustomerHome | undefined, venueId: string): string {
  return home?.venues.find((v) => v.id === venueId)?.name ?? 'your venue';
}

/**
 * What is still owed on a booking, in pence, or null when nothing is.
 *
 * Both halves matter, which is why this is a function rather than a read of
 * `payment_state`: a free booking is `unpaid` with nothing owing, and reading
 * the state alone would put it on an outstanding list and ask the customer for
 * nothing.
 */
export function balancePenceFor(booking: CustomerBooking): number | null {
  const total = booking.booking_total_price_pence ?? 0;
  const paid = booking.amount_paid_pence ?? 0;
  const owed = total - paid;
  return owed > 0 ? owed : null;
}
