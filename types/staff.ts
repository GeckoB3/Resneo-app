/** Staff role on a venue — matches `staff.role` in reserve-ni. */
export type StaffRole = 'admin' | 'staff';

/**
 * Current user's staff profile from GET /api/venue/staff/me.
 * @see _reference/reserve-ni/src/app/api/venue/staff/me/route.ts
 */
export interface StaffMe {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: StaffRole;
  linked_practitioner_id: string | null;
  linked_calendar_ids: string[];
}

export interface StaffMeResponse {
  staff: StaffMe;
}

/**
 * A team member from GET /api/venue/staff (admin only).
 */
export interface TeamMember {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  role: StaffRole | string;
  created_at?: string;
  linked_practitioner_id?: string | null;
  linked_practitioner_name?: string | null;
  /** Unified scheduling: all assigned calendar IDs. */
  linked_calendar_ids?: string[];
  /** Calendar display names (legacy / computed). */
  calendar_names?: string[];
}

export interface TeamListResponse {
  staff: TeamMember[];
}

/** POST /api/venue/staff/invite request body. */
export interface InviteStaffBody {
  email: string;
  role: StaffRole;
  name?: string;
  calendar_ids?: string[];
}

/** POST /api/venue/staff/invite response. */
export interface InviteStaffResponse {
  message: string;
  invite_email_sent: boolean;
  staff: TeamMember;
}

/** PATCH /api/venue/staff/[id] request body. */
export interface PatchStaffBody {
  role?: StaffRole;
  name?: string;
}

/** PATCH /api/venue/staff/[id] response. */
export interface PatchStaffResponse {
  staff: TeamMember;
}

/** PATCH /api/venue/staff/[id]/calendar request body. */
export interface PatchStaffCalendarBody {
  calendar_ids: string[];
}

/** PATCH /api/venue/staff/[id]/calendar response. */
export interface PatchStaffCalendarResponse {
  linked_calendar_ids: string[];
  linked_practitioner_id: string | null;
  linked_practitioner_name: string | null;
}

/** POST /api/venue/staff/[id]/reset-password request body. */
export interface ResetPasswordBody {
  new_password: string;
}

/** POST /api/venue/staff/change-password request body. */
export interface ChangePasswordBody {
  new_password: string;
}

/** PATCH /api/venue/staff/me request body. */
export interface PatchStaffMeBody {
  name?: string;
  email?: string;
  phone?: string;
}

/** GET /api/venue/staff/session-settings response. */
export interface SessionSettingsResponse {
  session_timeout_minutes: number;
}

/** PUT /api/venue/staff/session-settings request body. */
export interface PutSessionSettingsBody {
  session_timeout_minutes: number;
}

/** Assignable practitioner option from GET /api/venue/practitioners?staff_assignable=1 */
export interface AssignablePractitioner {
  id: string;
  name: string;
  is_active: boolean;
  calendar_type?: string | null;
}
