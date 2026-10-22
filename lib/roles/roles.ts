import { ApiError, apiErrorCode, isApiErrorBody } from '@/lib/api/client';
import type { RoleChoice, RoleKey, StaffMe, StaffPermissions, StaffRole } from '@/types/staff';
import type { LinkedVenueCalendar } from '@/types/linked-venues';
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
  // A2: the switches on a person (Appendix C, "Switch labels" and "Help text under the switches").
  'switch.client_contact': 'Can see client phone numbers and emails',
  'switch.client_contact.help': "When this is off, they see 'Hidden' instead of phone numbers and emails.",
  'switch.other_diaries': "Other people's diaries",
  'switch.other_diaries.book': 'Can book and change',
  'switch.other_diaries.view': 'View only',
  // A2b: other people's appointments are left out altogether.
  'switch.other_diaries.hidden': 'Hidden',
  'switch.other_diaries.no_calendar':
    '{name} has no calendar. With View only they can look but not book. With Hidden they see no bookings.',
  'switch.export_clients': 'Can export client data',
  'switch.export_clients.help':
    "Shows or hides the buttons that download client lists. It can't stop someone copying details they can already see. To keep phone numbers and emails private, switch off 'Can see client phone numbers and emails'.",
  // A2: what hidden contacts look like (Appendix C).
  'contact.hidden': 'Hidden',
  'contact.hidden.tip': 'Your business has hidden client phone numbers and emails for you.',
  // A2: client search for someone whose contacts are hidden matches names only (§5.6).
  'search.names_only': 'Search by name',
  // A2 refusals (Appendix B and C).
  'err.CONTACT_HIDDEN': "You can't change this client's phone or email. Ask an admin.",
  'err.CONTACT_BELONGS_TO_OTHER_CLIENT': 'These details belong to another client. Search by name, or ask an admin.',
  'err.EXPORT_NOT_ALLOWED': 'Exporting client data is switched off for you.',
  'err.DIARY_VIEW_ONLY': 'You can see this booking, but you can only change bookings on your own calendar.',
  // A2 and A2b: where a View only or Hidden person finds an action missing (§5.11, §7.3).
  'diary.booking': 'You can see this booking, but you can only change bookings on your own calendar.',
  'diary.new': 'You can see this calendar, but you can only add bookings to your own calendar.',
  'diary.move': 'You can only move bookings onto your own calendar.',
  'diary.no_calendar.title': 'No calendar of your own',
  'diary.no_calendar':
    "You can only add bookings to your own calendar, and you don't have one yet. Ask an admin to give you one.",
  'diary.none_here': 'None of these calendars is yours. You can only add bookings to your own calendar.',
  'diary.restricted_visit': 'On another calendar',
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

/**
 * Other people's diaries (roles plan §5.11): 'book' (the default), 'view' (A2) or 'hidden' (A2b).
 */
export type DiaryAccess = NonNullable<StaffPermissions['other_diaries']>;

/**
 * "Can see client phone numbers and emails" (roles plan §5.6, UR6; web `contact-visibility`
 * `canSeeClientContact`). Owners and admins always see; Front desk and Staff unless their switch is
 * off (absent means on).
 */
export function canSeeClientContact(person: RoleSubject | null | undefined): boolean {
  if (!person) return false;
  const key = roleKeyOf(person);
  if (key === 'owner' || key === 'admin') return true;
  return person.permissions?.client_contact !== false;
}

/**
 * "Can export client data" (roles plan §5.5, UR17; web `permissions.ts` `canExportClients`). The
 * owner always may; anyone else unless their switch is off (absent means on).
 */
export function canExportClients(person: RoleSubject | null | undefined): boolean {
  if (!person) return false;
  if (roleKeyOf(person) === 'owner') return true;
  return person.permissions?.export_clients !== false;
}

/**
 * Other people's diaries for this person (roles plan §5.11, UR19; web `permissions.ts`
 * `diaryAccessOf`). Owners and admins always book and change.
 */
