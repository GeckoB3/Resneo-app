/** Staff role on a venue — matches `staff.role` in reserve-ni. */
export type StaffRole = 'admin' | 'staff';

/**
 * Which of the four roles someone has (web roles plan §5.1, `src/lib/roles/permissions.ts`). The
 * stored `role` stays 'admin' or 'staff': the owner is an admin with `is_owner`, and Front desk is
 * staff with `permissions.role_key = 'front_desk'`.
 */
export type RoleKey = 'owner' | 'admin' | 'front_desk' | 'staff';

/** The roles the Team screen can give someone. Only a transfer on the web makes an owner. */
export type RoleChoice = 'admin' | 'front_desk' | 'staff';

/**
 * Per-person switches (`staff.permissions`, roles plan §5.5). An absent key means today's
 * behaviour: `billing_payouts_admins` absent is on.
 */
export interface StaffPermissions {
  role_key?: 'front_desk';
  /** Admins: plan, billing, payouts, closing the business and other admins. Only the owner changes it. */
  billing_payouts_admins?: boolean;
  /** Front desk and Staff: "Can see client phone numbers and emails". Absent means on (A2). */
  client_contact?: boolean;
  /** Everyone but the owner: "Can export client data". Absent means on (A2). */
  export_clients?: boolean;
  /** Front desk and Staff: "Other people's diaries". Absent means 'book' ('hidden' since A2b). */
  other_diaries?: 'book' | 'view' | 'hidden';
}

/**
 * What a venue API response carries for someone whose "Can see client phone numbers and emails" is
 * off (web roles plan §5.6, `contact-visibility`): every client phone and email in the body is null,
 * and the body says `contacts_hidden: true`. Absent for everyone else.
 */
export interface ContactsHiddenFlag {
  contacts_hidden?: boolean;
}

/**
 * The role fields an A1 server adds wherever it describes a person (roles plan §5.10). An older
 * server leaves them out, which reads as today's admin or staff.
 */
export interface RoleFields {
  is_owner?: boolean;
  role_key?: RoleKey;
  permissions?: StaffPermissions | null;
}

/**
 * Current user's staff profile from GET /api/venue/staff/me.
 * @see _reference/reserve-ni/src/app/api/venue/staff/me/route.ts
 */
export interface StaffMe extends RoleFields {
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
export interface TeamMember extends RoleFields {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  role: StaffRole | string;
  created_at?: string;
  /** The login has signed in at least once (A1 server). */
  has_signed_in?: boolean;
  /** No login has claimed the row yet (A1 server). */
  invite_pending?: boolean;
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

/**
 * POST /api/venue/staff/invite request body. `role_key` wins over `role` on an A1 server; `role`
 * stays for an older one, which ignores the keys it does not know.
 */
export interface InviteStaffBody {
  email: string;
  role: StaffRole;
  role_key?: RoleChoice;
  name?: string;
  calendar_ids?: string[];
}

/** POST /api/venue/staff/invite response. */
export interface InviteStaffResponse {
  message: string;
  invite_email_sent: boolean;
  staff: TeamMember;
}

/**
 * PATCH /api/venue/staff/[id] request body (strict; never email). `role_key` wins over `role`.
 * `permissions` is partial; `null` puts a key back to its absent default. Who may send what (web
 * `team-policy.ts`):
 *   - `billing_payouts_admins`: admins only, set by the owner only;
 *   - `client_contact` and `other_diaries`: Front desk and Staff only, set by the owner or any admin
 *     ('hidden' since A2b; an older server refuses it);
 *   - `export_clients`: everyone but the owner; only the owner sets it for an admin.
 * Nobody changes their own.
 */
export interface PatchStaffBody {
  role?: StaffRole;
  role_key?: RoleChoice;
  name?: string;
  permissions?: {
    billing_payouts_admins?: boolean | null;
    client_contact?: boolean | null;
    export_clients?: boolean | null;
    other_diaries?: 'book' | 'view' | 'hidden' | null;
  };
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
