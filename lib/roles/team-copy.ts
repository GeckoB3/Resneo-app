import {
  contactSwitchOn,
  diaryChoiceOf,
  exportSwitchOn,
  roleKeyOf,
  type DiaryAccess,
  type RoleSubject,
} from '@/lib/roles/roles';
import type { RoleChoice, RoleKey, TeamMember } from '@/types/staff';

/**
 * The words on the Team screen and its sheets (web roles plan §5.1 to §5.5, §5.11, Appendix C), in
 * one place so the screen, the invite sheet and each person's sheet say the same thing. Where the
 * web has the string (its `settings/sections/team/team-copy.ts`, `InviteForm`, `MemberCard`,
 * `RoleGuide` and `StaffSection`), these are its words; where the app's screens differ (switches
 * rather than ticks, the app's own menu names), the words follow the app. Plain, warm, second
 * person, and no em-dashes.
 */

export interface RoleInfo {
  label: string;
  /** Appendix C's one line. */
  summary: string;
  /** Who the role suits. */
  goodFor: string;
  can: string[];
  cannot: string[];
}

/** The four roles as the web's guide explains them (web `ROLE_INFO`). */
export const ROLE_INFO: Record<RoleKey, RoleInfo> = {
  owner: {
    label: 'Owner',
    summary: 'The person the business belongs to.',
    goodFor: 'Every business has one owner. Only a transfer changes who it is.',
    can: [
      'Everything an admin can do',
      'Transfer ownership to another admin',
      'Choose which admins can manage billing, payouts and other admins',
    ],
    cannot: [],
  },
  admin: {
    label: 'Admin',
    summary: 'Runs the business day to day.',
    goodFor: 'A manager or business partner you trust with settings, prices and reports.',
    can: [
      'Every booking, client and report',
      'All settings, services and calendars',
      'Invite and look after Front desk and Staff',
    ],
    cannot: ['The plan, billing, payouts and other admins, unless the owner allows it'],
  },
  front_desk: {
    label: 'Front desk',
    summary: 'Takes bookings and payments, with the Front desk till settings.',
    goodFor: 'A receptionist who books for everyone and takes payments.',
    can: [
      "Book, move and check in on everyone's calendar",
      'Take payments at the till, including refunds and price changes',
      'Set hours, breaks and service settings for the calendars you give them',
    ],
    cannot: ['Settings, reports, the plan or the team'],
  },
  staff: {
    label: 'Staff',
    summary: 'Works with clients, with the Staff till settings.',
    goodFor: 'A stylist, therapist or practitioner who looks after their own clients.',
    can: [
      "Book, move and check in on everyone's calendar",
      'Take payments at the till, without refunds or price changes',
      'Set hours, breaks and service settings for the calendars you give them',
    ],
    cannot: ['Settings, reports, the plan or the team'],
  },
};

/** The order the role guide lists them in. */
export const ROLE_GUIDE_ORDER: readonly RoleKey[] = ['owner', 'admin', 'front_desk', 'staff'];

/**
 * A business without Checkout has no till, so its role lines leave the till out (web
 * `roleInfo`, word for word).
 */
const NO_TILL: Partial<Record<RoleKey, Pick<RoleInfo, 'summary' | 'goodFor'>>> = {
  front_desk: { summary: 'Takes bookings for everyone.', goodFor: 'A receptionist who books for everyone.' },
  staff: { summary: 'Works with clients.', goodFor: ROLE_INFO.staff.goodFor },
};

export function roleInfo(key: RoleKey, checkoutOn: boolean): RoleInfo {
  const info = ROLE_INFO[key];
  if (checkoutOn) return info;
  return { ...info, ...NO_TILL[key], can: info.can.filter((line) => !line.includes('at the till')) };
}

/**
 * What Front desk and Staff can do at the till is the role's. The web says "Settings, then
 * Checkout, then Who can do what"; in the app it is Checkout settings, then Who can do what.
 */
export const TILL_NOTE =
  'What Front desk and Staff can do at the till is up to you. Change it under Checkout settings, then Who can do what.';

/** "Other people's diaries" and what each choice means (web `DIARY_CHOICES`). */
export const DIARY_CHOICES: { value: DiaryAccess; label: string; help: string }[] = [
  { value: 'book', label: 'Can book and change', help: "They can book, move and change bookings on everyone's calendar." },
  {
    value: 'view',
    label: 'View only',
    help: "They can see everyone's bookings, but only book and change bookings on their own calendars.",
  },
  { value: 'hidden', label: 'Hidden', help: 'They only see bookings on their own calendars.' },
];

