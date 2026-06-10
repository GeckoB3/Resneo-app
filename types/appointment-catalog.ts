/**
 * GET /api/booking/appointment-catalog response shapes.
 * @see _reference/reserve-ni/src/lib/availability/appointment-catalog.ts
 */

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
  /** Real practitioner ids backing an "any available" row (slots are merged client-side). */
  candidatePractitionerIds?: string[];
}
