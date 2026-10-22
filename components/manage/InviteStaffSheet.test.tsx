/**
 * Inviting someone (web roles plan §5.1, §5.3, §5.5; the web's InviteForm): the numbered steps, the
 * role cards (Front desk on a server that knows it, Admin only for the owner or an admin with
 * "Billing, payouts and admins"), the role, calendars and settings sent in one request with the
 * standard choices preselected, the owner's switches for a new admin, and the web's confirmation
 * for each thing the server can do. Refusals show inside the sheet.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockInvite = jest.fn();
jest.mock('@/lib/queries/useTeamMutations', () => ({
  useInviteStaff: () => ({ mutateAsync: mockInvite, isPending: false }),
}));

import { InviteStaffSheet } from '@/components/manage/InviteStaffSheet';
import { ApiError } from '@/lib/api/client';
import type { TeamViewer } from '@/lib/roles/roles';

const OWNER: TeamViewer = { staffId: 'o', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true };
const ADMIN_WITH: TeamViewer = { staffId: 'a', isOwner: false, billingPayoutsAdmins: true, rolesKnown: true };
const LIMITED_ADMIN: TeamViewer = { staffId: 'a', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true };
const calendars = [
  { id: 'c1', name: 'Chair 1', is_active: true, calendar_type: 'practitioner' },
  { id: 'c2', name: 'Chair 2', is_active: true, calendar_type: 'practitioner' },
  { id: 'r1', name: 'Room', is_active: true, calendar_type: 'resource' },
];
const SENT = { message: 'Invite sent', invite_email_sent: true, joins_existing_login: false, staff: {} };

const mockOnClose = jest.fn();

async function open(viewer?: TeamViewer) {
  await render(
    <InviteStaffSheet visible onClose={mockOnClose} practitioners={calendars} viewer={viewer} businessName="Glow Studio" />,
  );
}

async function type(label: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), text);
  });
}

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

async function flip(label: string, value: boolean) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'valueChange', value);
  });
}

beforeEach(() => {
  mockInvite.mockReset();
  mockOnClose.mockReset();
});

it('walks through the steps, with the email help and the standard choices preselected', async () => {
  await open(OWNER);
  expect(screen.getByText('1. Who are you inviting?')).toBeTruthy();
  expect(screen.getByText('The invitation goes here, and they sign in with it.')).toBeTruthy();
  expect(screen.getByText('2. What will they do?')).toBeTruthy();
  expect(screen.getByText('Works with clients, with the Staff till settings.')).toBeTruthy();
  expect(screen.getByText('A stylist, therapist or practitioner who looks after their own clients.')).toBeTruthy();
  expect(screen.getByText('3. Which calendars are theirs?')).toBeTruthy();
  expect(screen.getByText('4. What can they see?')).toBeTruthy();
  // Resource calendars are never someone's.
  expect(screen.queryByText('Room')).toBeNull();
  expect(screen.getByLabelText('Can see client phone numbers and emails').props.value).toBe(true);
  expect(screen.getByLabelText('Can export client data').props.value).toBe(false);
  expect(screen.getByRole('radio', { name: /Can book and change/ }).props.accessibilityState).toMatchObject({ selected: true });
});

it('sends the role, calendars and settings in one request', async () => {
  mockInvite.mockResolvedValue(SENT);
  await open(OWNER);
  await type('Their name', 'Jess Smith');
  await type('Their email address', ' Jess@X.com ');
  await press('Front desk');
  expect(screen.getByText("A receptionist who doesn't take appointments themselves usually needs none.")).toBeTruthy();
  await press('Chair 1');
  await flip('Can see client phone numbers and emails', false);
  await press('View only');
  await press('Send invitation');
  expect(mockInvite).toHaveBeenCalledTimes(1);
  expect(mockInvite).toHaveBeenCalledWith({
    email: 'jess@x.com',
    name: 'Jess Smith',
    role: 'staff',
    role_key: 'front_desk',
    permissions: { client_contact: false, other_diaries: 'view', export_clients: false },
    calendar_ids: ['c1'],
  });
});

it('warns when View only or Hidden leaves them with no calendar', async () => {
  await open(OWNER);
  await type('Their name', 'Jess Smith');
  await press('Hidden');
  expect(screen.getByText('Jess has no calendar. With View only they can look but not book. With Hidden they see no bookings.')).toBeTruthy();
  await press('Chair 2');
  expect(screen.queryByText(/has no calendar/)).toBeNull();
});

describe('an admin', () => {
  it('lets the owner choose what else they manage, both off to start', async () => {
    mockInvite.mockResolvedValue(SENT);
    await open(OWNER);
    await type('Their email address', 'boss@x.com');
    await press('Chair 1');
    await press('Admin');
    expect(screen.getByText('3. What else can they manage?')).toBeTruthy();
    expect(screen.queryByText('3. Which calendars are theirs?')).toBeNull();
    expect(screen.getByLabelText('Billing, payouts and admins').props.value).toBe(false);
    expect(screen.getByLabelText('Can export client data').props.value).toBe(false);
    await flip('Billing, payouts and admins', true);
    await press('Send invitation');
    expect(mockInvite).toHaveBeenCalledWith({
      email: 'boss@x.com',
      name: undefined,
      role: 'admin',
      role_key: 'admin',
      permissions: { billing_payouts_admins: true, export_clients: false },
    });
  });

  it('tells an admin with the billing switch that only the owner can give a new admin more, and sends no settings', async () => {
    mockInvite.mockResolvedValue(SENT);
    await open(ADMIN_WITH);
    await type('Their email address', 'boss@x.com');
    await press('Admin');
    expect(
      screen.getByText(
        "New admins start without access to billing, payouts or other admins, and can't export client data. Only the owner can change that.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Billing, payouts and admins')).toBeNull();
    await press('Send invitation');
    expect(mockInvite.mock.calls[0][0]).not.toHaveProperty('permissions');
  });

  it('is not offered to an admin without the billing switch, who is told why', async () => {
    await open(LIMITED_ADMIN);
    expect(screen.queryByText('Admin')).toBeNull();
    expect(screen.getByText('Front desk')).toBeTruthy();
    expect(screen.getByText('Only the owner, or an admin they allow, can invite an admin.')).toBeTruthy();
  });
});

it('keeps to Staff and Admin, and sends no settings, on a server before the four roles', async () => {
  mockInvite.mockResolvedValue(SENT);
  await open();
  expect(screen.getByText('Admin')).toBeTruthy();
  expect(screen.queryByText('Front desk')).toBeNull();
  expect(screen.queryByText('4. What can they see?')).toBeNull();
  await type('Their email address', 'new@x.com');
  await press('Send invitation');
  expect(mockInvite).toHaveBeenCalledWith({ email: 'new@x.com', name: undefined, role: 'staff', role_key: 'staff' });
});

describe('after sending', () => {
  it('says the invitation went, by name', async () => {
    mockInvite.mockResolvedValue(SENT);
    await open(OWNER);
    await type('Their name', 'Jess Smith');
    await type('Their email address', 'jess@x.com');
    await press('Send invitation');
    expect(screen.getByText('Invitation sent')).toBeTruthy();
    expect(
      screen.getByText(
        "Invitation sent to jess@x.com. Jess Smith can choose a password and sign in from the email. You'll see Invited next to their name until they do.",
      ),
    ).toBeTruthy();
    await press('Done');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('says "They" when there is no name', async () => {
    mockInvite.mockResolvedValue(SENT);
    await open(OWNER);
    await type('Their email address', 'jess@x.com');
    await press('Send invitation');
    expect(screen.getByText(/^Invitation sent to jess@x.com\. They can choose a password/)).toBeTruthy();
  });

  it('explains joining with a login they already have', async () => {
    mockInvite.mockResolvedValue({ ...SENT, joins_existing_login: true });
    await open(OWNER);
    await type('Their email address', 'jess@x.com');
    await press('Front desk');
    await press('Send invitation');
    expect(
      screen.getByText(
        "jess@x.com already has a ResNeo login, so there's no password to set. We've emailed them to join Glow Studio as Front desk, and they'll also see your invitation next time they sign in.",
      ),
    ).toBeTruthy();
  });

  it('explains being added without an email', async () => {
    mockInvite.mockResolvedValue({ ...SENT, invite_email_sent: false });
    await open(OWNER);
    await type('Their name', 'Jess');
    await type('Their email address', 'jess@x.com');
    await press('Send invitation');
    expect(screen.getByText('Added to your team')).toBeTruthy();
    expect(
      screen.getByText(
        'Jess is on your team as Staff. They may already have a ResNeo login: they can sign in as usual, or use Forgot password on the sign-in page.',
      ),
    ).toBeTruthy();
  });

  it('starts again for the next person', async () => {
    mockInvite.mockResolvedValue(SENT);
    await open(OWNER);
    await type('Their email address', 'jess@x.com');
    await press('Admin');
    await press('Send invitation');
    await press('Invite someone else');
    expect(screen.getByText('1. Who are you inviting?')).toBeTruthy();
    expect(screen.getByLabelText('Their email address').props.value).toBe('');
    expect(screen.getByText('3. Which calendars are theirs?')).toBeTruthy();
  });
});

it('asks for an email address before sending', async () => {
  await open(OWNER);
  await press('Send invitation');
  expect(screen.getByText('Enter their email address.')).toBeTruthy();
  await type('Their email address', 'not-an-email');
  await press('Send invitation');
  expect(screen.getByText("That doesn't look like an email address. Check it and try again.")).toBeTruthy();
  expect(mockInvite).not.toHaveBeenCalled();
});

it("shows the server's words for the daily invite limit inside the sheet", async () => {
  mockInvite.mockRejectedValue(
    new ApiError("You've sent a lot of invites today. Please try again tomorrow.", 429, {
      error: "You've sent a lot of invites today. Please try again tomorrow.",
      code: 'RATE_LIMITED',
      retry_after_seconds: 3600,
    }),
  );
  await open(OWNER);
  await type('Their email address', 'new@x.com');
  await press('Send invitation');
  expect(screen.getByText("You've sent a lot of invites today. Please try again tomorrow.")).toBeTruthy();
  expect(screen.getByText('Send invitation')).toBeTruthy();
});
