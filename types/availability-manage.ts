/**
 * Practitioner time blocks + leave — staff availability management.
 * @see _reference/Resneo/src/app/api/venue/practitioner-calendar-blocks/route.ts
 * @see _reference/Resneo/src/app/api/venue/practitioner-leave/route.ts
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

/** Payload to PATCH /api/venue/practitioner-calendar-blocks/[id]. */
export interface UpdateBlockInput {
  blockId: string;
  block_date?: string;
  start_time?: string;
  end_time?: string;
  reason?: string | null;
}

/** Payload to PATCH /api/venue/practitioner-leave. */
export interface UpdateLeaveInput {
  id: string;
  start_date?: string;
  end_date?: string;
  leave_type?: LeaveType;
  notes?: string | null;
  unavailable_start_time?: string | null;
  unavailable_end_time?: string | null;
}

/** A single time range used in working hours / breaks. */
export interface TimeRange {
  start: string; // HH:mm
  end: string;   // HH:mm
}

/**
 * Working hours object: keys are ISO weekday numbers "0"=Sun … "6"=Sat,
 * values are time ranges (empty array = day off).
 */
export type WorkingHoursMap = Record<string, TimeRange[]>;

/** Per-day break map — same key convention as WorkingHoursMap. */
export type BreakTimesByDayMap = Record<string, TimeRange[]>;

/** Payload to PATCH /api/venue/practitioners. */
export interface PatchPractitionerInput {
  id: string;
  working_hours?: WorkingHoursMap;
  break_times?: TimeRange[];
  break_times_by_day?: BreakTimesByDayMap | null;
  name?: string;
  is_active?: boolean;
}