/** The settings on a person, with their help (web `SETTING_COPY`, Appendix C). */
export const SETTING_COPY = {
  contactLabel: 'Can see client phone numbers and emails',
  contactHelp:
    "When this is off, they see 'Hidden' instead of phone numbers and emails. They can still book, check in and take payments for those clients.",
  diariesLabel: "Other people's diaries",
  exportLabel: 'Can export client data',
  exportHelp:
    "Shows or hides the buttons that download client lists. It can't stop someone copying details they can already see. To keep phone numbers and emails private, switch off 'Can see client phone numbers and emails'.",
  /** An admin has no contact switch to point to: admins always see phone numbers and emails (web `exportHelpAdmin`). */
  exportHelpAdmin:
    "Shows or hides the buttons that download client lists. Admins always see client phone numbers and emails, so it can't stop them copying details they can see.",
  billingLabel: 'Billing, payouts and admins',
  billingHelp: 'Lets this admin manage your plan, payouts and other admins. Only you can change this.',
  calendarsLabel: 'Their calendars',
  calendarsHelp:
    'Tick the calendars that belong to them. They can set the hours, breaks and service settings for these. With View only or Hidden, these are the only calendars they can book.',
  noCalendars: 'You have no bookable calendars yet. Add one under Calendar availability, then tick it here.',
  /** Appendix C. */
  noCalendarWarning: (name: string) =>
    `${name} has no calendar. With View only they can look but not book. With Hidden they see no bookings.`,
} as const;

