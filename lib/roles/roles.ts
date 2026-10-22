import { ApiError, apiErrorCode, isApiErrorBody } from '@/lib/api/client';
import type { RoleChoice, RoleKey, StaffMe, StaffPermissions, StaffRole } from '@/types/staff';
import type { VenueBootstrap } from '@/types/venue';

/**
 * The four roles in the app (web roles plan Part A1: Docs/user-roles-and-multi-site-plan.md §5.1 to
 * §5.5, §5.8, Appendix C; the web's `src/lib/roles/permissions.ts` and Settings, Staff).
 *
 *   - Owner       role 'admin' and is_owner (one per business)
 *   - Admin       role 'admin'
 *   - Front desk  role 'staff' and permissions.role_key 'front_desk'
 *   - Staff       role 'staff'
 *
 * Every response keeps `role` as 'admin' or 'staff', so a server before roles reads as today's
 * admin or staff, and every admin then keeps every power. Pure: no request, no React.
 */

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: 'Owner',
  admin: 'Admin',
  front_desk: 'Front desk',
  staff: 'Staff',
};

/** The app's role words, from the web's copy deck (Appendix C). No em-dashes. */
export const ROLES_COPY = {
  'role.owner': 'Everything an admin can do. Only the owner can transfer ownership, and nobody else can change or remove them.',
  'role.admin': 'Runs the business day to day.',
  'role.front_desk': 'Takes bookings and payments, with the Front desk till settings.',
  'role.staff': 'Works with clients, with the Staff till settings.',
  'billing.only': 'Only the owner, or an admin they allow, can do this.',
  'billing.plan': 'Only the owner, or an admin they allow, can change the plan, manage billing or close the business.',
  'billing.close': 'Only the owner, or an admin they allow, can close the business or cancel a closure.',
  'billing.switch': 'Billing, payouts and admins',
  'billing.switch.help': 'Lets this admin manage your plan, payouts and other admins. Only you can change this.',
  'owner.protected': 'Only {owner} can change this. The owner can transfer ownership from their own row.',
  'owner.transfer': 'Transfer ownership from your ResNeo dashboard on the web.',
  'err.OWNER_PROTECTED': "You can't change or remove the owner.",
  'err.PERMISSION_NOT_ALLOWED': 'Only the owner can change Billing, payouts and admins.',
  'err.RATE_LIMITED': "You've sent a lot of invites today. Please try again tomorrow.",
} as const;

export type RolesCopyId = keyof typeof ROLES_COPY;

export function rolesT(id: RolesCopyId, values: Record<string, string> = {}): string {
  return ROLES_COPY[id].replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key]! : m));
}

/** What the role checks read from a person: their stored role, the owner flag and the switches. */
export interface RoleSubject {
  role?: string | null;
  is_owner?: boolean | null;
  role_key?: string | null;
  permissions?: StaffPermissions | null;
}

const ROLE_KEYS: readonly RoleKey[] = ['owner', 'admin', 'front_desk', 'staff'];

/** Which of the four roles: the server's `role_key` when it sends one, else worked out from the row. */
export function roleKeyOf(person: RoleSubject | null | undefined): RoleKey {
  if (!person) return 'staff';
  if (typeof person.role_key === 'string' && (ROLE_KEYS as readonly string[]).includes(person.role_key)) {
    return person.role_key as RoleKey;
  }
  if (person.role === 'admin') return person.is_owner ? 'owner' : 'admin';
  return person.permissions?.role_key === 'front_desk' ? 'front_desk' : 'staff';
}

export function roleLabelOf(person: RoleSubject | null | undefined): string {
  return ROLE_LABELS[roleKeyOf(person)];
}

/** The badge tone for a role: the owner stands out, admins are brand, Front desk and Staff plain. */
export function roleBadgeTone(person: RoleSubject | null | undefined): 'accent' | 'brand' | 'neutral' {
  const key = roleKeyOf(person);
  return key === 'owner' ? 'accent' : key === 'admin' ? 'brand' : 'neutral';
}

/** The role picker's value for a person: the owner reads as an admin (only a transfer changes them). */
export function roleChoiceOf(person: RoleSubject | null | undefined): RoleChoice {
  const key = roleKeyOf(person);
  return key === 'owner' ? 'admin' : key;
}

export function isOwnerPerson(person: RoleSubject | null | undefined): boolean {
  return roleKeyOf(person) === 'owner';
}

/**
 * The owner, or an admin whose "Billing, payouts and admins" switch is on or absent (UR22): the
 * plan, billing, invoices, payouts, closing the business, and acting on or making admins.
 */
export function hasBillingPayoutsAdmins(person: RoleSubject | null | undefined): boolean {
  if (!person) return false;
  const key = roleKeyOf(person);
  if (key === 'owner') return true;
  if (key !== 'admin') return false;
  return person.permissions?.billing_payouts_admins !== false;
}

/**
 * The signed-in person's billing switch from `GET /api/venue`: the server's own answer
 * (`current_user_billing_payouts_admins`) when it sends one, else worked out from the role fields,
 * which a server before roles leaves out (every admin then keeps the powers).
 */
