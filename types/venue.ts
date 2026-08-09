import type { BookingPageConfig } from '@/lib/booking/bookingPageConfig';
import type { ComplianceConfig } from '@/lib/compliance/config';
import type { StaffRole } from '@/types/staff';

export type { BookingPageConfig };

/** Primary booking models exposed by a venue. */
export type BookingModel =
  | 'table_reservation'
  | 'practitioner_appointment'
  | 'unified_scheduling'
  | 'event_ticket'
  | 'class_session'
  | 'resource_booking';

/** Label overrides for guest/booking/staff copy in the UI. */
export interface VenueTerminology {
  client: string;
  booking: string;
  staff: string;
  area?: string;
}

export type AppointmentsFeatureFlagKey =
  | 'waitlist_v2'
  | 'guest_self_reschedule'
  | 'any_available_practitioner'
  | 'compliance_records_enabled'
  | 'class_commerce_enabled'
  | 'card_hold_deposits'
  | 'staff_first_booking_flow';

/**
 * Appointment-waitlist mode stored on `feature_flags.waitlist_config.mode`.
 * Mirrors `APPOINTMENT_WAITLIST_MODES` in the web app
 * (`C:\Resneo/src/lib/booking/waitlist-config.ts`).
 */
export type AppointmentWaitlistMode = 'staff_choose' | 'notify_in_order' | 'notify_all';

/** Waitlist config sub-object stored alongside the boolean flags. */
export interface WaitlistConfig {
  mode: AppointmentWaitlistMode;
}

/**
 * Venue-level compliance general settings, persisted on `feature_flags.compliance`.
 * The schema + defaults live in the shared compliance config module (the single
 * source of truth, mirroring the web `complianceConfigSchema`); re-exported here
 * so existing `@/types/venue` import paths keep working. The retired
 * `auto_send_on_booking` toggle is gone (moved to per-requirement online_collection).
 */
export type { ComplianceConfig };
export { DEFAULT_COMPLIANCE_CONFIG } from '@/lib/compliance/config';

/**
 * Raw flags stored on `venues.feature_flags`. The boolean toggles are joined by
 * an intersection with the nested config sub-objects (`compliance`,
 * `waitlist_config`) the web app also stores there, so the booleans keep their
 * keyed-record typing while the configs stay optional.
 */
export type VenueFeatureFlagsRaw = Partial<
  Record<AppointmentsFeatureFlagKey, boolean>
> & {
  /** Venue compliance general settings (spec §3.3). */
  compliance?: ComplianceConfig;
  /** Appointment-waitlist mode config. */
  waitlist_config?: WaitlistConfig;
};

/** Env + venue merged flags returned by GET /api/venue. */
export type ResolvedAppointmentsFeatureFlags = Record<
  AppointmentsFeatureFlagKey,
  boolean
>;

export interface VenueFeatureFlagsPayload {
  raw: VenueFeatureFlagsRaw;
  resolved: ResolvedAppointmentsFeatureFlags;
}

/** One open/close period within a day (HH:mm). */
export interface OpeningHoursPeriod {
  open: string;
  close: string;
}

/** One day: closed, or 1–2 service periods. Keys "0" (Sun) … "6" (Sat). */
export type OpeningHoursDay =
  | { closed: true }
  | { closed?: false; periods: OpeningHoursPeriod[] };

export type OpeningHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', OpeningHoursDay>>;

/**
 * Venue payload for auth gate, shell bootstrap and the More/settings pages.
 * Subset of GET /api/venue.
 * @see _reference/reserve-ni/src/app/api/venue/route.ts
 */
export interface VenueBootstrap {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logo_url: string | null;
  booking_model: BookingModel;
  active_booking_models: BookingModel[];
  enabled_models: BookingModel[];
  pricing_tier: string | null;
  terminology: VenueTerminology | null;
  current_user_role: StaffRole;
  feature_flags: VenueFeatureFlagsPayload;
  /** Settings fields (present on full GET; optional for older cached payloads). */
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  /**
   * Google review request on the post-visit thank-you email. The URL is stored
   * canonicalised by the server (see `lib/reviews/google-review-link.ts`); the
   * toggle is off for every existing venue and cannot be turned on without a
   * usable link. Each guest is asked at most once every six months.
   */
  google_review_url?: string | null;
  review_request_enabled?: boolean;
  opening_hours?: OpeningHours | null;
  stripe_connected_account_id?: string | null;
  stripe_subscription_id?: string | null;
  require_account_login_for_bookings?: boolean;
  /**
   * In-person payments (Tap to Pay / Terminal) master switch (§6.7). When false
   * or absent, the app renders NO payment surface and makes no Terminal calls —
   * the frictionless-off hard requirement (§1.3/§3.2).
   */
  in_person_payments_enabled?: boolean;
  /**
   * Derived server-side (§6.6): `in_person_payments_enabled && stripe account
   * connected`. Gates the card options; the connection-token 400 stays the
   * authoritative capability check.
   */
  card_present_ready?: boolean;
  no_show_grace_minutes?: number | null;
  cover_photo_url?: string | null;
  cuisine_type?: string | null;
  plan_status?: string | null;
  /** Email the owner when a new booking comes in (Communications owner-alert). */
  owner_booking_notification_enabled?: boolean;
  /** Recipient for the owner booking alert; falls back to the venue email server-side. */
  owner_booking_notification_email?: string | null;
  /** Accent colour (hex) applied to the embeddable booking widget. */
  embed_accent_colour?: string | null;
  /** Price band £/££/£££ (non-appointments venues). */
  price_band?: string | null;
  /** Kitchen digest email (non-appointments venues). */
  kitchen_email?: string | null;
  /**
   * Public booking-page branding blob (colours, fonts, copy, tab visibility,
   * per-service photos). Edited by the in-app booking-page editor; the server
   * re-sanitises + merges it on PATCH /api/venue.
   */
  booking_page_config?: BookingPageConfig | null;
}
