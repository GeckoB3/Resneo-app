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
