/**
 * Web roles plan A2 in the app: who may see client phone numbers and emails, who may export client
 * data, other people's diaries, the signed-in person's access from staff/me or the venue payload,
 * the server's words for the A2 refusals, and which switches the Team screen offers on whose row.
 * Mirrors the web's `contact-visibility` `canSeeClientContact` and `permissions.ts`
 * `canExportClients` / `diaryAccessOf`.
 */
import { ApiError } from '@/lib/api/client';
import {
  accessRefusalMessage,
  canExportClients,
  canSeeClientContact,
  clientContactHidden,
  contactSwitchOn,
  diaryAccessOf,
  diaryChoiceOf,
  exportSwitchOn,
  FULL_VIEWER_ACCESS,
  memberHasCalendar,
  ROLES_COPY,
  rolesT,
  showsAdminExportSwitch,
  showsPersonSwitches,
  venueRoleSubject,
  viewerAccessOf,
  type TeamViewer,
} from '@/lib/roles/roles';

const EM_DASH = String.fromCharCode(0x2014);

const owner = { role: 'admin', is_owner: true, role_key: 'owner' as const, permissions: {} };
const admin = { role: 'admin', is_owner: false, role_key: 'admin' as const, permissions: {} };
const desk = { role: 'staff', role_key: 'front_desk' as const, permissions: { role_key: 'front_desk' as const } };
const staff = { role: 'staff', role_key: 'staff' as const, permissions: {} };

describe('canSeeClientContact', () => {
  it('is always true for the owner and admins, whatever their stored switches say', () => {
    expect(canSeeClientContact(owner)).toBe(true);
    expect(canSeeClientContact(admin)).toBe(true);
    expect(canSeeClientContact({ ...admin, permissions: { client_contact: false } })).toBe(true);
  });

  it('is on for Front desk and Staff unless their switch is off (absent means on)', () => {
    expect(canSeeClientContact(desk)).toBe(true);
    expect(canSeeClientContact(staff)).toBe(true);
    expect(canSeeClientContact({ ...staff, permissions: { client_contact: true } })).toBe(true);
    expect(canSeeClientContact({ ...staff, permissions: { client_contact: false } })).toBe(false);
    expect(canSeeClientContact({ ...desk, permissions: { role_key: 'front_desk', client_contact: false } })).toBe(false);
  });

  it('reads a row from an older server (no role_key) by its stored role', () => {
    expect(canSeeClientContact({ role: 'admin' })).toBe(true);
    expect(canSeeClientContact({ role: 'staff', permissions: { client_contact: false } })).toBe(false);
  });

  it('is false for nobody, as the server', () => {
    expect(canSeeClientContact(null)).toBe(false);
  });
});

describe('canExportClients', () => {
  it('is always true for the owner', () => {
    expect(canExportClients(owner)).toBe(true);
    expect(canExportClients({ ...owner, permissions: { export_clients: false } })).toBe(true);
  });

  it('is on for admins, Front desk and Staff unless their switch is off', () => {
    expect(canExportClients(admin)).toBe(true);
    expect(canExportClients({ ...admin, permissions: { export_clients: false } })).toBe(false);
    expect(canExportClients({ ...staff, permissions: { export_clients: false } })).toBe(false);
    expect(canExportClients({ ...desk, permissions: { role_key: 'front_desk', export_clients: true } })).toBe(true);
  });

  it('is false for nobody', () => {
    expect(canExportClients(undefined)).toBe(false);
  });
});

describe('diaryAccessOf', () => {
  it("is 'book' for owners, admins and anyone without the key", () => {
    expect(diaryAccessOf(owner)).toBe('book');
    expect(diaryAccessOf({ ...admin, permissions: { other_diaries: 'view' } })).toBe('book');
    expect(diaryAccessOf(staff)).toBe('book');
    expect(diaryAccessOf(null)).toBe('book');
  });

  it('reads View only and Hidden for Front desk and Staff', () => {
    expect(diaryAccessOf({ ...staff, permissions: { other_diaries: 'view' } })).toBe('view');
    expect(diaryAccessOf({ ...desk, permissions: { role_key: 'front_desk', other_diaries: 'hidden' } })).toBe('hidden');
  });
});