export function diaryAccessOf(person: RoleSubject | null | undefined): DiaryAccess {
  if (!person) return 'book';
  const key = roleKeyOf(person);
  if (key === 'owner' || key === 'admin') return 'book';
  const value = person.permissions?.other_diaries;
  return value === 'view' || value === 'hidden' ? value : 'book';
}

/**
 * What the signed-in person may see and do across the app (web `ViewerAccessProvider`). The server
 * enforces every one of these; this only keeps the screens honest.
 */
export interface ViewerAccess {
  /** "Can see client phone numbers and emails". Always true for owners and admins. */
  canSeeClientContact: boolean;
  /** "Can export client data". Always true for the owner. */
  canExportClients: boolean;
  /** "Other people's diaries": 'book' for owners and admins. */
  otherDiaries: DiaryAccess;
  /**
   * "Their calendars" (`GET /api/venue/staff/me` `linked_calendar_ids`, the server's
   * `getStaffManagedCalendarIds`): the only diaries a View only or Hidden person may book and change
   * on. Set only when `otherDiaries` is not 'book'; absent there reads as no calendars at all, the
   * server's own safe direction.
   */
  ownCalendarIds?: readonly string[];
}

/** Everything allowed: today's behaviour, and what a screen reads before anyone is known. */
export const FULL_VIEWER_ACCESS: ViewerAccess = {
  canSeeClientContact: true,
  canExportClients: true,
  otherDiaries: 'book',
};

type VenueViewerFields = Pick<
  VenueBootstrap,
  'current_user_role' | 'current_user_is_owner' | 'current_user_role_key' | 'current_user_permissions'
>;

/** The signed-in person's role fields as `GET /api/venue` describes them. */
export function venueRoleSubject(venue: VenueViewerFields | null | undefined): RoleSubject | null {
  if (!venue || !venue.current_user_role) return null;
  return {
    role: venue.current_user_role,
    is_owner: venue.current_user_is_owner,
    role_key: venue.current_user_role_key,
    permissions: venue.current_user_permissions,
  };
}

/**
 * The signed-in person's access: from `GET /api/venue/staff/me` when it has loaded, else from
 * `GET /api/venue`, else everything (before either answers; the server hides what it must anyway).
 */
export function viewerAccessOf(
  me: (RoleSubject & { linked_calendar_ids?: string[] | null }) | null | undefined,
  venue?: VenueViewerFields | null,
): ViewerAccess {
  const fromMe = Boolean(me && me.role);
  const person = fromMe ? me : venueRoleSubject(venue);
  if (!person) return FULL_VIEWER_ACCESS;
  const otherDiaries = diaryAccessOf(person);
  return {
    canSeeClientContact: canSeeClientContact(person),
    canExportClients: canExportClients(person),
    otherDiaries,
    // Only a View only or Hidden person needs their calendars; before staff/me answers they are
    // not known, which reads as none (nothing of anyone's is offered until it does).
    ...(otherDiaries === 'book' ? {} : { ownCalendarIds: fromMe ? [...(me?.linked_calendar_ids ?? [])] : [] }),
  };
}

/**
 * The booking fields that say whether a row is an appointment on someone's calendar, and which one
 * (web `diary-access` `DiaryRow`). Every booking shape the app holds fits: the detail, the list
 * rows, a visit's rows.
 */
export interface DiaryRow {
  calendar_id?: string | null;
  practitioner_id?: string | null;
  class_instance_id?: string | null;
  experience_event_id?: string | null;
  resource_id?: string | null;
  /** The list and detail routes also name the model, which says the same for a row without the ids. */
  booking_model?: string | null;
  inferred_booking_model?: string | null;
}

const UNCOVERED_MODELS = new Set(['class_session', 'event_ticket', 'resource_booking']);

