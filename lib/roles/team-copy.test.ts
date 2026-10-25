/**
 * The Team screen's words (web roles plan §5.1 to §5.5, Appendix C; the web's team-copy.ts): no
 * em-dashes and no countries, regions or competitors anywhere, the web's wording where the web
 * has it, and the helpers that build the row summary, the role-change question and the invite
 * confirmation.
 */
import {
  DIARY_CHOICES,
  firstNameOf,
  formatSignOutAfter,
  invitedNotice,
  memberCalendarIds,
  memberCalendarNames,
  memberSettingsSummary,
  memberStatus,
  ROLE_INFO,
  roleChangeQuestion,
  rolesHelpUrl,
  SETTING_COPY,
  TEAM_COPY,
  teamT,
  TILL_NOTE,
} from '@/lib/roles/team-copy';

const EM_DASH = String.fromCharCode(0x2014);

function everyString(): string[] {
  const out: string[] = [TILL_NOTE, SETTING_COPY.noCalendarWarning('Jess')];
  for (const info of Object.values(ROLE_INFO)) out.push(info.label, info.summary, info.goodFor, ...info.can, ...info.cannot);
  for (const choice of DIARY_CHOICES) out.push(choice.label, choice.help);
  for (const value of Object.values(SETTING_COPY)) if (typeof value === 'string') out.push(value);
  out.push(...Object.values(TEAM_COPY));
  return out;
}

describe('the copy', () => {
  it('has no em-dash', () => {
    for (const text of everyString()) expect({ text, dash: text.includes(EM_DASH) }).toEqual({ text, dash: false });
  });

  it('names no country, region or competitor', () => {
    const banned = /\b(UK|United Kingdom|Britain|British|England|Scotland|Wales|Ireland|Irish|Northern Ireland|NI|GB|Fresha|Treatwell|Booksy|Square|Phorest|Timely)\b/;
    for (const text of everyString()) expect({ text, banned: banned.test(text) }).toEqual({ text, banned: false });
  });

  it("keeps the web's role lines and switch words", () => {
    expect(ROLE_INFO.admin.summary).toBe('Runs the business day to day.');
    expect(ROLE_INFO.front_desk.summary).toBe('Takes bookings and payments, with the Front desk till settings.');
    expect(ROLE_INFO.staff.summary).toBe('Works with clients, with the Staff till settings.');
    expect(SETTING_COPY.billingHelp).toBe('Lets this admin manage your plan, payouts and other admins. Only you can change this.');
    expect(SETTING_COPY.noCalendarWarning('Jess')).toBe(
      'Jess has no calendar. With View only they can look but not book. With Hidden they see no bookings.',
    );
    expect(teamT('member.ownerProtected', { owner: 'Ana' })).toBe(
      'Only Ana can change this. The owner can transfer ownership from their own row.',
    );
    expect(TEAM_COPY['member.transfer']).toBe('Transfer ownership from your ResNeo dashboard on the web.');
  });

  it('leaves a placeholder it has no value for', () => {
    expect(teamT('summary.calendar')).toBe('Calendar: {names}');
  });
});

describe('a row', () => {
  it('names the status: Invited before Not signed in yet', () => {
    expect(memberStatus({ name: 'Jess Smith', email: 'j@x.com', invite_pending: true, has_signed_in: false })).toEqual({
      label: 'Invited',
      text: "Jess hasn't accepted their invitation yet.",
      tone: 'warning',
    });
    expect(memberStatus({ name: null, email: 'j@x.com', invite_pending: false, has_signed_in: false })?.text).toBe(
      "j@x.com hasn't signed in yet.",
    );
    expect(memberStatus({ name: 'Jess', email: 'j@x.com', invite_pending: false, has_signed_in: true })).toBeNull();
    // An older server sends neither: nothing to say.
    expect(memberStatus({ name: 'Jess', email: 'j@x.com' })).toBeNull();
  });

  it('sums up Front desk and Staff settings, the owner not at all, and admins by what else they manage', () => {
    expect(memberSettingsSummary({ role: 'admin', role_key: 'owner', is_owner: true }, [])).toEqual([]);
    expect(memberSettingsSummary({ role: 'admin', permissions: {} }, [])).toEqual([
      'Manages billing, payouts and admins',
      'Can export client data',
    ]);
    expect(memberSettingsSummary({ role: 'admin', permissions: { billing_payouts_admins: false, export_clients: false } }, [])).toEqual([]);
    expect(memberSettingsSummary({ role: 'staff', permissions: { export_clients: false } }, ['Chair 1'])).toEqual(['Calendar: Chair 1']);
    expect(
      memberSettingsSummary({ role: 'staff', permissions: { client_contact: false, other_diaries: 'hidden', export_clients: true } }, [
        'Chair 1',
        'Chair 2',
      ]),
    ).toEqual(['Calendars: Chair 1, Chair 2', 'Client phone numbers and emails hidden', 'Other diaries: Hidden', 'Can export client data']);
    expect(memberSettingsSummary({ role: 'staff', permissions: { export_clients: false } }, [])).toEqual(['No calendar']);
  });

  it('names calendars from the list, or from the server summary when one is switched off', () => {
    const list = [{ id: 'c1', name: 'Chair 1' }];
    expect(memberCalendarNames({ linked_calendar_ids: ['c1'] }, list)).toEqual(['Chair 1']);
    expect(memberCalendarNames({ linked_calendar_ids: ['c1', 'x'], linked_practitioner_name: 'Chair 1, Old' }, list)).toEqual([
      'Chair 1',
      'Old',
    ]);
    expect(memberCalendarNames({ linked_calendar_ids: [] }, list)).toEqual([]);
  });

  it('reads an emptied calendar list as none, and an older server by its single calendar', () => {
    expect(memberCalendarIds({ linked_calendar_ids: [], linked_practitioner_id: 'c1' })).toEqual([]);
    expect(memberCalendarIds({ linked_practitioner_id: 'c1' })).toEqual(['c1']);
  });
});