describe('viewerAccessOf', () => {
  it('reads staff/me first', () => {
    expect(viewerAccessOf({ ...staff, permissions: { client_contact: false, export_clients: false, other_diaries: 'view' } })).toEqual({
      canSeeClientContact: false,
      canExportClients: false,
      otherDiaries: 'view',
      // No linked calendars on this staff/me: none of their own (roles.diary.test.ts).
      ownCalendarIds: [],
    });
  });

  it('falls back to the venue payload while staff/me is loading', () => {
    const venue = {
      current_user_role: 'staff' as const,
      current_user_is_owner: false,
      current_user_role_key: 'front_desk' as const,
      current_user_permissions: { role_key: 'front_desk' as const, client_contact: false },
    };
    expect(venueRoleSubject(venue)).toMatchObject({ role: 'staff', role_key: 'front_desk' });
    expect(viewerAccessOf(null, venue)).toEqual({ canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' });
  });

  it('allows everything until either answers (the server hides what it must anyway)', () => {
    expect(viewerAccessOf(null, null)).toEqual(FULL_VIEWER_ACCESS);
    expect(FULL_VIEWER_ACCESS).toEqual({ canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' });
  });

  it('gives an admin from an older server (no switches) everything', () => {
    expect(viewerAccessOf({ role: 'admin' })).toEqual(FULL_VIEWER_ACCESS);
  });
});

describe('clientContactHidden', () => {
  it("is hidden when the viewer's switch is off, or the response says contacts_hidden", () => {
    const hiddenViewer = { ...FULL_VIEWER_ACCESS, canSeeClientContact: false };
    expect(clientContactHidden(hiddenViewer)).toBe(true);
    expect(clientContactHidden(FULL_VIEWER_ACCESS, true)).toBe(true);
    expect(clientContactHidden(FULL_VIEWER_ACCESS, false)).toBe(false);
    expect(clientContactHidden(FULL_VIEWER_ACCESS)).toBe(false);
  });
});

describe('accessRefusalMessage', () => {
  const refusal = (status: number, body: unknown) => new ApiError('generic', status, body);

  it("shows the server's own words for the A2 refusals", () => {
    expect(
      accessRefusalMessage(
        refusal(403, { error: "You can't change this client's phone or email. Ask an admin.", code: 'CONTACT_HIDDEN' }),
      ),
    ).toBe("You can't change this client's phone or email. Ask an admin.");
    expect(
      accessRefusalMessage(
        refusal(403, {
          error: 'You can see this booking, but you can only change bookings on your own calendar.',
          code: 'DIARY_VIEW_ONLY',
        }),
      ),
    ).toBe('You can see this booking, but you can only change bookings on your own calendar.');
  });

  it("falls back to the copy deck's words when the server sent none", () => {
    expect(accessRefusalMessage(refusal(409, { error: '', code: 'CONTACT_BELONGS_TO_OTHER_CLIENT' }))).toBe(
      'These details belong to another client. Search by name, or ask an admin.',
    );
    expect(accessRefusalMessage(refusal(403, { error: ' ', code: 'EXPORT_NOT_ALLOWED' }))).toBe(
      'Exporting client data is switched off for you.',
    );
  });

  it('is null for anything else, so a caller keeps its own words', () => {
    expect(accessRefusalMessage(refusal(403, { error: 'No', code: 'OWNER_PROTECTED' }))).toBeNull();
    expect(accessRefusalMessage(refusal(500, { error: 'boom' }))).toBeNull();
    expect(accessRefusalMessage(new Error('boom'))).toBeNull();
  });
});

describe('the Team switches', () => {
  const OWNER: TeamViewer = { staffId: 'o1', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true };
  const ADMIN: TeamViewer = { staffId: 'a1', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true };
  const OLD_SERVER: TeamViewer = { staffId: 'a1', isOwner: false, billingPayoutsAdmins: true, rolesKnown: false };

  it('offers the contact, diary and export switches on Front desk and Staff rows to the owner or any admin', () => {
    expect(showsPersonSwitches(OWNER, { id: 's1', ...staff })).toBe(true);
    expect(showsPersonSwitches(ADMIN, { id: 'f1', ...desk })).toBe(true);
  });

  it('never offers them on admin rows, on your own row, or on a server before the four roles', () => {
    expect(showsPersonSwitches(OWNER, { id: 'a9', ...admin })).toBe(false);
    expect(showsPersonSwitches({ ...ADMIN, staffId: 's1' }, { id: 's1', ...staff })).toBe(false);
    expect(showsPersonSwitches(OLD_SERVER, { id: 's1', ...staff })).toBe(false);
  });

  it('offers the export switch on another admin to the owner only, never on the owner', () => {
    expect(showsAdminExportSwitch(OWNER, { id: 'a9', ...admin })).toBe(true);
    expect(showsAdminExportSwitch({ ...ADMIN, billingPayoutsAdmins: true }, { id: 'a9', ...admin })).toBe(false);
    expect(showsAdminExportSwitch(OWNER, { id: 'o1', ...owner })).toBe(false);
    expect(showsAdminExportSwitch(OWNER, { id: 's1', ...staff })).toBe(false);
  });

  it('reads absent switches as on and absent diaries as "Can book and change"', () => {
    expect(contactSwitchOn(staff)).toBe(true);
    expect(exportSwitchOn(staff)).toBe(true);
    expect(diaryChoiceOf(staff)).toBe('book');
    expect(contactSwitchOn({ ...staff, permissions: { client_contact: false } })).toBe(false);
    expect(exportSwitchOn({ ...admin, permissions: { export_clients: false } })).toBe(false);
    expect(diaryChoiceOf({ ...staff, permissions: { other_diaries: 'view' } })).toBe('view');
  });

  it('knows whether someone has a calendar', () => {
    expect(memberHasCalendar({ linked_calendar_ids: ['c1'] })).toBe(true);
    expect(memberHasCalendar({ linked_calendar_ids: [], linked_practitioner_id: 'p1' })).toBe(true);
    expect(memberHasCalendar({ linked_calendar_ids: [], linked_practitioner_id: null })).toBe(false);
  });
});

describe('the A2 copy', () => {
  it('matches the copy deck, with no em-dash', () => {
    expect(ROLES_COPY['switch.client_contact']).toBe('Can see client phone numbers and emails');
    expect(ROLES_COPY['switch.other_diaries']).toBe("Other people's diaries");
    expect(ROLES_COPY['switch.export_clients']).toBe('Can export client data');
    expect(ROLES_COPY['contact.hidden']).toBe('Hidden');
    expect(ROLES_COPY['contact.hidden.tip']).toBe('Your business has hidden client phone numbers and emails for you.');
    expect(rolesT('switch.other_diaries.no_calendar', { name: 'Cal' })).toBe(
      'Cal has no calendar. With View only they can look but not book. With Hidden they see no bookings.',
    );
    expect(ROLES_COPY['switch.other_diaries.hidden']).toBe('Hidden');
    for (const [id, text] of Object.entries(ROLES_COPY)) {
      expect({ id, dash: text.includes(EM_DASH) }).toEqual({ id, dash: false });
    }
  });
});
