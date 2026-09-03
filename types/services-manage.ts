import type { ServiceCategoryRef } from '@/lib/booking/service-categories';
import type {
  AppointmentCatalogAddonGroup,
  AppointmentCatalogVariant,
} from '@/types/appointment-catalog';

/** Where the service is delivered (mirrors the web `service_location_type`). */
export type ServiceLocationType = 'business_venue' | 'client_address' | 'online';

/**
 * One internal processing gap within the service core duration where the
 * practitioner is free for another booking. Matches the web/API JSON shape
 * (`{ id, start_minute, duration_minutes }`) — there is no `kind`/`offset`
 * field server-side; the gap before/after blocks is the "client-facing" time.
 * @see _reference/Resneo/src/lib/appointments/processing-time.ts
 */
export interface ProcessingTimeBlock {
  /** UUID when persisted; optional for freshly-added rows (API back-fills one). */
  id?: string;
  start_minute: number;
  duration_minutes: number;
}

/** Per-service custom availability schedule (versioned rule list). */
export interface ServiceCustomScheduleV2 {
  version: 2;
  rules: ServiceCustomRule[];
}

/** Time window as `HH:mm` strings. */
export interface ServiceTimeRange {
  start: string;
  end: string;
}

/** Day-keyed working hours: keys are `"0"`–`"6"` (0 = Sunday). */
export type ServiceWorkingHours = Record<string, ServiceTimeRange[]>;

/**
 * A single custom-availability rule. The mobile editor only writes `weekly`
 * rules; the other kinds are preserved on read/round-trip but edited on web.
 */
export type ServiceCustomRule =
  | { id: string; kind: 'weekly'; windows: ServiceWorkingHours }
  | { id: string; kind: 'specific_dates'; entries: { date: string; ranges: ServiceTimeRange[] }[] }
  | {
      id: string;
      kind: 'date_range_pattern';
      start_date: string;
      end_date: string;
      days_of_week: number[];
      ranges: ServiceTimeRange[];
    };

/**
 * Staff-facing service row from GET /api/venue/appointment-services.
 * @see _reference/reserve-ni/src/app/api/venue/appointment-services/route.ts
 */
export interface ManagedService {
  id: string;
  /**
   * Staff member who created the service. Non-admin staff may edit/delete ONLY
   * services they created (web parity — the API enforces the same rule and the
   * row carries `created_by_staff_id`). Null for legacy/admin-created rows.
   */
  created_by_staff_id?: string | null;
  name: string;
  description?: string | null;
  duration_minutes: number;
  buffer_minutes?: number | null;
  price_pence?: number | null;
  deposit_pence?: number | null;
  payment_requirement?: ServicePaymentRequirement | null;
  colour?: string | null;
  is_active?: boolean;
  sort_order?: number;
  /** Category heading on the booking pages; null or absent when uncategorised. */
  category_id?: string | null;
  max_advance_booking_days?: number | null;
  min_booking_notice_hours?: number | null;
  cancellation_notice_hours?: number | null;
  allow_same_day_booking?: boolean | null;
  /** Admin-set flags: which fields non-admin staff may override per-calendar. */
  staff_may_customize_name?: boolean;
  staff_may_customize_description?: boolean;
  staff_may_customize_duration?: boolean;
  staff_may_customize_buffer?: boolean;
  staff_may_customize_price?: boolean;
  staff_may_customize_deposit?: boolean;
  staff_may_customize_colour?: boolean;
  /**
   * Admin-only booking-start configuration. The service offers either an interval
   * grid (`booking_interval_minutes` + optional `booking_minute_marks`) or, when
   * `booking_start_times` is set, exactly those times of day — which replace the
   * grid entirely. The interval is still stored in that case so switching back
   * restores it.
   * @see lib/appointments/booking-interval.ts
   */
  booking_interval_minutes?: number | null;
  booking_minute_marks?: number[] | null;
  booking_start_times?: string[] | null;
  /** Admin-only: whether per-service custom availability schedule is enabled. */
  custom_availability_enabled?: boolean;
  /** Per-service custom availability schedule (versioned rule list or legacy map). */
  custom_working_hours?: ServiceCustomScheduleV2 | ServiceWorkingHours | null;
  /** Internal processing gaps inside the service core duration. */
  processing_time_blocks?: ProcessingTimeBlock[] | null;
  /** Where the service is delivered. */
  location_type?: ServiceLocationType | null;
  /** Online services: meeting link sent in booking emails. */
  online_meeting_url?: string | null;
  /** Online services: joining instructions shown with the link in emails. */
  online_meeting_info?: string | null;
  variants?: AppointmentCatalogVariant[];
  addon_groups?: AppointmentCatalogAddonGroup[];
}

