import type { BookingPageConfig } from '@/lib/booking/bookingPageConfig';
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
  | 'class_commerce_enabled';

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
 * Venue-level compliance general settings, persisted on
 * `feature_flags.compliance`. Field names mirror `complianceConfigSchema` in the
 * web app exactly (`C:\Resneo/src/lib/compliance/config.ts`) so the same stored
 * sub-object round-trips through both clients.
 */
export interface ComplianceConfig {
  /** Default capture method pre-selected when creating a new type. */
  default_capture_method: 'staff_in_venue' | 'client_online' | 'both';
  /** Default channel for sending form links. */
  default_form_link_channel: 'email' | 'sms' | 'both';
  /** Days before a record's expiry to remind the client (0 = no reminder). */
  reminder_cadence_days: number;
  /** Hours before a booking the client must complete required forms. */
  lock_period_hours: number;
  /** Venue-level form-link expiry override (days). Per-type override still wins. */
  form_link_expiry_days: number;
  /** Auto-send a form link when a booking is created with an unmet online-capturable requirement. */
  auto_send_on_booking: boolean;
  /** Behaviour when a client arrives with an incomplete required form (v1: warn only). */
  incomplete_behaviour: 'warn_only';
}

/**
 * Fully-defaulted compliance config (all keys present). Mirrors
 * `DEFAULT_COMPLIANCE_CONFIG` in the web app — keep the defaults in sync.
 */
export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  default_capture_method: 'both',
  default_form_link_channel: 'email',
  reminder_cadence_days: 7,
  lock_period_hours: 0,
  form_link_expiry_days: 14,
  auto_send_on_booking: false,
  incomplete_behaviour: 'warn_only',
};

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
  opening_hours?: OpeningHours | null;
  stripe_connected_account_id?: string | null;
  stripe_subscription_id?: string | null;
  require_account_login_for_bookings?: boolean;
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
