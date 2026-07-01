/**
 * Compliance surfaces for appointments venues (plan-gated server-side).
 * @see _reference/Resneo/src/lib/compliance/dashboard-service.ts
 */
export interface ComplianceExpiringRow {
  id: string;
  guest_id: string;
  guest_name: string;
  compliance_type_id: string;
  compliance_type_name: string;
  expires_at: string;
  result: string | null;
}

export interface ComplianceMissingRow {
  booking_id: string;
  guest_id: string | null;
  guest_name: string;
  booking_date: string;
  booking_time: string | null;
  compliance_type_id: string;
  compliance_type_name: string;
  enforcement: string;
  state: string;
}

export interface ComplianceAwaitingRow {
  id: string;
  guest_id: string;
  guest_name: string;
  compliance_type_id: string;
  compliance_type_name: string;
  sent_via: string | null;
  sent_at: string | null;
  expires_at: string;
}

export interface ComplianceDashboardData {
  /** Venue-local "today" (YYYY-MM-DD) — the server's day-boundary source of truth. */
  today?: string;
  expiring_soon: ComplianceExpiringRow[];
  missing_for_bookings: ComplianceMissingRow[];
  awaiting_submission: ComplianceAwaitingRow[];
}

export interface ComplianceFormLink {
  id: string;
  guest_id: string;
  guest_name?: string | null;
  compliance_type_id: string;
  /** Flat name is never sent by the backend; the real name is under the nested join. */
  compliance_type_name?: string | null;
  /** Supabase compliance_types!inner(name) join the list route returns. */
  compliance_types?: import('./booking-compliance').ComplianceJoinedType;
  status?: string;
  sent_via?: string | null;
  sent_at?: string | null;
  expires_at?: string | null;
  created_at?: string;
  /** How many reminders have been sent for this link, and when the last one went out. */
  reminder_count?: number | null;
  last_reminded_at?: string | null;
}

export interface ComplianceFormLinksResponse {
  links: ComplianceFormLink[];
}

// ---------------------------------------------------------------------------
// Compliance types (schema / form definition)
// ---------------------------------------------------------------------------

export interface ComplianceFormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'date' | 'signature' | 'file' | string;
  label: string;
  required?: boolean;
  staff_only?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Per-field guidance shown under the label (web FormRenderer L117). */
  help_text?: string;
  /**
   * Seed value applied when capturing. Date fields accept the literal `'today'`
   * which resolves to the submission date; multiselect uses a string[].
   */
  default_value?: string | string[];
  /** Optional per-field max length (text/textarea). */
  max_length?: number;
}

/** Pass/fail result mapping carried on the form schema for `pass_fail` types. */
export interface ComplianceResultMapping {
  field: string;
  pass_values: string[];
  fail_values: string[];
}

export interface ComplianceFormSchema {
  schema_version?: string;
  title?: string;
  description?: string;
  intro_markdown?: string;
  fields: ComplianceFormField[];
  result_mapping?: ComplianceResultMapping;
}

/** GET /api/venue/compliance/types/[id] response */
export interface ComplianceTypeWithVersion {
  type: {
    id: string;
    name: string;
    category: string;
    result_type: string;
    validity_period_days: number | null;
    is_active: boolean;
  };
  version: {
    id: string;
    version_number: number;
    form_schema: ComplianceFormSchema;
  } | null;
}

// ---------------------------------------------------------------------------
// Compliance record detail (GET /api/venue/compliance/records/[id])
// ---------------------------------------------------------------------------

export interface ComplianceRecordDetail {
  id: string;
  compliance_type_id: string;
  status: 'completed' | 'expired' | 'voided';
  result: string | null;
  captured_at: string;
  expires_at: string | null;
  voided_at: string | null;
  voided_reason?: string | null;
  notes?: string | null;
  capture_channel: string;
  captured_by_staff_id: string | null;
  responses: Record<string, unknown>;
  compliance_types?:
    | { name?: string; category?: string; result_type?: string }
    | { name?: string; category?: string; result_type?: string }[]
    | null;
}

export interface ComplianceRecordDetailResponse {
  record: ComplianceRecordDetail;
  version: {
    version_number: number;
    form_schema: ComplianceFormSchema;
  } | null;
}

// ---------------------------------------------------------------------------
// Guest-level compliance history (GET /api/venue/guests/[guestId]/compliance)
// ---------------------------------------------------------------------------

export interface ComplianceAuditEvent {
  id: string;
  event_type: string;
  actor_type: string;
  actor_staff_id: string | null;
  compliance_record_id: string | null;
  compliance_type_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GuestComplianceResponse {
  records: import('./booking-compliance').ComplianceRecordRow[];
  form_links: ComplianceFormLink[];
  audit_events: ComplianceAuditEvent[];
}