/**
 * Calendar↔service link row from GET (table `practitioner_services`). The GET
 * route returns the row verbatim (`select('*')`), so it also carries the
 * per-calendar override columns a non-admin staff member set via
 * PATCH /api/venue/practitioner-service-overrides. All `custom_*` fields are
 * `null` when no override applies (the venue base then wins).
 * @see mergeServiceWithOverride
 */
export interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
  custom_name?: string | null;
  custom_description?: string | null;
  custom_duration_minutes?: number | null;
  custom_buffer_minutes?: number | null;
  custom_price_pence?: number | null;
  custom_deposit_pence?: number | null;
  custom_colour?: string | null;
}

export interface ManagedServicesResponse {
  services: ManagedService[];
  practitioner_services?: PractitionerServiceLink[];
  /** The venue's category headings in booking-page order (web 2026-09-02; absent on the legacy path). */
  categories?: ServiceCategoryRef[];
}

/**
 * `'card_hold'` (web 2026-07, spec D5/6.2): no payment at booking; the card is
 * stored and a no-show fee (kept in the same `deposit_pence` column) may be
 * charged. Only offered in editors when the venue's `card_hold_deposits`
 * feature flag is on.
 */
export type ServicePaymentRequirement = 'none' | 'deposit' | 'full_payment' | 'card_hold';

/**
 * Partial update for PATCH /api/venue/appointment-services.
 * NOTE: `variants` and `addon_group_links` are carried by `UpdateServiceBody`
 * (via `ServiceRelationsFields`), not here. The API replaces each array wholesale
 * when present, so callers must send the COMPLETE set; omit a field to leave that
 * relation untouched.
 */
export interface UpdateServiceInput {
  id: string;
  name?: string;
  description?: string | null;
  duration_minutes?: number;
  buffer_minutes?: number;
  price_pence?: number | null;
  deposit_pence?: number | null;
  payment_requirement?: ServicePaymentRequirement;
  colour?: string;
  is_active?: boolean;
  /** Category heading on the booking pages; `null` clears it. Must be one of the venue's. */
  category_id?: string | null;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
  /** Calendars offering this service — replace semantics on the API. */
  practitioner_ids?: string[];
  /** Admin-only: delegate per-field overrides to non-admin staff. */
  staff_may_customize_name?: boolean;
  staff_may_customize_description?: boolean;
  staff_may_customize_duration?: boolean;
  staff_may_customize_buffer?: boolean;
  staff_may_customize_price?: boolean;
  staff_may_customize_deposit?: boolean;
  staff_may_customize_colour?: boolean;
  /** Admin-only: per-service custom availability schedule. */
  custom_availability_enabled?: boolean;
  /**
   * Versioned schedule rule list. Only sent alongside `custom_availability_enabled`.
   * Pass `null` to clear when disabling.
   */
  custom_working_hours?: ServiceCustomScheduleV2 | ServiceWorkingHours | null;
  /**
   * Internal processing gaps inside the core duration (REPLACE semantics — the
   * API swaps the whole array). Only send when the user edited it.
   */
  processing_time_blocks?: ProcessingTimeBlock[];
  /** Where the service is delivered. */
  location_type?: ServiceLocationType;
  /** Online services: meeting link (http(s), ≤500 chars). Empty string/null clears it. */
  online_meeting_url?: string | null;
  /** Online services: joining instructions (≤2000 chars). */
  online_meeting_info?: string | null;
}

export interface CreateServiceInput {
  name: string;
  duration_minutes: number;
  description?: string;
  buffer_minutes?: number;
  price_pence?: number;
  deposit_pence?: number;
  payment_requirement?: ServicePaymentRequirement;
  colour?: string;
  is_active?: boolean;
  /** Category heading on the booking pages; omitted or `null` means none. */
  category_id?: string | null;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
  practitioner_ids?: string[];
  /** Admin-only: delegate per-field overrides to non-admin staff. */
  staff_may_customize_name?: boolean;
  staff_may_customize_description?: boolean;
  staff_may_customize_duration?: boolean;
  staff_may_customize_buffer?: boolean;
  staff_may_customize_price?: boolean;
  staff_may_customize_deposit?: boolean;
  staff_may_customize_colour?: boolean;
  /** Internal processing gaps inside the core duration. */
  processing_time_blocks?: ProcessingTimeBlock[];
  /** Admin-only: per-service custom availability schedule. */
  custom_availability_enabled?: boolean;
  custom_working_hours?: ServiceCustomScheduleV2 | ServiceWorkingHours | null;
  /** Where the service is delivered. */
  location_type?: ServiceLocationType;
  online_meeting_url?: string | null;
  online_meeting_info?: string | null;
}
