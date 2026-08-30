import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * What the customer already holds: memberships, class credits, courses and
 * standing weekly reservations.
 *
 * **These call `/api/account/*` directly, with no `/api/v1/me` alias, and that
 * is decision D3 rather than an oversight.** None of the commerce family is
 * aliased. The web's own C7b rule aliases on demand and observes that "the
 * versioned path is not what makes the app work", since a one-line re-export
 * cannot hold a shape stable while the route it forwards to changes. Adding
 * twenty aliases would have bought a tidier surface and no real protection, so
 * the calling convention here is deliberately mixed: `/api/v1/me/*` where an
 * alias exists, `/api/account/*` where one does not.
 */

export interface Venue {
  id: string;
  name: string;
}

export interface Membership {
  id: string;
  venue_id: string;
  product_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  /** How much of this period's allowance is left, computed server-side. */
  allowance_status?: { used: number; limit: number | null } | null;
}

export interface MembershipProduct {
  id: string;
  name: string;
  price_pence?: number | null;
}

interface MembershipsResponse {
  memberships: Membership[];
  products: MembershipProduct[];
  venues: Venue[];
}

export function useMemberships() {
  return useAccountQuery<MembershipsResponse>('/api/account/memberships', queryKeys.customer.memberships);
}

export interface CreditBalance {
  id: string;
  venue_id: string;
  product_id: string;
  credits_remaining: number;
  expires_at: string | null;
}

export interface CreditProduct {
  id: string;
  name: string;
  venue_id: string;
  credits_count: number | null;
  price_pence: number | null;
}

interface CreditsResponse {
  balances: CreditBalance[];
  products: MembershipProduct[];
  venues: Venue[];
  /**
   * What this customer could buy, scoped SERVER-SIDE to venues they have
   * actually been to. Not a shop: a venue they have never visited does not
   * appear, which is the web's own rule rather than a decision made here.
   */
  purchase_catalog?: { venues: Venue[]; products: CreditProduct[] };
}

export function useCredits() {
  return useAccountQuery<CreditsResponse>('/api/account/credits', queryKeys.customer.credits);
}

export interface CourseEnrollment {
  id: string;
  venue_id: string;
  status: string;
  course_name?: string | null;
  /** Sessions already attended and the total bought, when the server knows. */
  sessions_attended?: number | null;
  sessions_total?: number | null;
}

interface CoursesResponse {
  enrollments: CourseEnrollment[];
  venues: Venue[];
}

export function useCourses() {
  return useAccountQuery<CoursesResponse>('/api/account/courses', queryKeys.customer.courses);
}

export interface RecurringReservation {
  id: string;
  venue_id: string;
  class_type_id: string;
  status: string;
  /** 0 to 6, as the timetable stores it. */
  day_of_week?: number | null;
  start_time?: string | null;
}

interface RecurringResponse {
  reservations: RecurringReservation[];
  class_types: { id: string; name: string }[];
  venues: Venue[];
}

export function useRecurring() {
  return useAccountQuery<RecurringResponse>(
    '/api/account/class-recurring',
    queryKeys.customer.recurring,
  );
}

/** The shared shape of the four reads: Bearer, caller-scoped, no parameters. */
function useAccountQuery<T>(path: string, key: (t?: string | null) => readonly unknown[]) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: key(accessToken),
    enabled,
    queryFn: async (): Promise<T> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<T>(path, { accessToken });
    },
  });
}

/**
 * Everything commerce shares one invalidation.
 *
 * Cancelling a membership changes the hub's summary counts as well as the
 * memberships list, and enrolling on a course spends credits. Invalidating the
 * whole customer surface is coarse, but these are not hot paths and a stale
 * credit balance after spending one is the kind of thing people ring a venue
 * about.
 */
function useInvalidateCustomer() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
  };
}

function useAccountMutation<TArgs>(path: string, build: (args: TArgs) => unknown) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateCustomer();

  return useMutation({
    mutationFn: async (args: TArgs) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch(path, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(build(args)),
      });
    },
    onSuccess: invalidate,
  });
}

/** Stop a membership renewing. It stays usable until the period ends. */
export function useCancelMembership() {
  return useAccountMutation<{ membershipId: string }>('/api/account/memberships/cancel', (a) => ({
    membership_id: a.membershipId,
  }));
}

/**
 * Change your mind about a cancellation that has not taken effect yet.
 *
 * NOT a re-subscribe. It only clears a pending cancellation on a subscription
 * that is still running, so it cannot charge anybody; once Stripe reports the
 * subscription cancelled the server refuses, because reviving it would be a
 * purchase and a purchase needs its own consent.
 */
export function useResumeMembership() {
  return useAccountMutation<{ membershipId: string }>('/api/account/memberships/resume', (a) => ({
    membership_id: a.membershipId,
  }));
}

/** Leave a course. The server prorates any refund at cancel time. */
export function useCancelCourse() {
  return useAccountMutation<{ enrollmentId: string }>('/api/account/courses/cancel', (a) => ({
    enrollment_id: a.enrollmentId,
  }));
}

/**
 * Enrol on a course using credits already held.
 *
 * Server-only: no card is involved, which is why this works without the Stripe
 * SDK. Buying new credits is the part that needs one.
 */
export function useEnrollInCourse() {
  return useAccountMutation<{ courseId: string; venueId: string }>(
    '/api/account/courses/enroll',
    (a) => ({ course_id: a.courseId, venue_id: a.venueId }),
  );
}
