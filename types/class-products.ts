/**
 * Class-commerce ("Class products") types for the staff app. Mirrors the four
 * Bearer-capable route groups the web `ClassCommerceProductsClient` consumes:
 *   - GET/POST            /api/venue/class-credit-products
 *   - PATCH/DELETE        /api/venue/class-credit-products/[id]
 *   - GET/POST            /api/venue/class-course-products
 *   - PATCH/DELETE        /api/venue/class-course-products/[id]
 *   - GET                 /api/venue/class-course-products/[id]/enrollments
 *   - POST                /api/venue/class-course-products/[id]/enrollments/[enrId]/cancel
 *   - GET/POST            /api/venue/class-membership-products
 *   - PATCH/DELETE        /api/venue/class-membership-products/[id]
 *   - GET                 /api/venue/class-commerce-reports
 *
 * Field names/shapes are taken from the WEB zod schemas
 * (`C:\Resneo/src/lib/class-commerce/product-schemas.ts`) and the route handlers,
 * NOT from the web view-model, so the same stored rows round-trip through both
 * clients. Every route is gated by `requireClassCommercePlan`, so an off-plan or
 * flag-off venue gets a 403 (surfaced gracefully, never fatal).
 *
 * @see _reference/Resneo/src/app/dashboard/class-timetable/products/ClassCommerceProductsClient.tsx
 */

// ---------------------------------------------------------------------------
// Credit packs
// ---------------------------------------------------------------------------

/** One credit-pack row from GET /api/venue/class-credit-products `products`. */
export interface ClassCreditProduct {
  id: string;
  name: string;
  description: string | null;
  credits_count: number;
  price_pence: number;
  currency: string;
  validity_days: number | null;
  eligible_class_type_ids: string[] | null;
  active: boolean;
}