/**
 * The calendar a row sits on, or null when the row is not an appointment on a calendar (web
 * `diaryCalendarOf`): classes, events, resources and tables keep today's rules (§5.11, Scope).
 */
export function diaryCalendarOf(row: DiaryRow): string | null {
  if (row.class_instance_id || row.experience_event_id || row.resource_id) return null;
  const model = row.inferred_booking_model ?? row.booking_model ?? null;
  if (model && UNCOVERED_MODELS.has(model)) return null;
  return row.calendar_id ?? row.practitioner_id ?? null;
}

/**
 * What the signed-in person may book and change in the diary (roles plan §5.11, §7.3; web
 * `writableCalendarIds` and `diaryAllows`). The server refuses the rest with 403
 * `DIARY_VIEW_ONLY`; this keeps the screens from offering it.
 */
export interface DiaryScope {
  access: DiaryAccess;
  /** View only or Hidden: other people's appointments are look only. */
  restricted: boolean;
  /** The calendars this person may book and change on, or null when every diary is open to them. */
  writable: ReadonlySet<string> | null;
  /**
   * Whether this person may make, change, move, cancel, check in or take money on a booking row, or
   * add a booking to a calendar id. A row that is not an appointment on a calendar, and a null
   * calendar, always pass (as on the server).
   */
  allows: (target: DiaryRow | string | null | undefined) => boolean;
}

/** Everyone on "Can book and change": every check passes before it looks at anything. */
export const OPEN_DIARY_SCOPE: DiaryScope = {
  access: 'book',
  restricted: false,
  writable: null,
  allows: () => true,
};

/**
 * How a Hidden person sees someone else's visit in a client's history (UR20): the service, and who
 * it was with. Nothing else, and it does not open.
 */
export function restrictedVisitLabels(row: {
  service_name?: string | null;
  detail_label?: string | null;
  kind_label?: string | null;
  practitioner_name?: string | null;
  calendar_name?: string | null;
}): { service: string; withWhom: string | null } {
  const service = row.service_name?.trim() || row.detail_label?.trim() || row.kind_label?.trim() || 'Booking';
  const name = row.practitioner_name?.trim() || row.calendar_name?.trim() || '';
  return { service, withWhom: name ? `With ${name}` : null };
}

/**
 * A booking catalogue as this person may book from it: every calendar for everyone on "Can book
 * and change" (the same object, untouched), only their own for View only and Hidden.
 */
export function catalogForDiary<T extends { practitioners: { id: string }[] }>(
  catalog: T | undefined,
  diary: DiaryScope,
): T | undefined {
  if (!catalog || !diary.restricted) return catalog;
  return { ...catalog, practitioners: catalog.practitioners.filter((p) => diary.allows(p.id)) };
}

/**
 * Linked calendars as this person may act on them. A partner's calendars are never their own, so
 * for View only every link reads as a view-only link (§5.11: the setting narrows a link's grant and
 * never widens it); the server sends a Hidden person no linked calendars at all. Everyone else gets
 * the list untouched (the same array).
 */
export function linkedVenuesForDiary(
  venues: LinkedVenueCalendar[],
  diary: Pick<DiaryScope, 'restricted'>,
): LinkedVenueCalendar[] {
  if (!diary.restricted) return venues;
  return venues.map((v) => (v.action === 'none' ? v : { ...v, action: 'none' as const }));
}

/** A person's diary scope from their access. 'book' costs nothing: the open scope, as before. */
export function diaryScopeOf(access: Pick<ViewerAccess, 'otherDiaries' | 'ownCalendarIds'>): DiaryScope {
  if (access.otherDiaries === 'book') return OPEN_DIARY_SCOPE;
  const writable: ReadonlySet<string> = new Set(access.ownCalendarIds ?? []);
  return {
    access: access.otherDiaries,
    restricted: true,
    writable,
    allows: (target) => {
      if (target == null) return true;
      const calendarId = typeof target === 'string' ? target : diaryCalendarOf(target);
      return calendarId === null || writable.has(calendarId);
    },
  };
}

