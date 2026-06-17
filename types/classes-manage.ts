/**
 * Staff-facing class management types for GET/POST/PATCH/DELETE
 * /api/venue/classes (+ /api/venue/class-instances). Bearer-capable routes,
 * multiplexed by `entity_type` ('class_type' | 'timetable' | 'instance').
 *
 * @see _reference/Resneo/src/app/api/venue/classes/route.ts (classTypeSchema)
 * @see _reference/Resneo/src/app/api/venue/class-instances/route.ts
 */

export type ClassPaymentRequirement = 'none' | 'deposit' | 'full_payment';

/**
 * One class type row from GET /api/venue/classes `class_types`.
 * The route enriches each row with `instructor_calendar_id` (the resolved team
 * calendar column the sessions land on); pair it with `instructor_id` when
 * pre-selecting the calendar picker.
 */
export interface ManagedClassType {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  capacity: number;
  colour?: string | null;
  is_active?: boolean;
  /** The calendar column sessions are placed on (required on POST). */
  instructor_id?: string | null;
  /** Resolved host team calendar id (GET enrichment); falls back to instructor_id. */
  instructor_calendar_id?: string | null;
  /** Optional guest-facing label; when empty the calendar name is shown. */
  instructor_name?: string | null;
  price_pence?: number | null;
  payment_requirement?: ClassPaymentRequirement | null;
  deposit_amount_pence?: number | null;
  max_advance_booking_days?: number | null;
  min_booking_notice_hours?: number | null;
  cancellation_notice_hours?: number | null;
  allow_same_day_booking?: boolean | null;
}

/** One upcoming class instance (session) from GET `instances`. */
export interface ManagedClassInstance {
  id: string;
  class_type_id: string;
  /** YYYY-MM-DD */
  instance_date: string;
  /** HH:mm[:ss] */
  start_time: string;
  is_cancelled: boolean;
  cancel_reason?: string | null;
  timetable_entry_id?: string | null;
  capacity_override?: number | null;
  booked_spots?: number;
}

/** One recurring timetable rule from GET `timetable` (read-only in the app). */
export interface ManagedClassTimetableEntry {
  id: string;
  class_type_id: string;
  day_of_week: number;
  start_time: string;
  is_active: boolean;
  interval_weeks?: number;
  recurrence_type?: string;
  recurrence_end_date?: string | null;
  total_occurrences?: number | null;
}

/** Team calendar column the class-type picker offers (GET `unified_calendars`). */
export interface ClassCalendarColumn {
  id: string;
  name: string;
  sort_order?: number | null;
}

/** GET /api/venue/classes response. */
export interface ManagedClassesResponse {
  class_types: ManagedClassType[];
  timetable: ManagedClassTimetableEntry[];
  instances: ManagedClassInstance[];
  /** Team calendar columns for the picker (unified_scheduling venues). */
  unified_calendars?: ClassCalendarColumn[];
  /** Legacy practitioner rows (table / class_session venues). */
  practitioners?: ClassCalendarColumn[];
}

/**
 * POST body for a new class type. `entity_type` is omitted — the route treats
 * any non-timetable, non-instance body as a class type. `instructor_id` is
 * required (the calendar column). Cross-field rules (server-enforced): deposit
 * & full_payment need price>0; deposit needs deposit_amount_pence in
 * (0, price].
 */
export interface CreateClassTypeInput {
  name: string;
  description?: string | null;
  duration_minutes: number;
  capacity: number;
  instructor_id: string;
  instructor_name?: string | null;
  colour?: string;
  is_active?: boolean;
  price_pence?: number | null;
  payment_requirement?: ClassPaymentRequirement;
  deposit_amount_pence?: number | null;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
}

/**
 * PATCH body for an existing class type. Sent as
 * `{ id, entity_type: 'class_type', ...fields }`. All fields optional; the
 * server merges with the stored row before re-validating payment rules.
 */
export interface UpdateClassTypeInput {
  id: string;
  name?: string;
  description?: string | null;
  duration_minutes?: number;
  capacity?: number;
  instructor_id?: string | null;
  instructor_name?: string | null;
  colour?: string;
  is_active?: boolean;
  price_pence?: number | null;
  payment_requirement?: ClassPaymentRequirement;
  deposit_amount_pence?: number | null;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
}

/** POST body for a one-off session — POST /api/venue/class-instances. */
export interface CreateClassInstanceInput {
  class_type_id: string;
  /** YYYY-MM-DD */
  instance_date: string;
  /** HH:mm */
  start_time: string;
  capacity_override?: number | null;
}