/** POST/PATCH body for a credit pack (PATCH = all-optional partial). */
export interface ClassCreditProductInput {
  name?: string;
  description?: string | null;
  credits_count?: number;
  price_pence?: number;
  currency?: string;
  validity_days?: number | null;
  eligible_class_type_ids?: string[] | null;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/** One course row from GET /api/venue/class-course-products `products`. */
export interface ClassCourseProduct {
  id: string;
  name: string;
  description: string | null;
  price_pence: number;
  currency: string;
  max_enrollments: number | null;
  /** ISO timestamp (datetime) or null = open now. */
  opens_at: string | null;
  /** ISO timestamp (datetime) or null = no close. */
  closes_at: string | null;
  session_instance_ids: string[];
  /** Days before the first session a guest can self-cancel; null = non-refundable. */
  cancellation_window_days: number | null;
  active: boolean;
}

/** POST/PATCH body for a course (PATCH = all-optional partial). */
export interface ClassCourseProductInput {
  name?: string;
  description?: string | null;
  price_pence?: number;
  currency?: string;
  max_enrollments?: number | null;
  opens_at?: string | null;
  closes_at?: string | null;
  session_instance_ids?: string[];
  cancellation_window_days?: number | null;
  active?: boolean;
}

/** Best-effort guest display fields attached to each enrollment row. */
export interface CourseEnrollmentGuest {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

/** One enrollment from GET .../[id]/enrollments `enrollments`. */
export interface CourseEnrollment {
  id: string;
  user_id: string;
  /** 'pending_payment' | 'active' | 'cancelled' | 'completed' (free-form server side). */
  status: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  guest: CourseEnrollmentGuest | null;
}

/** One per-session attendance link from `session_enrollments`. */
export interface CourseSessionEnrollment {
  id: string;
  enrollment_id: string;
  class_instance_id: string;
  /** 'scheduled' | 'attended' | 'cancelled' | 'no_show'. */
  status: string;
}

/** GET /api/venue/class-course-products/[id]/enrollments response. */
export interface CourseEnrollmentsResponse {
  product: {
    id: string;
    name: string;
    cancellation_window_days: number | null;
    session_instance_ids: string[] | null;
  };
  enrollments: CourseEnrollment[];
  session_enrollments: CourseSessionEnrollment[];
}

/** POST body for cancelling a course enrollment. */
export interface CancelCourseEnrollmentInput {
  courseId: string;
  enrollmentId: string;
  /** Force-cancel past the refund window (admin) — NO auto-refund when set. */
  bypass_window?: boolean;
  cancel_reason?: string | null;
}

/** Response from .../enrollments/[enrId]/cancel. */
export interface CancelCourseEnrollmentResult {
  ok?: boolean;
  already_cancelled?: boolean;
  /** Pence refunded to the guest (0 when none issued). */
  refund_amount_pence?: number;
  /** ISO date the window closed (echoed on success + on the 409). */
  cancel_by_date?: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

/** Membership recurring-billing interval. */
export type MembershipRecurringInterval = 'week' | 'month' | 'year';

/** Allowance/billing rules stored in `class_membership_products.rules` (jsonb). */
export interface MembershipRules {
  unlimited?: boolean;
  allowance_per_period?: number | null;
  rollover?: boolean;
  rollover_limit?: number | null;
  discount_percent?: number | null;
  eligible_class_type_ids?: string[] | null;
  allow_recurring?: boolean;
  members_only_priority_hours?: number | null;
  booking_window_days?: number | null;
  recurring_interval?: MembershipRecurringInterval;
  recurring_interval_count?: number;
}

/** One membership row from GET /api/venue/class-membership-products `products`. */
export interface ClassMembershipProduct {
  id: string;
  name: string;
  description: string | null;
  stripe_price_id: string | null;
  stripe_product_id?: string | null;
  currency: string;
  rules: MembershipRules;
  active: boolean;
}

/** POST/PATCH body for a membership (PATCH = all-optional partial). */
export interface ClassMembershipProductInput {
  name?: string;
  description?: string | null;
  /** Manual Stripe Price id; overrides auto-billing when set. */
  stripe_price_id?: string | null;
  currency?: string;
  rules?: MembershipRules;
  active?: boolean;
  /** Auto-billing: pence/period — server creates the Stripe Product + Price. */
  recurring_price_pence?: number;
  recurring_interval?: MembershipRecurringInterval;
  recurring_interval_count?: number;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** GET /api/venue/class-commerce-reports response. */
export interface ClassCommerceReports {
  venue_id?: string;
  /** Remaining credit units across all guest balances. */
  outstanding_credit_units: number;
  /** Class-commerce PaymentIntent total over the last 30 days (pence). */
  checkout_amount_pence_30d: number;
  generated_at?: string;
}

// ---------------------------------------------------------------------------
// Picklist options (sourced from GET /api/venue/classes)
// ---------------------------------------------------------------------------

/** A class type option for the "eligible classes" multi-selects. */
export interface ClassTypeOption {
  id: string;
  name: string;
  is_active?: boolean;
}

/** A (non-cancelled) class session option for the course session picker. */
export interface ClassInstanceOption {
  id: string;
  class_type_id: string;
  /** YYYY-MM-DD */
  instance_date: string;
  /** HH:mm[:ss] */
  start_time: string;
  booked_spots?: number | null;
  is_cancelled?: boolean;
}

// ---------------------------------------------------------------------------
// Form state shapes (string-keyed, what the editor sheets bind to)
// ---------------------------------------------------------------------------

/** Credit-pack editor form state (all strings for text inputs). */
export interface CreditFormState {
  name: string;
  description: string;
  credits_count: string;
  /** Pounds, e.g. "90" or "45.50". */
  price: string;
  validity_days: string;
  eligible_class_type_ids: string[];
  active: boolean;
}

/** Course editor form state. */
export interface CourseFormState {
  name: string;
  description: string;
  /** Pounds. */
  price: string;
  max_enrollments: string;
  session_instance_ids: string[];
  cancellation_window_days: string;
  active: boolean;
}

/** Membership editor form state. */
export interface MembershipFormState {
  name: string;
  description: string;
  /** Pounds/period for auto-billing; blank to use the manual price id. */
  recurring_price: string;
  recurring_interval: MembershipRecurringInterval;
  recurring_interval_count: string;
  stripe_price_id: string;
  allowance_per_period: string;
  rollover_limit: string;
  discount_percent: string;
  booking_window_days: string;
  members_only_priority_hours: string;
  eligible_class_type_ids: string[];
  unlimited: boolean;
  rollover: boolean;
  allow_recurring: boolean;
  active: boolean;
}
