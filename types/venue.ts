import type { StaffRole } from '@/types/staff';

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

/** Raw flags stored on `venues.feature_flags`. */
export type VenueFeatureFlagsRaw = Partial<
  Record<AppointmentsFeatureFlagKey, boolean>
>;

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
}