describe('changing a role', () => {
  const cal = { name: 'Cal Jones', email: 'cal@x.com', role: 'staff' };

  it('asks before making someone an admin, saying what only the owner gives', () => {
    expect(roleChangeQuestion(cal, 'admin', true)).toEqual({
      title: 'Make Cal an admin?',
      message:
        "Cal will see every setting, report and client, and can look after Front desk and Staff. They won't manage billing, payouts or other admins, or export client data, until you turn those on for them.",
    });
    expect(roleChangeQuestion(cal, 'admin', false).message).toMatch(/Only the owner can let them manage billing/);
  });

  it('names the new role and who it suits, or what an admin loses', () => {
    expect(roleChangeQuestion(cal, 'front_desk', false)).toEqual({
      title: "Change Cal's role to Front desk?",
      message:
        'Front desk: Takes bookings and payments, with the Front desk till settings. It suits a receptionist who books for everyone and takes payments.',
    });
    expect(roleChangeQuestion({ ...cal, role: 'admin' }, 'staff', true).message).toBe(
      'Cal will no longer see Settings, Reports or the team. Staff: Works with clients, with the Staff till settings.',
    );
  });

  it('uses the first name, else the email', () => {
    expect(firstNameOf({ name: '  Jess  Smith ', email: 'j@x.com' })).toBe('Jess');
    expect(firstNameOf({ name: null, email: 'j@x.com' })).toBe('j@x.com');
  });
});

describe('the invite confirmation', () => {
  const base = { email: 'jess@x.com', name: 'Jess', role: 'staff' as const, inviteEmailSent: true, joinsExistingLogin: false };

  it('says the invitation went', () => {
    expect(invitedNotice(base, 'Glow Studio')).toEqual({
      title: 'Invitation sent',
      text: "Invitation sent to jess@x.com. Jess can choose a password and sign in from the email. You'll see Invited next to their name until they do.",
    });
    expect(invitedNotice({ ...base, name: null }, 'Glow Studio').text).toMatch(/^Invitation sent to jess@x\.com\. They can/);
  });

  it('explains an existing login, ahead of the email flag', () => {
    expect(invitedNotice({ ...base, role: 'admin', joinsExistingLogin: true }, 'Glow Studio').text).toBe(
      "jess@x.com already has a ResNeo login, so there's no password to set. We've emailed them to join Glow Studio as Admin, and they'll also see your invitation next time they sign in.",
    );
  });

  it('explains being added without an email', () => {
    expect(invitedNotice({ ...base, inviteEmailSent: false }, 'Glow Studio')).toEqual({
      title: 'Added to your team',
      text: 'Jess is on your team as Staff. They may already have a ResNeo login: they can sign in as usual, or use Forgot password on the sign-in page.',
    });
  });
});

it('reads the sign-out time as the web does', () => {
  expect(formatSignOutAfter(30)).toBe('30 minutes');
  expect(formatSignOutAfter(60)).toBe('1 hour');
  expect(formatSignOutAfter(480)).toBe('8 hours');
  expect(formatSignOutAfter(1440)).toBe('24 hours');
  expect(formatSignOutAfter(10080)).toBe('7 days');
});

it('links the roles help article on the web', () => {
  expect(rolesHelpUrl('https://staging.example.com')).toBe('https://staging.example.com/help/settings/roles-and-permissions');
  expect(rolesHelpUrl('')).toBe('https://www.resneo.com/help/settings/roles-and-permissions');
});

describe('roleInfo', () => {
  it('leaves the till out of the role lines at a business without Checkout', () => {
    const { roleInfo } = jest.requireActual<typeof import('@/lib/roles/team-copy')>('@/lib/roles/team-copy');
    expect(roleInfo('front_desk', true).summary).toBe('Takes bookings and payments, with the Front desk till settings.');
    const frontDesk = roleInfo('front_desk', false);
    expect(frontDesk.summary).toBe('Takes bookings for everyone.');
    expect(frontDesk.can.some((line) => line.includes('till'))).toBe(false);
    expect(roleInfo('staff', false).summary).toBe('Works with clients.');
    expect(roleInfo('admin', false)).toEqual(roleInfo('admin', true));
  });
});
