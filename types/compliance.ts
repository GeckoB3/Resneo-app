/**
 * Compliance surfaces for appointments venues (plan-gated server-side).
 * @see _reference/reserve-ni/src/lib/compliance/dashboard-service.ts
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
  expiring_soon: ComplianceExpiringRow[];
  missing_for_bookings: ComplianceMissingRow[];
  awaiting_submission: ComplianceAwaitingRow[];
}

export interface ComplianceFormLink {
  id: string;
  guest_id: string;
  guest_name?: string | null;
  compliance_type_id: string;
  compliance_type_name?: string | null;
  status?: string;
  sent_via?: string | null;
  sent_at?: string | null;
  expires_at?: string | null;
  created_at?: string;
}

export interface ComplianceFormLinksResponse {
  links: ComplianceFormLink[];
}
