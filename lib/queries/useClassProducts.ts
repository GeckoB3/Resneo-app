import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useVenueContext } from '@/providers/VenueProvider';
import type {
  CancelCourseEnrollmentInput,
  CancelCourseEnrollmentResult,
  ClassCommerceReports,
  ClassCourseProduct,
  ClassCourseProductInput,
  ClassCreditProduct,
  ClassCreditProductInput,
  ClassMembershipProduct,
  ClassMembershipProductInput,
  CourseEnrollmentsResponse,
  CourseFormState,
  CreditFormState,
  MembershipFormState,
  MembershipRules,
} from '@/types/class-products';

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

/**
 * Whether the venue may use Class products (credit packs / courses /
 * memberships). Mirrors the web `venueHasClassCommerceEnabled` gate's CLIENT
 * half: the merged `feature_flags.resolved.class_commerce_enabled` already folds
 * the env override into the per-venue `class_commerce_enabled` flag, so a single
 * read is enough to decide whether to surface the screen. The server still
 * enforces the full plan-tier + model + flag gate on every route (403 when off),
 * so this is a UI affordance, not a security boundary.
 *
 * Pure helper {@link deriveClassCommerceEnabled} is exported for tests.
 */
export function deriveClassCommerceEnabled(
  resolved: { class_commerce_enabled?: boolean } | null | undefined,
): boolean {
  return Boolean(resolved?.class_commerce_enabled);
}

/** Hook form of {@link deriveClassCommerceEnabled} — reads the venue context. */
export function useClassCommerceEnabled(): boolean {
  const { featureFlags } = useVenueContext();
  return deriveClassCommerceEnabled(featureFlags?.resolved);
}

// ---------------------------------------------------------------------------
// Query keys — defined LOCALLY (keys.ts is shared and frozen for this feature).
// Class products live under the bookings prefix so class mutations elsewhere
// (and the manual invalidations below) refresh them together.
// ---------------------------------------------------------------------------
export const classProductKeys = {
  credits: (accessToken?: string | null) =>
    [...queryKeys.bookings.all(), 'classCreditProducts', keyScope(accessToken)] as const,
  courses: (accessToken?: string | null) =>
    [...queryKeys.bookings.all(), 'classCourseProducts', keyScope(accessToken)] as const,
  memberships: (accessToken?: string | null) =>
    [...queryKeys.bookings.all(), 'classMembershipProducts', keyScope(accessToken)] as const,
  reports: (accessToken?: string | null) =>
    [...queryKeys.bookings.all(), 'classCommerceReports', keyScope(accessToken)] as const,
  enrollments: (accessToken?: string | null, courseId?: string | null) =>
    [
      ...queryKeys.bookings.all(),
      'classCourseEnrollments',
      keyScope(accessToken),
      courseId ?? null,
    ] as const,
};

/** Invalidate every class-product list + the reports KPIs after a write. */
function invalidateProducts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
}

interface ProductsEnvelope<T> {
  products?: T[];
}

// ---------------------------------------------------------------------------
// Credit packs
// ---------------------------------------------------------------------------

/** GET /api/venue/class-credit-products — credit packs for the venue (staff). */
export function useClassCreditProducts(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: classProductKeys.credits(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<ClassCreditProduct[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<ProductsEnvelope<ClassCreditProduct>>(
        '/api/venue/class-credit-products',
        { accessToken },
      );
      return data.products ?? [];
    },
  });
}

