import type {
  AppointmentCatalogAddonGroup,
  AppointmentCatalogVariant,
} from '@/types/appointment-catalog';

/**
 * Staff-facing service row from GET /api/venue/appointment-services.
 * @see _reference/reserve-ni/src/app/api/venue/appointment-services/route.ts
 */
export interface ManagedService {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  buffer_minutes?: number | null;
  price_pence?: number | null;
  deposit_pence?: number | null;
  payment_requirement?: 'none' | 'deposit' | 'full_payment' | null;
  colour?: string | null;
  is_active?: boolean;
  sort_order?: number;
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
  /** Admin-only: whether per-service custom availability schedule is enabled. */
  custom_availability_enabled?: boolean;
  variants?: AppointmentCatalogVariant[];
  addon_groups?: AppointmentCatalogAddonGroup[];
}

/** Calendar↔service link row from GET (table `practitioner_services`). */
export interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
}

export interface ManagedServicesResponse {
  services: ManagedService[];
  practitioner_services?: PractitionerServiceLink[];
}

export type ServicePaymentRequirement = 'none' | 'deposit' | 'full_payment';

/**
 * Partial update for PATCH /api/venue/appointment-services.
 * IMPORTANT: never include `variants` or `addon_group_links` here — the API
 * replaces those arrays wholesale, so sending `[]` would wipe them. Omitting
 * the fields preserves the current values.
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
}
