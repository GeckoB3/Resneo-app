/**
 * GET /api/booking/appointment-catalog response shapes.
 * @see _reference/reserve-ni/src/lib/availability/appointment-catalog.ts
 */

import type { ServiceCategoryRef } from '@/lib/booking/service-categories';
import type { ProcessingTimeBlock, ServiceLocationType } from '@/types/services-manage';

export interface AppointmentCatalogVariant {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  sort_order: number;
  /**
   * Internal processing gaps this option defines. When non-empty it REPLACES the
   * parent service's pattern (see `effectiveProcessingTemplate`).
   */
  processing_time_blocks?: ProcessingTimeBlock[];
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
  /** Deposit, or the no-show fee when `payment_requirement` is 'card_hold' (spec D5). */
  deposit_pence: number | null;
  /**
   * Resolved payment requirement ('none' | 'deposit' | 'full_payment' | 'card_hold').
   * The catalog resolves zero-fee holds to 'none' server-side (spec 6.3), so
   * 'card_hold' here implies a positive no-show fee is configured. Card hold is
   * a standard option for every venue; there is no venue flag to check.
   */
  payment_requirement?: string | null;
  cancellation_notice_hours?: number;
  /** Minimum lead time (hours) before a slot — same-day slots earlier than
   *  now + this are not bookable. Mirrors the web booking window. */
  min_booking_notice_hours?: number;
  /** When false, today is not bookable at all (web booking window). */
  allow_same_day_booking?: boolean;
  /** Where the service is delivered; 'client_address' makes the guest step collect an address. */
  location_type?: ServiceLocationType;
  /** Venue-chosen display order (lower first); the picker sorts by this, then name. */
  sort_order?: number;
  /** Category heading the venue lists this service under; null or absent when uncategorised. */
  category?: ServiceCategoryRef | null;
  /**
   * A member venue's own service on a collective's staff catalogue (web
   * 2026-09-05): not a combined-page offering, listed under a "{Venue} only"
   * heading, and booked as a plain booking in the owning venue. Absent
   * everywhere else.
   */
  venue_only?: boolean;
  /**
   * Whether the pooled "Any available" choice is offered for this service. The
   * collective catalogue sets it per offering (`allow_any_available`) and per
   * member venue for its own services; a venue's own catalogue omits it and the
   * venue flag decides. Only an explicit `false` withholds the option.
   */
  any_available?: boolean;
  variants?: AppointmentCatalogVariant[];
  addon_groups?: AppointmentCatalogAddonGroup[];
  /**
   * Internal processing gaps inside the core duration (salon-style: the
   * practitioner is free for another booking during them). The catalogue
   * pattern, which a booking snapshots at creation.
   */
  processing_time_blocks?: ProcessingTimeBlock[];
}

export interface AppointmentCatalogPractitioner {
  id: string;
  /** On a collective catalogue, qualified by venue when two members share a name (server-side). */
  name: string;
  services: AppointmentCatalogService[];
  /** The venue this calendar belongs to; only on a collective catalogue, where calendars span members. */
  owning_venue_id?: string;
  owning_venue_name?: string;
}

export interface AppointmentCatalogResponse {
  practitioners: AppointmentCatalogPractitioner[];
  /**
   * Every category the venue has, in booking-page order, including empty ones
   * (web 2026-09-02, additive). Absent on the legacy path; a venue with no
   * categories returns `[]`.
   */
  categories?: ServiceCategoryRef[];
}

/** Sentinel practitioner id for "any available" pooling — matches the web constant. */
export const ANY_AVAILABLE_PRACTITIONER_ID = '__any_available__';

/** Flattened row for the service picker — one entry per practitioner/service pair. */
export interface AppointmentServiceOption {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  /** Gap after the service before the next one — folds into the multi-service chain's
   *  consecutive-start check (the server validates each start = prev end + buffer). */
  buffer_minutes?: number;
  pricePence: number | null;
  depositPence: number | null;
  /** Resolved payment requirement of the service; 'card_hold' switches the staff toggle. */
  paymentRequirement?: string | null;
  /** A real practitioner id, or ANY_AVAILABLE_PRACTITIONER_ID for pooled rows. */
  practitionerId: string;
  practitionerName: string;
  addonGroups: AppointmentCatalogAddonGroup[];
  variants: AppointmentCatalogVariant[];
  /** Where the service is delivered; 'client_address' triggers the address fieldset. */
  locationType?: ServiceLocationType;
  /** Real practitioner ids backing an "any available" row (slots are merged client-side). */
  candidatePractitionerIds?: string[];
  /** Catalogue description, searched by the picker alongside the name and category. */
  description?: string | null;
  /** Venue drag order, so the grouped picker keeps it. */
  sortOrder?: number;
  /** Category heading on the booking pages; null when uncategorised. */
  category?: ServiceCategoryRef | null;
  /** The catalogue's per-service `any_available`; an explicit `false` withholds the pooled row. */
  anyAvailable?: boolean;
}