/** POST /api/venue/class-credit-products — create a credit pack. */
export function useCreateCreditProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClassCreditProductInput): Promise<ClassCreditProduct> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ product: ClassCreditProduct }>(
        '/api/venue/class-credit-products',
        { accessToken, method: 'POST', body: JSON.stringify(input) },
      );
      return data.product;
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** PATCH /api/venue/class-credit-products/[id] — update / archive a credit pack. */
export function useUpdateCreditProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: ClassCreditProductInput;
    }): Promise<ClassCreditProduct> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ product: ClassCreditProduct }>(
        `/api/venue/class-credit-products/${input.id}`,
        { accessToken, method: 'PATCH', body: JSON.stringify(input.patch) },
      );
      return data.product;
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** DELETE /api/venue/class-credit-products/[id] — 409 when balances exist. */
export function useDeleteCreditProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(`/api/venue/class-credit-products/${id}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/** GET /api/venue/class-course-products — fixed-session courses (staff). */
export function useClassCourseProducts(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: classProductKeys.courses(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<ClassCourseProduct[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<ProductsEnvelope<ClassCourseProduct>>(
        '/api/venue/class-course-products',
        { accessToken },
      );
      return data.products ?? [];
    },
  });
}

/** POST /api/venue/class-course-products — create a course. */
export function useCreateCourseProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClassCourseProductInput): Promise<ClassCourseProduct> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ product: ClassCourseProduct }>(
        '/api/venue/class-course-products',
        { accessToken, method: 'POST', body: JSON.stringify(input) },
      );
      return data.product;
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** PATCH /api/venue/class-course-products/[id] — update / archive a course. */
export function useUpdateCourseProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: ClassCourseProductInput;
    }): Promise<ClassCourseProduct> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ product: ClassCourseProduct }>(
        `/api/venue/class-course-products/${input.id}`,
        { accessToken, method: 'PATCH', body: JSON.stringify(input.patch) },
      );
      return data.product;
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** DELETE /api/venue/class-course-products/[id] — 409 with active enrollments. */
export function useDeleteCourseProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(`/api/venue/class-course-products/${id}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** GET .../[id]/enrollments — enrollees + per-session attendance for a course. */
export function useCourseEnrollments(courseId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && courseId !== null;

  return useQuery({
    queryKey: classProductKeys.enrollments(accessToken, courseId),
    enabled,
    queryFn: async (): Promise<CourseEnrollmentsResponse> => {
      if (!accessToken || !courseId) throw new Error('Missing access token or course');
      return apiFetch<CourseEnrollmentsResponse>(
        `/api/venue/class-course-products/${courseId}/enrollments`,
        { accessToken },
      );
    },
  });
}

/**
 * POST .../enrollments/[enrId]/cancel — staff-side enrollment cancel. Refunds
 * the Stripe PI by default when inside the window; `bypass_window` (admin)
 * force-cancels past it with NO auto-refund. Returns the refunded pence.
 */
export function useCancelCourseEnrollment() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CancelCourseEnrollmentInput,
    ): Promise<CancelCourseEnrollmentResult> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CancelCourseEnrollmentResult>(
        `/api/venue/class-course-products/${input.courseId}/enrollments/${input.enrollmentId}/cancel`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({
            bypass_window: input.bypass_window ?? false,
            cancel_reason: input.cancel_reason ?? null,
          }),
        },
      );
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

/** GET /api/venue/class-membership-products — recurring memberships (staff). */
export function useClassMembershipProducts(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: classProductKeys.memberships(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<ClassMembershipProduct[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<ProductsEnvelope<ClassMembershipProduct>>(
        '/api/venue/class-membership-products',
        { accessToken },
      );
      return data.products ?? [];
    },
  });
}

/** POST /api/venue/class-membership-products — create a membership. */
export function useCreateMembershipProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: ClassMembershipProductInput,
    ): Promise<ClassMembershipProduct> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ product: ClassMembershipProduct }>(
        '/api/venue/class-membership-products',
        { accessToken, method: 'POST', body: JSON.stringify(input) },
      );
      return data.product;
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** PATCH /api/venue/class-membership-products/[id] — update / archive. */
export function useUpdateMembershipProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: ClassMembershipProductInput;
    }): Promise<ClassMembershipProduct> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ product: ClassMembershipProduct }>(
        `/api/venue/class-membership-products/${input.id}`,
        { accessToken, method: 'PATCH', body: JSON.stringify(input.patch) },
      );
      return data.product;
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

