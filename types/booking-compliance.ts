/**
 * GET /api/venue/bookings/[id]/compliance — resolved requirement state +
 * the guest's compliance records.
 * @see _reference/Resneo/src/app/api/venue/bookings/[id]/compliance/route.ts
 * @see _reference/Resneo/src/components/dashboard/compliance/shared.ts
 */

export type ComplianceRequirementState =
  | 'satisfied'
  | 'expiring_soon'
  | 'expired'
  | 'missing'
  | 'not_applicable';

export interface ComplianceRecordRef {
  id: string;
  status: string;
  result: string | null;
  captured_at: string;
  expires_at: string | null;
  captured_by_staff_id: string | null;
}

export interface ResolvedRequirementData {
  requirement: {
    id: string;
    compliance_type_id: string;
    compliance_type_name: string;
    enforcement: string;
    lock_period_hours: number | null;
    type_is_active: boolean;
  };
  state: ComplianceRequirementState;
  lock_blocked: boolean;
  matching_record: ComplianceRecordRef | null;
  latest_record: ComplianceRecordRef | null;
}

/** Supabase `name`/`category` join — object or single-element array. */
export type ComplianceJoinedType =
  | { name?: string; category?: string }
  | { name?: string; category?: string }[]
  | null
  | undefined;

export interface ComplianceRecordRow {
  id: string;
  compliance_type_id: string;
  status: 'completed' | 'expired' | 'voided';
  result: string | null;
  captured_at: string;
  expires_at: string | null;
  voided_at: string | null;
  notes?: string | null;
  capture_channel: string;
  captured_by_staff_id: string | null;
  compliance_types?: ComplianceJoinedType;
}

export interface BookingComplianceResponse {
  applicable: boolean;
  requirements: ResolvedRequirementData[];
  records: ComplianceRecordRow[];
}

export function complianceJoinedTypeName(join: ComplianceJoinedType): string {
  const t = Array.isArray(join) ? join[0] : join;
  return t?.name ?? 'Compliance record';
}
