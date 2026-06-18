/**
 * GET /api/booking/appointment-catalog response shapes.
 * @see _reference/reserve-ni/src/lib/availability/appointment-catalog.ts
 */

import type { ServiceLocationType } from '@/types/services-manage';

export interface AppointmentCatalogVariant {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  sort_order: number;
}

export interface AppointmentCatalogAddon {
  id: string;
  name: string;
  description: string | null;
  additional_price_pence: number;
  additional_duration_minutes: number;
  sort_order: number;
}

export interface AppointmentCatalogAddonGroup {
  group: {
    id: string;
    name: string;
    prompt_to_client: string | null;
    description: string | null;
    selection_type: 'single' | 'multi';
    min_select: number;
    max_select: number | null;
    sort_order: number;
  };
  addons: AppointmentCatalogAddon[];
  link_sort_order: number;
}

export interface AppointmentCatalogService {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  cancellation_notice_hours?: number;
  /** Minimum lead time (hours) before a slot — same-day slots earlier than
   *  now + this are not bookable. Mirrors the web booking window. */
  min_booking_notice_hours?: number;
  /** When false, today is not bookable at all (web booking window). */
  allow_same_day_booking?: boolean;
  /** Where the service is delivered; 'client_address' makes the guest step collect an address. */
  location_type?: ServiceLocationType;
  variants?: AppointmentCatalogVariant[];
  addon_groups?: AppointmentCatalogAddonGroup[];
}

export interface AppointmentCatalogPractitioner {
  id: string;
  name: string;
  services: AppointmentCatalogService[];
}

export interface AppointmentCatalogResponse {
  practitioners: AppointmentCatalogPractitioner[];
}

/** Sentinel practitioner id for "any available" pooling — matches the web constant. */
export const ANY_AVAILABLE_PRACTITIONER_ID = '__any_available__';

/** Flattened row for the service picker — one entry per practitioner/service pair. */
export interface AppointmentServiceOption {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  pricePence: number | null;
  depositPence: number | null;
  /** A real practitioner id, or ANY_AVAILABLE_PRACTITIONER_ID for pooled rows. */
  practitionerId: string;
  practitionerName: string;
  addonGroups: AppointmentCatalogAddonGroup[];
  variants: AppointmentCatalogVariant[];
  /** Where the service is delivered; 'client_address' triggers the address fieldset. */
  locationType?: ServiceLocationType;
  /** Real practitioner ids backing an "any available" row (slots are merged client-side). */
  candidatePractitionerIds?: string[];
}