/** DELETE /api/venue/class-membership-products/[id] — 409 with active subs. */
export function useDeleteMembershipProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(`/api/venue/class-membership-products/${id}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidateProducts(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** GET /api/venue/class-commerce-reports — outstanding credits + 30d checkout. */
export function useClassCommerceReports(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: classProductKeys.reports(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<ClassCommerceReports> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<ClassCommerceReports>('/api/venue/class-commerce-reports', {
        accessToken,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Pure payload mappers (form state → API body). Exported + unit-tested.
// They normalise the same way the web `creditPayload` / `coursePayload` /
// `membershipPayload` helpers do: pounds→pence, blank→null, empty arrays→null
// for "all classes", and currency pinned to 'gbp'.
// ---------------------------------------------------------------------------

/** "12.50"/"£12.50" → pence; non-finite/negative → 0 (matches web). */
export function poundsToPence(value: string): number {
  const n = Number(String(value).trim().replace('£', ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** A trimmed positive integer, else null. */
function optionalInt(value: string): number | null {
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Empty array → null ("all classes"); else the array. */
function eligibleOrNull(ids: string[]): string[] | null {
  return ids.length > 0 ? ids : null;
}

/** Credit-pack form state → POST/PATCH body. */
export function creditStateToPayload(s: CreditFormState): ClassCreditProductInput {
  const credits = Number(s.credits_count);
  return {
    name: s.name.trim(),
    description: s.description.trim() || null,
    credits_count: Number.isFinite(credits) ? Math.round(credits) : 0,
    price_pence: poundsToPence(s.price),
    validity_days: (() => {
      const v = optionalInt(s.validity_days);
      return v != null && v > 0 ? v : null;
    })(),
    eligible_class_type_ids: eligibleOrNull(s.eligible_class_type_ids),
    currency: 'gbp',
    active: s.active,
  };
}

/** Course form state → POST/PATCH body. */
export function courseStateToPayload(s: CourseFormState): ClassCourseProductInput {
  const cancellation = optionalInt(s.cancellation_window_days);
  return {
    name: s.name.trim(),
    description: s.description.trim() || null,
    price_pence: poundsToPence(s.price),
    max_enrollments: (() => {
      const v = optionalInt(s.max_enrollments);
      return v != null && v > 0 ? v : null;
    })(),
    session_instance_ids: s.session_instance_ids,
    cancellation_window_days: cancellation != null && cancellation >= 0 ? cancellation : null,
    currency: 'gbp',
    active: s.active,
  };
}

/** Membership form state → POST/PATCH body (incl. nested rules). */
export function membershipStateToPayload(s: MembershipFormState): ClassMembershipProductInput {
  const unlimited = s.unlimited;
  const rules: MembershipRules = {
    unlimited,
    allowance_per_period: unlimited ? null : optionalInt(s.allowance_per_period),
    rollover: s.rollover,
    rollover_limit: optionalInt(s.rollover_limit),
    discount_percent: optionalInt(s.discount_percent),
    eligible_class_type_ids: eligibleOrNull(s.eligible_class_type_ids),
    allow_recurring: s.allow_recurring,
    members_only_priority_hours: optionalInt(s.members_only_priority_hours),
    booking_window_days: optionalInt(s.booking_window_days),
  };

  const out: ClassMembershipProductInput = {
    name: s.name.trim(),
    description: s.description.trim() || null,
    currency: 'gbp',
    rules,
    active: s.active,
  };

  const manual = s.stripe_price_id.trim();
  if (manual) out.stripe_price_id = manual;

  const recurringPence = poundsToPence(s.recurring_price);
  const interval = s.recurring_interval;
  const count = Math.max(1, Number(s.recurring_interval_count) || 1);
  if (recurringPence > 0 && (interval === 'week' || interval === 'month' || interval === 'year')) {
    out.recurring_price_pence = recurringPence;
    out.recurring_interval = interval;
    out.recurring_interval_count = count;
    rules.recurring_interval = interval;
    rules.recurring_interval_count = count;
  }

  return out;
}
