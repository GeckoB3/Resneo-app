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
  variants?: AppointmentCatalogVariant[];
  addon_groups?: AppointmentCatalogAddonGroup[];
}

export interface ManagedServicesResponse {
  services: ManagedService[];
}

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
  is_active?: boolean;
}

export interface CreateServiceInput {
  name: string;
  duration_minutes: number;
  price_pence?: number;
  deposit_pence?: number;
  description?: string;
}
