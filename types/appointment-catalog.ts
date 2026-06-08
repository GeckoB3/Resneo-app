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
}

export interface AppointmentCatalogPractitioner {
  id: string;
  name: string;
  services: AppointmentCatalogService[];
}

export interface AppointmentCatalogResponse {
  practitioners: AppointmentCatalogPractitioner[];
}

/** Flattened row for the service picker — one entry per practitioner/service pair. */
export interface AppointmentServiceOption {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  pricePence: number | null;
  practitionerId: string;
  practitionerName: string;
}
