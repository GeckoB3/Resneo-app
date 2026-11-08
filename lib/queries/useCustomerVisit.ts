import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * The customer's whole visit: every service of a multi-service appointment, and the actions that
 * apply to all of it (web `Docs/split-staff-visit-plan.md` 6.5 to 6.7, 8.7, 8.9).
 *
 * Any row of the visit opens it, a cancelled one included, so a link or a push for a service the
 * business has since cancelled still lands on the visit rather than a dead end (G5). The web's
 * `GuestVisitPanel` drives the same routes; the shapes below mirror the server's `VisitDto`,
 * `VisitChangeOptionsData` and `VisitCancelPreviewData` (only the fields this app reads).
 *
 * Times are the business's own wall clock ("HH:MM"), formatted on the server, never converted here.
 */

/** Why a whole-visit action is not available online, in the server's own vocabulary. */
export type VisitBlockedReason = string;

export interface CustomerVisitService {
  booking_id: string;
  booking_date: string;
  /** HH:MM */
  start_time: string;
  /** HH:MM */
  end_time: string;
  service_name: string;
  person_name: string | null;
  /** The database value ("Booked", "Cancelled", "No-Show"); read through `customerBookingState`. */
  status: string;
  venue_id: string;
  /** The business it is with (web split-visit plan 6.5); absent from older servers. */
  business_name?: string | null;
  confirmed: boolean;
}

export interface CustomerVisitBusiness {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** What this business took for its own services, and refunded (6.5); absent from older servers. */
  payments?: { paid_pence: number; refunded_pence: number };
  /** The currency those payments are in; absent means pounds. */
  currency?: 'GBP' | 'EUR';
}

export interface CustomerVisitActionState {
  available: boolean;
  reason: VisitBlockedReason | null;
  /** What to tell the client when the action is not available, naming whom to contact. */
  message: string | null;
}

export interface CustomerVisit {
  visit_key: string;
  opened_booking_id: string;
  /** More than one service: the screen shows the visit and its whole-visit actions. */
  multi_service: boolean;
  lead_booking_id: string | null;
  /** The live services' day, first start and true end; null when nothing is live. */
  span: { date: string; start: string; end: string } | null;
  /** 'cancelled' when every service is cancelled, else 'live'. */
  state: 'live' | 'cancelled';
  services: CustomerVisitService[];
  /** The lead business first. */
  businesses: CustomerVisitBusiness[];
  change: CustomerVisitActionState;
  cancel: CustomerVisitActionState;
  confirm: { available: boolean; confirmed: boolean };
}

export interface VisitChangeStart {
  start_time: string;
  services: { booking_id: string; start_time: string; end_time: string }[];
}

export interface VisitChangeOptions {
  can_change: boolean;
  blocked_reason: VisitBlockedReason | null;
  message: string | null;
  /** The day asked about, and the starts on it where the whole visit fits. */
  date: string | null;
  starts: VisitChangeStart[];
  /** Each live service's `updated_at`, sent back with the change so a visit changed meanwhile is refused. */
  expected: { booking_id: string; updated_at: string }[];
}

export interface VisitCancelBusinessPreview {
  venue_id: string;
  name: string;
  phone: string | null;
  refund_pence: number;
  kept_pence: number;
  card_hold_fee_kept_pence: number;
  notice_hours: number | null;
  /** One sentence for the client: what this business refunds or keeps, and why. */
  summary: string | null;
  services: { booking_id: string; service_name: string; booking_date: string; booking_time: string }[];
}

export interface VisitCancelPreview {
  can_cancel: boolean;
  blocked_reason: VisitBlockedReason | null;
  message: string | null;
  businesses: VisitCancelBusinessPreview[];
}

export interface VisitChangeBody {
  booking_date: string;
  booking_time: string;
  expected: { booking_id: string; updated_at: string }[];
}

export interface VisitChangeResult {
  success: true;
  message: string;
  booking_date: string;
  booking_time: string;
}

export interface VisitCancelResult {
  success: true;
  message: string;
  refund_message: string;
  card_hold_message: string | null;
  cancelled_booking_ids: string[];
}

export interface VisitConfirmResult {
  success: true;
  message: string;
  confirmed_booking_ids: string[];
}

function visitPath(bookingId: string, suffix = ''): string {
  return `/api/v1/me/visits/${encodeURIComponent(bookingId)}${suffix}`;
}

/** The visit `bookingId` belongs to. `enabled` is the detail's `in_visit`. */
export function useCustomerVisit(bookingId: string | null | undefined, enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.visit(bookingId ?? null, accessToken),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(bookingId) && enabled,
    queryFn: async (): Promise<CustomerVisit> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<CustomerVisit>(visitPath(bookingId), { accessToken });
    },
  });
}

/** Whether the whole visit can move and, for `date`, the starts where every service fits. */
export function useVisitChangeOptions(
  bookingId: string | null | undefined,
  date: string | null,
  enabled = true,
) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.visitChangeOptions(bookingId ?? null, date, accessToken),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(bookingId) && Boolean(date) && enabled,
    // The times free on a day go quickly, and `expected` must be fresh for the change to be accepted.
    staleTime: 0,
    queryFn: async (): Promise<VisitChangeOptions> => {
      if (!accessToken || !bookingId || !date) throw new Error('Missing booking');
      return apiFetch<VisitChangeOptions>(
        visitPath(bookingId, `/change-options?date=${encodeURIComponent(date)}`),
        { accessToken },
      );
    },
  });
}

/**
 * What cancelling the whole visit now would refund or keep, per business, worked out on the
 * server (plan 6.7 point 2). Read each time the cancel sheet opens, because the answer depends on
 * the time of day.
 */
export function useVisitCancelPreview(bookingId: string | null | undefined, enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.visitCancelPreview(bookingId ?? null, accessToken),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(bookingId) && enabled,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<VisitCancelPreview> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<VisitCancelPreview>(visitPath(bookingId, '/cancel-preview'), { accessToken });
    },
  });
}

/**
 * Every visit action changes the hub, the list, each service's detail and the visit itself, so
 * each invalidates the whole customer area (G27: the screens refetch after any booking action).
 */
function useInvalidateCustomerArea() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
  };
}

/** "I'm coming": confirms every live service of the visit (G3). */
export function useConfirmVisit(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateCustomerArea();

  return useMutation({
    mutationFn: async (): Promise<VisitConfirmResult> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<VisitConfirmResult>(visitPath(bookingId, '/confirm'), {
        accessToken,
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: invalidate,
  });
}

/**
 * Move the whole visit to a new start, keeping each service's person, length and offset. All or
 * nothing; 409 `visit_changed` when a service changed since the options were read.
 */
export function useChangeVisit(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateCustomerArea();

  return useMutation({
    mutationFn: async (body: VisitChangeBody): Promise<VisitChangeResult> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<VisitChangeResult>(visitPath(bookingId, '/change'), {
        accessToken,
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: invalidate,
  });
}

/** Cancel every live service of the visit, at every business, refunds first (plan 6.7). */
export function useCancelVisit(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateCustomerArea();

  return useMutation({
    mutationFn: async (): Promise<VisitCancelResult> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<VisitCancelResult>(visitPath(bookingId, '/cancel'), {
        accessToken,
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: invalidate,
  });
}