/** Everything else the Team screen and its sheets say. `{braces}` are filled in by `teamT`. */
export const TEAM_COPY = {
  // The screen
  'screen.title': 'Team',
  'screen.intro':
    'Give each person who works with you their own login. Their role decides what they can do, and you can fine-tune what Front desk and Staff see. Team logins are unlimited on every plan.',
  'screen.intro.notAdmin':
    'Each person who works here has their own login, and their role decides what they can do. Only the owner or an admin can invite people and change roles.',
  'screen.invite': 'Invite someone',
  'screen.list.title': 'Your team',
  'screen.list.empty': 'Nobody is on your team yet.',
  'screen.list.tapHint': 'Tap someone to change their role, their calendars and what they can see.',
  'screen.noCalendars': 'To give someone a calendar, first add one under Calendar availability.',
  'screen.loadError': 'We could not load your team. Please try again.',
  'screen.account.title': 'Your login',
  'screen.account.label': 'Your name, email and password',

  // The role guide
  'guide.title': 'What can each role do?',
  'guide.notSure.lead': 'Not sure? Choose ',
  'guide.notSure.role': 'Staff',
  'guide.notSure.rest':
    ". You can change anyone's role at any time. For Front desk and Staff you can also hide client phone numbers and emails, and choose what they see of other people's diaries.",
  'guide.cannot': 'Not: ',
  'guide.readMore': 'Read more about roles and permissions',

  // A person's row
  'row.invited': 'Invited',
  'row.notSignedIn': 'Not signed in yet',
  'row.you': 'You',
  'status.invited': "{name} hasn't accepted their invitation yet.",
  'status.notSignedIn': "{name} hasn't signed in yet.",

  // The settings summary on a row
  'summary.noCalendar': 'No calendar',
  'summary.calendar': 'Calendar: {names}',
  'summary.calendars': 'Calendars: {names}',
  'summary.contactsHidden': 'Client phone numbers and emails hidden',
  'summary.diaries': 'Other diaries: {choice}',
  'summary.export': 'Can export client data',
  'summary.billing': 'Manages billing, payouts and admins',

  // Signing out after a break. The app does not sign people out itself, so this says the web.
  'timeout.title': 'Signing out after a break',
  'timeout.row': 'After {time} without using ResNeo on the web',
  'timeout.help':
    'How long someone can leave the ResNeo dashboard on the web idle before we sign them out. This applies to everyone on your team.',
  'timeout.label': 'Sign people out after',
  'timeout.hint': 'Shared devices are safer with a shorter time.',
  'timeout.saved': "Saved. We'll sign people out after {time} without using ResNeo on the web.",
  'timeout.error': 'We could not save that. Please try again.',

  // The invite sheet
  'invite.title': 'Invite someone to your team',
  'invite.intro':
    "We'll email them a link to choose their own password and sign in. You don't set a password for them, and you can change everything here later.",
  'invite.step.who': '1. Who are you inviting?',
  'invite.name': 'Their name',
  'invite.name.placeholder': 'For example, Jess Smith',
  'invite.email': 'Their email address',
  'invite.email.help': 'The invitation goes here, and they sign in with it.',
  'invite.email.missing': 'Enter their email address.',
  'invite.email.invalid': "That doesn't look like an email address. Check it and try again.",
  'invite.step.role': '2. What will they do?',
  'invite.role.notSure': "Not sure? Choose Staff. You can change anyone's role at any time.",
  'invite.role.noAdmin': 'Only the owner, or an admin they allow, can invite an admin.',
  'invite.step.calendars': '3. Which calendars are theirs?',
  'invite.calendars.frontDesk': "A receptionist who doesn't take appointments themselves usually needs none.",
  'invite.step.see': '4. What can they see?',
  'invite.see.standard': 'The standard choices suit most teams.',
  'invite.step.manage': '3. What else can they manage?',
  'invite.admin.notOwner':
    "New admins start without access to billing, payouts or other admins, and can't export client data. Only the owner can change that.",
  'invite.send': 'Send invitation',
  'invite.sending': 'Sending…',
  'invite.cancel': 'Cancel',
  'invite.error': 'We could not send that invitation. Please try again.',
  'invite.done.sent': 'Invitation sent',
  'invite.done.joins': 'Invitation sent',
  'invite.done.added': 'Added to your team',
  'invite.done.close': 'Done',
  'invite.done.another': 'Invite someone else',
  'invite.result.joins':
    "{email} already has a ResNeo login, so there's no password to set. We've emailed them to join {business} as {role}, and they'll also see your invitation next time they sign in.",
  'invite.result.sent':
    "Invitation sent to {email}. {who} can choose a password and sign in from the email. You'll see Invited next to their name until they do.",
  'invite.result.added':
    '{who} is on your team as {role}. They may already have a ResNeo login: they can sign in as usual, or use Forgot password on the sign-in page.',

  // A person's sheet
  'member.role': 'Role',
  'member.role.confirm': 'Change role',
  'member.role.keep': 'Keep it as it is',
  'member.role.title.admin': 'Make {name} an admin?',
  'member.role.title.other': "Change {name}'s role to {role}?",
  'member.role.toAdmin': '{name} will see every setting, report and client, and can look after Front desk and Staff.',
  'member.role.toAdmin.owner':
    "They won't manage billing, payouts or other admins, or export client data, until you turn those on for them.",
  'member.role.toAdmin.notOwner':
    'Only the owner can let them manage billing, payouts or other admins, or export client data.',
  'member.role.fromAdmin': '{name} will no longer see Settings, Reports or the team. {role}: {summary}',
  'member.role.other': '{role}: {summary} It suits {goodFor}',
  'member.role.error': 'We could not change their role. Please try again.',
  'member.calendars.error': 'We could not change their calendars. Please try again.',
  'member.calendars.tickAll': 'Tick all',
  'member.calendars.untickAll': 'Untick all',
  'member.calendars.switchedOff.one':
    '{name} also has 1 calendar that is switched off. Switch it back on under Calendar availability.',
  'member.calendars.switchedOff.many':
    '{name} also has {count} calendars that are switched off. Switch them back on under Calendar availability.',
  'member.see': 'What they can see',
  'member.manage': 'What else they can manage',
  'member.switch.error': 'We could not save that change. Please try again.',
  'member.saved': 'Saved',
  'member.signIn': 'Signing in',
  'member.signIn.pending': "If {name} can't find their invitation, check it went to {email}, then send it again.",
  'member.signIn.active': "If {name} can't sign in, they can use Forgot password on the sign-in page.",
  'member.resend': 'Resend invitation',
  'member.resend.help': 'We email the invitation to {email} again.',
  'member.link': 'Email a sign-in link',
  'member.link.help': 'We email {email} a link that signs them in.',
  'member.link.sent': '{said} It went to {email}.',
  'member.link.sentDefault': 'We emailed them a new link.',
  'member.link.error': 'We could not send that email. Please try again.',
  'member.sending': 'Sending…',
  'member.password': 'Set a new password',
  'member.password.help': 'Choose a password for them, then tell them it in person.',
  'member.password.title': 'Set a new password for {name}',
  'member.password.intro': 'They sign in with this until they change it. Tell them it in person rather than by text or email.',
  'member.password.field': 'New password',
  'member.password.placeholder': 'At least 8 characters',
  'member.password.short': 'Use at least 8 characters.',
  'member.password.save': 'Set password',
  'member.password.saving': 'Saving…',
  'member.password.cancel': 'Cancel',
  'member.password.done':
    '{name} can now sign in with the new password. Tell them it in person, and ask them to choose their own after they sign in.',
  'member.password.error': 'We could not set that password. Please try again.',
  'member.remove': 'Remove from your team',
  'member.remove.help': "{name} won't be able to sign in to {business} any more. Their bookings stay in your diary.",
  'member.remove.button': 'Remove {name}',
  'member.remove.title': 'Remove {name} from your team?',
  'member.remove.body':
    "They won't be able to sign in to {business} any more. Their bookings stay in your diary, and their calendar stays bookable. To stop new bookings on it, switch off Active (bookable) under Calendar availability.",
  'member.remove.confirm': 'Remove',
  'member.remove.removing': 'Removing…',
  'member.remove.cancel': 'Cancel',
  'member.remove.done': '{name} is no longer on your team.',
  'member.remove.error': 'We could not remove them. Please try again.',
  // Someone who hasn't accepted yet: removing them cancels the invitation (web `CANCEL_INVITE_COPY`).
  'member.cancelInvite': 'Cancel their invitation',
  'member.cancelInvite.help':
    "They haven't joined yet. Cancel the invitation and it no longer lets them into {business}. You can invite them again any time.",
  'member.cancelInvite.button': 'Cancel invitation',
  'member.cancelInvite.title': 'Cancel the invitation for {name}?',
  'member.cancelInvite.body': 'The email we sent them will no longer let them into {business}. You can invite them again any time.',
  'member.cancelInvite.confirm': 'Cancel invitation',
  'member.cancelInvite.cancelling': 'Cancelling…',
  'member.cancelInvite.keep': 'Keep invitation',
  'member.cancelInvite.done': 'The invitation for {name} is cancelled.',
  'member.close': 'Close',

  // Rows nobody manages from here (Appendix C; web MemberCard)
  'member.ownerProtected': 'Only {owner} can change this. The owner can transfer ownership from their own row.',
  'member.self': 'To change your own role or settings, ask the owner or another admin.',
  'member.self.owner': "You're the owner, so nobody else can change or remove you.",
  'member.transfer': 'Transfer ownership from your ResNeo dashboard on the web.',
  'member.adminLocked': 'Only the owner, or an admin they allow, can change another admin.',
} as const;