/**
 * Whether a client's phone and email read "Hidden" on a screen: the viewer's switch is off, or the
 * response that carried them says `contacts_hidden: true` (it then sends them as null). The second
 * covers a switch changed since the app last loaded the viewer.
 */
export function clientContactHidden(access: ViewerAccess, contactsHidden?: boolean | null): boolean {
  return !access.canSeeClientContact || contactsHidden === true;
}

const ACCESS_CODES = ['CONTACT_HIDDEN', 'CONTACT_BELONGS_TO_OTHER_CLIENT', 'EXPORT_NOT_ALLOWED', 'DIARY_VIEW_ONLY'] as const;
type AccessCode = (typeof ACCESS_CODES)[number];

/**
 * The sentence for an A2 refusal (Appendix B and C): 403 `CONTACT_HIDDEN`, 409
 * `CONTACT_BELONGS_TO_OTHER_CLIENT`, 403 `EXPORT_NOT_ALLOWED` and 403 `DIARY_VIEW_ONLY`. The
 * server's own words, else the copy deck's; null for any other error, so a caller keeps its own.
 */
export function accessRefusalMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = apiErrorCode(error);
  if (!code || !(ACCESS_CODES as readonly string[]).includes(code)) return null;
  const said = isApiErrorBody(error.body) ? error.body.error.trim() : '';
  return said || ROLES_COPY[`err.${code as AccessCode}`];
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
 * What the viewer may do on a member's row (web Settings, Staff `MemberCard`; `team-policy.ts`):
 *   - `self`: the viewer's own row. Nobody manages themself; the owner or another admin does.
 *   - `owner_protected`: the owner's row, opened by someone else. Nothing to do there.
 *   - `billing_locked`: another admin, opened by an admin without the billing switch.
 *   - `manage`: everything the sheet offers.
 */
export type MemberAccess = 'self' | 'owner_protected' | 'billing_locked' | 'manage';

export function memberAccess(viewer: TeamViewer, member: RoleSubject & { id: string }): MemberAccess {
  const isSelf = viewer.staffId !== null && member.id === viewer.staffId;
  if (isSelf) return 'self';
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

/**
 * The contact, diary and export switches show on a Front desk or Staff row, to the owner or any
 * admin, never on the viewer's own row (web Settings, Staff `PersonSwitches`; `team-policy.ts`).
 * Only on a server that knows the four roles, since an older one refuses the keys.
 */
export function showsPersonSwitches(viewer: TeamViewer, member: RoleSubject & { id: string }): boolean {
  return viewer.rolesKnown && member.role !== 'admin' && member.id !== viewer.staffId;
}

/** "Can export client data" on another admin's row: the owner only (web `ExportSwitch`, §5.5). */
export function showsAdminExportSwitch(viewer: TeamViewer, member: RoleSubject & { id: string }): boolean {
  return viewer.isOwner && member.role === 'admin' && !isOwnerPerson(member) && member.id !== viewer.staffId;
}

/** "Can see client phone numbers and emails" on a member: absent means on. */
export function contactSwitchOn(member: RoleSubject): boolean {
  return member.permissions?.client_contact !== false;
}

/** "Can export client data" on a member: absent means on. */
export function exportSwitchOn(member: RoleSubject): boolean {
  return member.permissions?.export_clients !== false;
}

/** "Other people's diaries" on a member: absent means "Can book and change". */
export function diaryChoiceOf(member: RoleSubject): DiaryAccess {
  const value = member.permissions?.other_diaries;
  return value === 'view' || value === 'hidden' ? value : 'book';
}

/** Whether a member has a calendar of their own ("Their calendars", §5.11). */
export function memberHasCalendar(member: { linked_calendar_ids?: string[] | null; linked_practitioner_id?: string | null }): boolean {
  return (member.linked_calendar_ids?.length ?? 0) > 0 || Boolean(member.linked_practitioner_id);
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
