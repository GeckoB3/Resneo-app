import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * The customer's group booking: several people booked together at one business (web QA
 * 2026-11-21 PUBLIC-19). Each person's appointment is its own: cancelling one person never cancels
 * the others, and each keeps its own deposit, card hold and cancellation deadline.
 *
 * Any person's row opens the group, a cancelled one included. The web's `GuestGroupPanel` drives
 * the same routes; the shapes below mirror the server's `GroupDto` and `GroupCancelData` (only the
 * fields this app reads). Every sentence (why an action is not available, what cancelling does to a
 * person's money) is the server's, so the app and the web say the same thing.
 *
 * Times are the business's own wall clock ("HH:MM"), formatted on the server, never converted here.
 */

export interface CustomerGroupAppointment {
  booking_id: string;
  booking_date: string;
  /** HH:MM */
  start_time: string;
  /** HH:MM */
  end_time: string;
  service_name: string;
  /** The staff member it is with. */
  staff_name: string | null;
  /** The database value ("Booked", "Cancelled"); read through `customerBookingState`. */
  status: string;
}

export interface CustomerGroupAction {
  available: boolean;
  /** Why not, in the client's words, when it is not available. */
  message: string | null;
}

export interface CustomerGroupPerson {
  /** The person's label as booked ("Mum"). */
  label: string;
  appointments: CustomerGroupAppointment[];
  state: 'live' | 'cancelled';
  cancel: CustomerGroupAction & {
    /** The appointments "Cancel" sends: this person's that can still be cancelled. */
    booking_ids: string[];
    /** What cancelling does for this person (deadline, deposit, card hold). */
    consequences: string[];
  };
  change: CustomerGroupAction & {
    /** The appointment "Change" moves, with the single-booking reschedule. */
    booking_id: string | null;
  };
}

export interface CustomerGroup {
  opened_booking_id: string;
  business: { id: string; name: string; phone: string | null; email: string | null; address: string | null; currency: 'GBP' | 'EUR' };
  state: 'live' | 'cancelled';
  people: CustomerGroupPerson[];
  /** "Cancel everyone": offered when more than one person can still be cancelled. */
  cancel_everyone: CustomerGroupAction & { booking_ids: string[]; consequences: string[] };
}

export interface CustomerGroupCancelResult {
  success: true;
  message: string;
  cancelled_booking_ids: string[];
  results: {
    booking_id: string;
    person_label: string;
    cancelled: boolean;
    message: string;
    refund_message: string;
    card_hold_message: string | null;
    card_hold_kept: boolean;
  }[];
}

function groupPath(bookingId: string, suffix = ''): string {
  return `/api/v1/me/groups/${encodeURIComponent(bookingId)}${suffix}`;
}

/** The group `bookingId` belongs to. `enabled` is the detail's `in_group`. */
export function useCustomerGroup(bookingId: string | null | undefined, enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.group(bookingId ?? null, accessToken),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(bookingId) && enabled,
    queryFn: async (): Promise<CustomerGroup> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<CustomerGroup>(groupPath(bookingId), { accessToken });
    },
  });
}

/**
 * Cancel one person (`{ booking_ids }`, from that person's `cancel.booking_ids`) or everyone
 * (`{ everyone: true }`). Every customer screen refetches afterwards.
 */
export function useCancelGroup(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { booking_ids: string[] } | { everyone: true }): Promise<CustomerGroupCancelResult> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<CustomerGroupCancelResult>(groupPath(bookingId, '/cancel'), {
        accessToken,
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
    },
  });
}

/** The lines to show after a cancel: each person's refund or card-hold line, named when several. */
export function groupCancelLines(result: CustomerGroupCancelResult): string[] {
  const done = (result.results ?? []).filter((r) => r.cancelled);
  const people = new Set(done.map((r) => r.person_label));
  const lines = done
    .map((r) => {
      const line = r.card_hold_kept ? r.card_hold_message : [r.refund_message, r.card_hold_message].filter(Boolean).join(' ');
      return line ? (people.size > 1 ? `${r.person_label}: ${line}` : line) : '';
    })
    .filter(Boolean) as string[];
  return [...new Set(lines)];
}