export function venueBillingPayoutsAdmins(
  venue:
    | Pick<
        VenueBootstrap,
        | 'current_user_role'
        | 'current_user_is_owner'
        | 'current_user_role_key'
        | 'current_user_permissions'
        | 'current_user_billing_payouts_admins'
      >
    | null
    | undefined,
): boolean {
  if (!venue) return false;
  if (typeof venue.current_user_billing_payouts_admins === 'boolean') return venue.current_user_billing_payouts_admins;
  return hasBillingPayoutsAdmins({
    role: venue.current_user_role,
    is_owner: venue.current_user_is_owner,
    role_key: venue.current_user_role_key,
    permissions: venue.current_user_permissions,
  });
}

/** The stored role and the role key a role choice sends (`role` for older servers, `role_key` wins). */
export function roleChoiceBody(choice: RoleChoice): { role: StaffRole; role_key: RoleChoice } {
  return { role: choice === 'admin' ? 'admin' : 'staff', role_key: choice };
}

/** Who is looking at the Team screen (web `TeamViewer`). */
export interface TeamViewer {
  staffId: string | null;
  isOwner: boolean;
  /** The owner, or an admin with the switch: may act on admins and make admins. */
  billingPayoutsAdmins: boolean;
  /** The server knows the four roles (it sent `role_key`), so Front desk can be offered. */
  rolesKnown: boolean;
}

export function teamViewerOf(me: Pick<StaffMe, 'id' | 'role' | 'is_owner' | 'role_key' | 'permissions'> | null | undefined): TeamViewer {
  return {
    staffId: me?.id ?? null,
    isOwner: isOwnerPerson(me),
    billingPayoutsAdmins: hasBillingPayoutsAdmins(me),
    rolesKnown: typeof me?.role_key === 'string',
  };
}

/**
 * What the viewer may do on a member's row (web Settings, Staff; `team-policy.ts`):
 *   - `owner_protected`: the owner's row, opened by someone else. Nothing to do there.
 *   - `billing_locked`: another admin, opened by an admin without the billing switch.
 *   - `manage`: everything the sheet offers (the viewer's own row keeps its own limits).
 */
export type MemberAccess = 'owner_protected' | 'billing_locked' | 'manage';

export function memberAccess(viewer: TeamViewer, member: RoleSubject & { id: string }): MemberAccess {
  const isSelf = viewer.staffId !== null && member.id === viewer.staffId;
  if (isSelf) return 'manage';
  if (isOwnerPerson(member)) return 'owner_protected';
  if (member.role === 'admin' && !viewer.billingPayoutsAdmins) return 'billing_locked';
  return 'manage';
}

/** The roles the viewer may give: Staff always, Front desk on a server that knows it, Admin with the switch. */
export function roleOptionsFor(viewer: TeamViewer): { value: RoleChoice; label: string }[] {
  const options: { value: RoleChoice; label: string }[] = [{ value: 'staff', label: ROLE_LABELS.staff }];
  if (viewer.rolesKnown) options.push({ value: 'front_desk', label: ROLE_LABELS.front_desk });
  if (viewer.billingPayoutsAdmins) options.push({ value: 'admin', label: ROLE_LABELS.admin });
  return options;
}

/** The line under the role picker for each role (Appendix C). */
export function roleDescription(choice: RoleChoice): string {
  return ROLES_COPY[choice === 'admin' ? 'role.admin' : choice === 'front_desk' ? 'role.front_desk' : 'role.staff'];
}

/** "Billing, payouts and admins" shows on another admin's row, to the owner only. */
export function showsBillingSwitch(viewer: TeamViewer, member: RoleSubject & { id: string }): boolean {
  return viewer.isOwner && member.role === 'admin' && !isOwnerPerson(member) && member.id !== viewer.staffId;
}

/** The switch's value on an admin: absent means on. */
export function billingSwitchOn(member: RoleSubject): boolean {
  return member.permissions?.billing_payouts_admins !== false;
}

const TEAM_CODES = ['OWNER_PROTECTED', 'BILLING_ADMINS_ONLY', 'PERMISSION_NOT_ALLOWED', 'OWNER_ONLY', 'RATE_LIMITED'] as const;

/**
 * The sentence to show when a team route refuses: the server's own message for the roles refusals
 * (403 `OWNER_PROTECTED`, `BILLING_ADMINS_ONLY`, `PERMISSION_NOT_ALLOWED`, `OWNER_ONLY`) and the
 * invite limit (429 `RATE_LIMITED`), with the copy deck's words if it sent none.
 */
export function teamErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const code = apiErrorCode(error);
  if (code && (TEAM_CODES as readonly string[]).includes(code)) {
    const said = isApiErrorBody(error.body) ? error.body.error.trim() : '';
    if (said) return said;
    if (code === 'BILLING_ADMINS_ONLY') return ROLES_COPY['billing.only'];
    if (code === 'OWNER_PROTECTED') return ROLES_COPY['err.OWNER_PROTECTED'];
    if (code === 'PERMISSION_NOT_ALLOWED') return ROLES_COPY['err.PERMISSION_NOT_ALLOWED'];
    if (code === 'RATE_LIMITED') return ROLES_COPY['err.RATE_LIMITED'];
  }
  return error.message || fallback;
}
