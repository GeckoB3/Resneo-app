/**
 * Guest directory row from GET /api/venue/guests.
 * @see _reference/Resneo/src/app/api/venue/guests/route.ts
 */
export interface GuestListItem {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  visit_count: number;
  no_show_count: number;
  last_visit_date: string | null;
  created_at?: string;
  /** 'identified' | 'anonymous' — identifies walk-ins vs full contacts. */
  identifiability_tier?: string;
  next_booking_date: string | null;
  next_booking_time: string | null;
  total_bookings: number;
  upcoming_booking_count: number;
  cancelled_count?: number;
  paid_deposit_pence?: number;
  marketing_opt_out?: boolean;
  marketing_consent?: boolean;
  /**
   * Per-contact custom field values, keyed by `field_key`. Only returned when the
   * request sets `include_custom_fields=1` (used by the CSV export).
   */
  custom_fields?: Record<string, unknown>;
}

export interface GuestListResponse {
  guests: GuestListItem[];
  total: number;
  page: number;
  limit: number;
  total_count: number;
}

export interface GuestListParams {
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  /** Filter to contacts carrying this tag (segment=tag). */
  segmentTag?: string;
  /** Segment filter: 'all' | 'new' | 'upcoming' | 'visit' | 'marketing' | 'last_staff' | 'last_service' | 'tag' */
  segment?: string;
  /** Date range for segment filters (ISO date strings). */
  date_from?: string;
  date_to?: string;
  /** Marketing consent filter: 'subscribed' | 'not_subscribed' (backend only accepts these). */
  marketing?: string;
  /** Staff member UUID for last_staff segment. */
  last_staff_id?: string;
  /** Service UUID for last_service segment. */
  last_service_id?: string;
  /**
   * Service kind for the last_service segment. The backend RPC returns zero rows
   * when `last_service_id` is sent without this — 'service_item' for unified
   * venues, 'appointment_service' otherwise.
   */
  last_service_kind?: 'service_item' | 'appointment_service';
  /** Identity scope: 'identified' | 'all' | 'anonymous' */
  filter?: string;
  /** When true, send `include_custom_fields=1` so rows carry `custom_fields` (CSV export). */
  include_custom_fields?: boolean;
}

/**
 * Venue custom client field definition from GET /api/venue/contacts/custom-fields.
 * Used by the CSV export to label/extract per-contact custom field values.
 */
export interface ContactCustomFieldDefinition {
  id: string;
  venue_id: string;
  field_name: string;
  field_key: string;
  field_type: 'text' | 'number' | 'date' | 'boolean';
  is_active: boolean;
  created_at?: string;
}

export interface ContactCustomFieldsResponse {
  fields: ContactCustomFieldDefinition[];
}

/**
 * A row in the flattened A–Z contacts list. The list is a single FlatList of
 * `header` and `contact` rows (NOT a SectionList — sticky SectionList headers
 * crash on Android/Fabric). Sticky letter headers are driven by
 * `stickyHeaderIndices` computed from where the `header` rows land.
 */
export type ContactListRow =
  | { type: 'header'; letter: string; key: string }
  | { type: 'contact'; guest: GuestListItem; key: string };