export type TeamCopyId = keyof typeof TEAM_COPY;

export function teamT(id: TeamCopyId, values: Record<string, string | number> = {}): string {
  return TEAM_COPY[id].replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

/** The web help article on roles, opened in the in-app browser. */
export function rolesHelpUrl(webOrigin: string): string {
  return `${webOrigin || 'https://www.resneo.com'}/help/settings/roles-and-permissions`;
}

/** A person's name as the screens use it: their name, else their email. */
export function displayNameOf(member: Pick<TeamMember, 'name' | 'email'>): string {
  return member.name?.trim() || member.email || 'Team member';
}

/** A person's first name, for sentences ("Make Jess an admin?"); their email when they have no name. */
export function firstNameOf(member: Pick<TeamMember, 'name' | 'email'>): string {
  return member.name?.trim().split(/\s+/)[0] || member.email || 'This person';
}

/** "Invited" (nobody has claimed the invitation) or "Not signed in yet", with the sheet's line. */
export function memberStatus(
  member: Pick<TeamMember, 'name' | 'email' | 'invite_pending' | 'has_signed_in'>,
): { label: string; text: string; tone: 'warning' | 'neutral' } | null {
  const name = firstNameOf(member);
  if (member.invite_pending) return { label: teamT('row.invited'), text: teamT('status.invited', { name }), tone: 'warning' };
  if (member.has_signed_in === false) {
    return { label: teamT('row.notSignedIn'), text: teamT('status.notSignedIn', { name }), tone: 'neutral' };
  }
  return null;
}

/**
 * A person's calendar ids: the unified list when the server sends one (an empty list is no
 * calendars, as after "Untick all"), else the single calendar an older server sends.
 */
export function memberCalendarIds(member: Pick<TeamMember, 'linked_calendar_ids' | 'linked_practitioner_id'>): string[] {
  if (Array.isArray(member.linked_calendar_ids)) return [...member.linked_calendar_ids];
  return member.linked_practitioner_id ? [member.linked_practitioner_id] : [];
}

/**
 * Every calendar of a person's by name. The calendar list has only the switched-on ones, so when it
 * does not name them all, the team route's own summary (every name, comma separated) stands in.
 */
export function memberCalendarNames(
  member: Pick<TeamMember, 'linked_calendar_ids' | 'linked_practitioner_id' | 'linked_practitioner_name'>,
  calendars: readonly { id: string; name: string }[],
): string[] {
  const ids = memberCalendarIds(member);
  if (ids.length === 0) return [];
  const byId = new Map(calendars.map((c) => [c.id, c.name]));
  if (ids.every((id) => byId.has(id))) return ids.map((id) => byId.get(id)!);
  const fromServer = (member.linked_practitioner_name ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (fromServer.length > 0) return fromServer;
  return ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

/**
 * The one-line summary of a person's settings on their row (web `settingsSummary`), so a manager
 * can scan the team: every calendar by name, then whatever differs from the standard settings.
 * Admins show what else they manage; the owner shows nothing.
 */
export function memberSettingsSummary(member: RoleSubject, calendarNames: readonly string[]): string[] {
  const role = roleKeyOf(member);
  if (role === 'owner') return [];
  if (role === 'admin') {
    const lines: string[] = [];
    if (member.permissions?.billing_payouts_admins !== false) lines.push(teamT('summary.billing'));
    if (exportSwitchOn(member)) lines.push(teamT('summary.export'));
    return lines;
  }
  const lines = [
    calendarNames.length === 0
      ? teamT('summary.noCalendar')
      : teamT(calendarNames.length === 1 ? 'summary.calendar' : 'summary.calendars', { names: calendarNames.join(', ') }),
  ];
  if (!contactSwitchOn(member)) lines.push(teamT('summary.contactsHidden'));
  const diaries = diaryChoiceOf(member);
  if (diaries !== 'book') {
    lines.push(teamT('summary.diaries', { choice: DIARY_CHOICES.find((c) => c.value === diaries)?.label ?? diaries }));
  }
  if (exportSwitchOn(member)) lines.push(teamT('summary.export'));
  return lines;
}

/**
 * What changing someone's role asks first (web `MemberCard` `changeRole`): becoming an admin says
 * what they will see, and what only the owner can give them; leaving admin says what they lose;
 * otherwise the new role and who it suits.
 */
export function roleChangeQuestion(
  member: Pick<TeamMember, 'name' | 'email' | 'role'> & RoleSubject,
  next: RoleChoice,
  viewerIsOwner: boolean,
  checkoutOn = true,
): { title: string; message: string } {
  const name = firstNameOf(member);
  const info = roleInfo(next, checkoutOn);
  if (next === 'admin') {
    return {
      title: teamT('member.role.title.admin', { name }),
      message: `${teamT('member.role.toAdmin', { name })} ${teamT(viewerIsOwner ? 'member.role.toAdmin.owner' : 'member.role.toAdmin.notOwner')}`,
    };
  }
  const goodFor = `${info.goodFor.charAt(0).toLowerCase()}${info.goodFor.slice(1)}`;
  return {
    title: teamT('member.role.title.other', { name, role: info.label }),
    message:
      member.role === 'admin'
        ? teamT('member.role.fromAdmin', { name, role: info.label, summary: info.summary })
        : teamT('member.role.other', { role: info.label, summary: info.summary, goodFor }),
  };
}

/** What the server did with an invitation, as the web's confirmation says it (web `invitedNotice`). */
export interface InviteOutcome {
  email: string;
  name: string | null;
  role: RoleChoice;
  inviteEmailSent: boolean;
  joinsExistingLogin: boolean;
}

export function invitedNotice(result: InviteOutcome, businessName: string): { title: string; text: string } {
  const who = result.name || result.email;
  const role = ROLE_INFO[result.role].label;
  if (result.joinsExistingLogin) {
    return {
      title: teamT('invite.done.joins'),
      text: teamT('invite.result.joins', { email: result.email, business: businessName, role }),
    };
  }
  if (result.inviteEmailSent) {
    return {
      title: teamT('invite.done.sent'),
      text: teamT('invite.result.sent', { email: result.email, who: who === result.email ? 'They' : who }),
    };
  }
  return { title: teamT('invite.done.added'), text: teamT('invite.result.added', { who, role }) };
}

/** "8 hours", "24 hours", "7 days", "30 minutes", as the choices say them (web `formatSessionTimeoutLabel`). */
export function formatSignOutAfter(minutes: number): string {
  if (minutes > 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minutes`;
}