/** One row in a bulk-create batch — POST /api/venue/class-instances/bulk. */
export interface BulkClassInstanceRow {
  /** YYYY-MM-DD */
  instance_date: string;
  /** HH:mm (the route normalises to HH:mm:ss) */
  start_time: string;
  capacity_override?: number | null;
}

/**
 * POST body for bulk session scheduling — POST /api/venue/class-instances/bulk.
 * The route caps the batch at 100 and skips rows duplicating an existing
 * (class_type_id, instance_date, start_time).
 */
export interface BulkCreateClassInstancesInput {
  class_type_id: string;
  instances: BulkClassInstanceRow[];
}

/** Response from the bulk endpoint — created vs skipped (already on the calendar). */
export interface BulkCreateClassInstancesResult {
  created?: number;
  skipped?: number;
  /** On 409 the route returns `{ error }` instead; surfaced as ApiError. */
  error?: string;
}

/** Recurrence shape shared by the timetable-rule create/update bodies. */
export type ClassRuleRecurrenceType = 'weekly';

/**
 * POST body for a recurring weekly rule — POST /api/venue/classes with a
 * `day_of_week` present (the route routes on that to `timetableEntrySchema`).
 * `entity_type: 'timetable'` is added by the mutation. Provide at most one of
 * `recurrence_end_date` / `total_occurrences` (the "until date" vs "after N
 * sessions" end condition; omit both for an ongoing rule).
 *
 * @see _reference/Resneo/src/app/api/venue/classes/route.ts (timetableEntrySchema)
 */
export interface CreateClassRuleInput {
  class_type_id: string;
  /** 0 = Sunday … 6 = Saturday. */
  day_of_week: number;
  /** HH:mm */
  start_time: string;
  /** 1–8. */
  interval_weeks?: number;
  recurrence_type?: ClassRuleRecurrenceType;
  /** YYYY-MM-DD; mutually exclusive with total_occurrences. */
  recurrence_end_date?: string | null;
  total_occurrences?: number | null;
  is_active?: boolean;
}

/**
 * PATCH body for a recurring weekly rule — PATCH /api/venue/classes. Sent as
 * `{ id, entity_type: 'timetable', ...fields }` by the mutation.
 */
export interface UpdateClassRuleInput {
  id: string;
  day_of_week?: number;
  start_time?: string;
  interval_weeks?: number;
  recurrence_type?: ClassRuleRecurrenceType;
  recurrence_end_date?: string | null;
  total_occurrences?: number | null;
  is_active?: boolean;
}

/**
 * POST body for generating instances from the timetable —
 * POST /api/venue/classes/generate-instances (admin only). `weeks` is clamped
 * server-side to 1–26.
 */
export interface GenerateInstancesInput {
  weeks: number;
}

/** Response from generate-instances — how many sessions were created. */
export interface GenerateInstancesResult {
  created?: number;
  error?: string;
}

/**
 * POST body for admin cancel-and-notify —
 * POST /api/venue/class-instances/[id]/cancel (admin only). Distinct from
 * delete: cancels active bookings, refunds per policy and notifies guests.
 */
export interface CancelClassInstanceInput {
  classInstanceId: string;
  cancel_reason?: string | null;
}

/** Response from the cancel-and-notify endpoint. */
export interface CancelClassInstanceResult {
  success?: boolean;
  class_instance_id?: string;
  bookings_cancelled?: number;
  notifications_scheduled?: number;
  refund_failures?: number;
  error?: string;
  code?: string;
}

/**
 * PATCH body to edit a session — PATCH /api/venue/classes with
 * `entity_type: 'instance'`.
 */
export interface UpdateClassInstanceInput {
  id: string;
  /** YYYY-MM-DD */
  instance_date?: string;
  /** HH:mm */
  start_time?: string;
  capacity_override?: number | null;
}

/** DELETE body — DELETE /api/venue/classes. */
export interface DeleteClassEntityInput {
  id: string;
  entity_type: 'class_type' | 'timetable' | 'instance';
}

/**
 * One attendee from GET /api/venue/class-instances/[id]/attendees.
 * Note: this route keys the booking as `booking_id` (the bookings/list roster
 * uses `id`), and reliably selects `checked_in_at`.
 */
export interface ClassAttendee {
  booking_id: string;
  status: string;
  party_size: number;
  deposit_amount_pence?: number | null;
  deposit_status?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  /** ISO timestamp the attendee was checked in for the class, if at all. */
  checked_in_at?: string | null;
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
}

/** GET /api/venue/class-instances/[id]/attendees response. */
export interface ClassAttendeesResponse {
  class_instance_id: string;
  attendees: ClassAttendee[];
}
