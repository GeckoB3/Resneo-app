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
  | 'any_available_practitioner';

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

/**
 * Minimal venue payload for auth gate and shell bootstrap (Phase 1–2).
 * Subset of GET /api/venue — expand as settings and booking flows land.
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
}
