/**
 * Full resource shape for the in-app resource setup/editing flow.
 *
 * A resource is a `unified_calendars` row with `calendar_type === 'resource'`.
 * The fields here mirror the GET/POST/PATCH /api/venue/resources zod schema and
 * the web dashboard's Resource Timeline form.
 *
 * @see _reference/Resneo/src/app/dashboard/resource-timeline/ResourceTimelineView.tsx
 * @see _reference/Resneo/src/lib/booking/resource-booking-defaults.ts
 */

export type ResourcePaymentRequirement = 'none' | 'deposit' | 'full_payment';

/** One per-weekday availability range (`availability_hours` keyed "0"–"6", Sun–Sat). */
export interface ResourceHoursRange {
  start: string;
  end: string;
}

/** Map of weekday key ("0"–"6") to that day's single availability range (web uses one range/day). */
export type ResourceAvailabilityHours = Record<string, ResourceHoursRange[]>;

/** The full resource record returned by GET /api/venue/resources. */
export interface Resource {
  id: string;
  name: string;
  /** Free-text category (e.g. "Tennis Court", "Meeting Room"); null when unset. */
  resource_type: string | null;
  /** Host (non-resource) calendar column this resource appears on. Required by the API. */
  display_on_calendar_id: string | null;
  /** Spacing of bookable start times (minutes, 5–480). */
  slot_interval_minutes: number;
  /** Shortest bookable length (minutes, 15–480). */
  min_booking_minutes: number;
  /** Longest bookable length (minutes, 15–1440). */
  max_booking_minutes: number;
  /** Price per slot in pence, or null for free. */
  price_per_slot_pence: number | null;
  payment_requirement: ResourcePaymentRequirement;
  /** Fixed deposit in pence (deposit mode only), else null. */
  deposit_amount_pence: number | null;
  is_active: boolean;
  /** Per-weekday availability ("0"–"6"); only enabled days are present. */
  availability_hours: ResourceAvailabilityHours | null;
  /** Date-specific overrides (deferred in-app — server defaults to {}). */
  availability_exceptions?: Record<
    string,
    { closed: true } | { periods: ResourceHoursRange[] }
  > | null;
  sort_order: number;
  /** Hex column colour, when set. */
  colour?: string | null;
  // Guest booking window
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
}

/** GET /api/venue/resources response. */
export interface ResourcesManageResponse {
  resources: Resource[];
}

/** Shared write fields for POST + PATCH (PATCH also carries `id`). */
export interface ResourceWriteInput {
  name: string;
  resource_type?: string;
  display_on_calendar_id: string;
  slot_interval_minutes: number;
  min_booking_minutes: number;
  max_booking_minutes: number;
  /** Price per slot in pence; `null` clears it (free) on PATCH, omit to leave unchanged. */
  price_per_slot_pence?: number | null;
  payment_requirement: ResourcePaymentRequirement;
  deposit_amount_pence: number | null;
  is_active: boolean;
  availability_hours: ResourceAvailabilityHours;
  /** Date-specific overrides ("YYYY-MM-DD" → closed / amended single range); `{}` when none. */
  availability_exceptions: Resource['availability_exceptions'];
  max_advance_booking_days: number;
  min_booking_notice_hours: number;
  cancellation_notice_hours: number;
  allow_same_day_booking: boolean;
}

/** POST body — the write fields (server defaults `availability_exceptions` to {}). */
export type CreateResourceInput = ResourceWriteInput;
/** PATCH body — partial write fields plus the target id. */
export type UpdateResourceInput = Partial<ResourceWriteInput> & { id: string };
