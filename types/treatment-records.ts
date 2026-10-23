/**
 * Treatment records (web `Docs/treatment-records-plan.md`, §7.2 and Appendix B): hand-written
 * subsets of what the routes answer, so an additive field on the web never breaks the app.
 * @see _reference/Resneo/src/app/api/venue/treatment-records/route.ts
 * @see _reference/Resneo/src/components/dashboard/treatment-records/api.ts
 */

export type TreatmentPhotoLabel = 'before' | 'after' | 'chart' | 'other';
export type TreatmentProductUnit = 'units' | 'ml' | 'syringes' | 'vials' | 'g';
export type TreatmentChangedField = 'note' | 'treated_at' | 'service' | 'practitioner' | 'products' | 'photos';

/** One record in a list (GET /api/venue/treatment-records?guest_id= or ?booking_id=). */
export interface TreatmentRecordSummary {
  id: string;
  treated_at: string;
  created_at: string;
  service_item_id: string | null;
  service_name: string | null;
  booking_id: string | null;
  practitioner_calendar_id: string | null;
  practitioner_name: string | null;
  author_name: string | null;
  author_venue_id: string;
  author_venue_name: string | null;
  last_edited_by_name: string | null;
  last_edited_at: string;
  version_count: number;
  product_count: number | null;
  photo_count: number | null;
  first_photo_preview_url: string | null;
}

export interface TreatmentRecordsListResponse {
  records: TreatmentRecordSummary[];
  /** The records belong to a linked venue (read through the link). */
  linked: boolean;
}

/** A "Products used" row. */
export interface TreatmentProductLine {
  id?: string;
  position?: number;
  product_name: string;
  batch_number: string | null;
  expiry_date: string | null;
  amount: number | null;
  unit: TreatmentProductUnit | null;
  area: string | null;
}

export interface TreatmentRecordPhoto {
  id: string;
  label: TreatmentPhotoLabel;
  mime_type: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
  preview_url: string | null;
}

export interface ClientAlert {
  id: string;
  text: string;
  created_by_name: string | null;
  created_at: string;
  removed_at?: string | null;
  removed_by_name?: string | null;
}

/** GET /api/venue/treatment-records/[id]. */
export interface TreatmentRecordDetail {
  record: TreatmentRecordSummary & {
    note: string;
    version: number;
    copied_from_record_id: string | null;
    updated_at: string;
    deleted_at: string | null;
    deleted_by_name: string | null;
    deleted_reason: string | null;
  };
  products: TreatmentProductLine[];
  photos: TreatmentRecordPhoto[];
  alerts: ClientAlert[];
  can_edit: boolean;
  can_delete: boolean;
  can_restore: boolean;
  can_see_views: boolean;
}

export type TreatmentFormState = 'valid' | 'expired' | 'missing';

/** GET /api/venue/treatment-records/context?booking_id= or ?guest_id=: everything a new record needs. */
export interface TreatmentEditorContext {
  client: { guest_id: string; name: string };
  alerts: { id: string; text: string }[];
  service: { service_item_id: string | null; name: string; template_text: string | null } | null;
  practitioner: { calendar_id: string; name: string } | null;
  treated_at: string | null;
  last_record: { id: string; treated_at: string; service_name: string | null } | null;
  /** Null when Compliance is off at the owning venue. */
  forms: {
    requirements: { compliance_type_id: string; name: string; state: TreatmentFormState; completed_at: string | null }[];
    photo_consent: { state: 'valid' | 'missing'; completed_at: string | null; compliance_type_id: string | null; name: string | null };
  } | null;
  practitioners: { calendar_id: string; name: string }[];
  services: { service_item_id: string; name: string }[];
  linked: boolean;
  owner_venue_id: string;
}

/** GET /api/venue/treatment-records/suggestions. */
export interface TreatmentSuggestions {
  product_names: string[];
  batches: { product_name: string; batch_number: string; expiry_date: string | null }[];
  /** Professional-use products from Checkout, listed under "From your products" (TR29). */
  from_your_products: string[];
}

/** GET /api/venue/treatment-records/[id]/versions. */
export interface TreatmentVersionsResponse {
  current: { version: number; edited_by_name: string | null; edited_at: string; changed_fields: TreatmentChangedField[] };
  versions: {
    id: string;
    captured_version: number;
    edited_by_name: string | null;
    edited_by_venue_name: string | null;
    edited_at: string;
    changed_fields: TreatmentChangedField[];
    note: string;
    treated_at: string;
    service_name: string | null;
    practitioner_name: string | null;
    products: TreatmentProductLine[];
    photos: { id: string; label: TreatmentPhotoLabel; preview_url: string | null }[];
  }[];
}

/** GET /api/venue/treatment-records/switch. */
export interface TreatmentRecordsSwitchState {
  treatment_records_enabled: boolean;
  linked_venues: { venue_id: string; name: string }[];
  acknowledgement_version: string;
}
