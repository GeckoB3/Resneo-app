/**
 * Practitioner time blocks + leave — staff availability management.
 * @see _reference/reserve-ni/src/app/api/venue/practitioner-calendar-blocks/route.ts
 * @see _reference/reserve-ni/src/app/api/venue/practitioner-leave/route.ts
 */
export interface PractitionerBlock {
  id: string;
  practitioner_id: string | null;
  calendar_id: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  block_type?: string;
  source?: string;
  class_instance_id?: string | null;
}

export interface PractitionerBlocksResponse {
  blocks: PractitionerBlock[];
}

export type LeaveType = 'annual' | 'sick' | 'other';

export interface LeavePeriod {
  id: string;
  practitioner_id: string;
  practitioner_name?: string;
  start_date: string;
  end_date: string;
  leave_type: LeaveType | string;
  notes: string | null;
  unavailable_start_time?: string | null;
  unavailable_end_time?: string | null;
}

export interface PractitionerLeaveResponse {
  periods: LeavePeriod[];
}
