/**
 * The Team screen (web roles plan §5.1 to §5.5, §5.11; the web's Settings, Staff): what team logins
 * are, a visible "Invite someone" button, the role guide (open while the team is just you), each
 * row's role, sign-in status, "You" and settings summary, the sign-out timer in plain words, and
 * the sheets learning who is looking (the owner flag, "Billing, payouts and admins", and whether
 * the server knows Front desk).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { name: 'Glow Studio' } }) }));

let mockMe: Record<string, unknown> = {};
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: mockMe }, isLoading: false }) }));
let mockMembers: unknown[] = [];
jest.mock('@/lib/queries/useStaffList', () => ({
  useStaffList: () => ({ data: { staff: mockMembers }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
}));
jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({
    isSuccess: true,
    data: {
      practitioners: [
        { id: 'c1', name: 'Chair 1', is_active: true, calendar_type: 'practitioner' },
        { id: 'c2', name: 'Chair 2', is_active: true, calendar_type: 'practitioner' },
      ],
    },
  }),
}));
let mockTimeout: number | undefined = 480;
jest.mock('@/lib/queries/useSessionSettings', () => ({
  useSessionSettings: () => ({ data: mockTimeout === undefined ? undefined : { session_timeout_minutes: mockTimeout } }),
}));

const mockMemberSheet = jest.fn();
const mockInviteSheet = jest.fn();
jest.mock('@/components/manage/StaffMemberSheet', () => ({
  StaffMemberSheet: (props: unknown) => {
    mockMemberSheet(props);
    return null;
  },
}));
jest.mock('@/components/manage/InviteStaffSheet', () => ({
  InviteStaffSheet: (props: unknown) => {
    mockInviteSheet(props);
    return null;
  },
}));
jest.mock('@/components/manage/MyAccountSheet', () => ({ MyAccountSheet: () => null }));
jest.mock('@/components/manage/SessionSettingsSheet', () => ({ SessionSettingsSheet: () => null }));

import TeamScreen from '@/app/(app)/manage/team';

const owner = { id: 'o1', name: 'Ana', email: 'ana@x.com', role: 'admin', role_key: 'owner', is_owner: true, permissions: {}, has_signed_in: true };
const admin = {
  id: 'a1',
  name: 'Ben',
  email: 'ben@x.com',
  role: 'admin',
  role_key: 'admin',
  is_owner: false,
  permissions: {},
  has_signed_in: true,
};
const desk = {
  id: 'f1',
  name: 'Cal',
  email: 'cal@x.com',
  role: 'staff',
  role_key: 'front_desk',
  is_owner: false,
  // As the server writes them for someone added since the switches: export off.
  permissions: { role_key: 'front_desk', export_clients: false },
  has_signed_in: false,
  invite_pending: true,
  linked_calendar_ids: ['c1', 'c2'],
};
const staff = {
  id: 's1',
  name: 'Dee',
  email: 'dee@x.com',
  role: 'staff',
  role_key: 'staff',
  is_owner: false,
  permissions: { client_contact: false, other_diaries: 'view', export_clients: false },
  has_signed_in: false,
  invite_pending: false,
  linked_calendar_ids: [],
};

const ME_FIELDS = { linked_practitioner_id: null, linked_calendar_ids: [] };

beforeEach(() => {
  mockMemberSheet.mockClear();
  mockInviteSheet.mockClear();
  mockMembers = [owner, admin, desk, staff];
  mockTimeout = 480;
});

it('explains team logins and offers a labelled "Invite someone" button', async () => {
  mockMe = { ...admin, ...ME_FIELDS };
  await render(<TeamScreen />);
  expect(
    screen.getByText(
      'Give each person who works with you their own login. Their role decides what they can do, and you can fine-tune what Front desk and Staff see. Team logins are unlimited on every plan.',
    ),
  ).toBeTruthy();
  expect(mockInviteSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
  await act(async () => {
    fireEvent.press(screen.getByText('Invite someone'));
  });
  expect(mockInviteSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true, businessName: 'Glow Studio' }));
});

it('names each role, the sign-in status and you on the rows', async () => {
  mockMe = { ...admin, ...ME_FIELDS };
  await render(<TeamScreen />);
  expect(screen.getByLabelText('Ana, Owner')).toBeTruthy();
  expect(screen.getByLabelText('Ben, Admin, You')).toBeTruthy();
  expect(screen.getByLabelText('Cal, Front desk, Invited')).toBeTruthy();
  expect(screen.getByLabelText('Dee, Staff, Not signed in yet')).toBeTruthy();
});

it("sums up each person's settings on their row", async () => {
  mockMe = { ...owner, ...ME_FIELDS };
  mockMembers = [owner, admin, { ...admin, id: 'a2', name: 'Bo', permissions: { billing_payouts_admins: false, export_clients: false } }, desk, staff];
  await render(<TeamScreen />);
  expect(screen.getByText('Manages billing, payouts and admins · Can export client data')).toBeTruthy();
  expect(screen.getByText('Calendars: Chair 1, Chair 2')).toBeTruthy();
  expect(screen.getByText('No calendar · Client phone numbers and emails hidden · Other diaries: View only')).toBeTruthy();
});

it('names a single calendar, and falls back to the server summary for one that is switched off', async () => {
  mockMe = { ...owner, ...ME_FIELDS };
  mockMembers = [
    owner,
    { ...desk, linked_calendar_ids: ['c1'] },
    { ...staff, id: 's2', name: 'Eve', linked_calendar_ids: ['c2', 'off'], linked_practitioner_name: 'Chair 2, Old chair', permissions: {} },
    { ...staff, id: 's3', name: 'Fin', linked_calendar_ids: [], permissions: { other_diaries: 'hidden' } },
  ];
  await render(<TeamScreen />);
  expect(screen.getByText('Calendar: Chair 1')).toBeTruthy();
  // Absent means on, as before the switch existed (roles plan §5.5).
  expect(screen.getByText('Calendars: Chair 2, Old chair · Can export client data')).toBeTruthy();
  expect(screen.getByText('No calendar · Other diaries: Hidden · Can export client data')).toBeTruthy();
});

it('opens the role guide while the team is just you', async () => {
  mockMe = { ...owner, ...ME_FIELDS };
  mockMembers = [owner];
  await render(<TeamScreen />);
  expect(screen.getByText('What can each role do?')).toBeTruthy();
  expect(screen.getByText('A receptionist who books for everyone and takes payments.')).toBeTruthy();
  expect(screen.getByText('Take payments at the till, without refunds or price changes')).toBeTruthy();
  expect(screen.getAllByText('Settings, reports, the plan or the team')).toHaveLength(2);
  expect(screen.getByText(/^Not sure\? Choose Staff\. You can change anyone's role at any time\./)).toBeTruthy();
  expect(
    screen.getByText('What Front desk and Staff can do at the till is up to you. Change it under Checkout settings, then Who can do what.'),
  ).toBeTruthy();
});

it('folds the role guide away once there is a team, and opens it on a tap', async () => {
  mockMe = { ...owner, ...ME_FIELDS };
  await render(<TeamScreen />);
  expect(screen.queryByText('A receptionist who books for everyone and takes payments.')).toBeNull();
  await act(async () => {
    fireEvent.press(screen.getByLabelText('What can each role do?'));
  });
  expect(screen.getByText('A receptionist who books for everyone and takes payments.')).toBeTruthy();
});

it('says when people are signed out, in plain words', async () => {
  mockMe = { ...admin, ...ME_FIELDS };
  await render(<TeamScreen />);
  expect(screen.getByText('Signing out after a break')).toBeTruthy();
  expect(screen.getByText('After 8 hours without using ResNeo on the web')).toBeTruthy();
});

it("reads the web's 7 days when no time is saved", async () => {
  mockMe = { ...admin, ...ME_FIELDS };
  mockTimeout = 0;
  await render(<TeamScreen />);
  expect(screen.getByText('After 7 days without using ResNeo on the web')).toBeTruthy();
});

it('tells the sheets who is looking: an admin without the billing switch', async () => {
  mockMe = { ...admin, permissions: { billing_payouts_admins: false }, ...ME_FIELDS };
  await render(<TeamScreen />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Ana, Owner'));
  });
  expect(mockMemberSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({
      visible: true,
      member: expect.objectContaining({ id: 'o1' }),
      businessName: 'Glow Studio',
      viewer: { staffId: 'a1', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true },
    }),
  );
  expect(mockInviteSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({ viewer: expect.objectContaining({ billingPayoutsAdmins: false }) }),
  );
});

it('knows the owner', async () => {
  mockMe = { ...owner, ...ME_FIELDS };
  await render(<TeamScreen />);
  expect(mockMemberSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({ viewer: { staffId: 'o1', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true } }),
  );
});

it('shows Front desk and Staff their own login, and no team to manage', async () => {
  mockMe = { ...desk, has_signed_in: true, invite_pending: false };
  await render(<TeamScreen />);
  expect(
    screen.getByText(
      'Each person who works here has their own login, and their role decides what they can do. Only the owner or an admin can invite people and change roles.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Invite someone')).toBeNull();
  expect(screen.queryByText('Signing out after a break')).toBeNull();
  expect(screen.getByLabelText('My account')).toBeTruthy();
});
