/**
 * The Team screen with the four roles (web roles plan A1): each row names Owner, Admin, Front desk
 * or Staff, the role descriptions come from the copy deck, and the sheets learn who is looking
 * (the owner flag, "Billing, payouts and admins", and whether the server knows Front desk).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});

let mockMe: Record<string, unknown> = {};
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: mockMe }, isLoading: false }) }));
let mockMembers: unknown[] = [];
jest.mock('@/lib/queries/useStaffList', () => ({
  useStaffList: () => ({ data: { staff: mockMembers }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
}));
jest.mock('@/lib/queries/usePractitioners', () => ({ usePractitioners: () => ({ data: { practitioners: [] } }) }));
jest.mock('@/lib/queries/useSessionSettings', () => ({ useSessionSettings: () => ({ data: { session_timeout_minutes: 480 } }) }));

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

const owner = { id: 'o1', name: 'Ana', email: 'ana@x.com', role: 'admin', role_key: 'owner', is_owner: true, permissions: {} };
const admin = { id: 'a1', name: 'Ben', email: 'ben@x.com', role: 'admin', role_key: 'admin', is_owner: false, permissions: {} };
const desk = {
  id: 'f1',
  name: 'Cal',
  email: 'cal@x.com',
  role: 'staff',
  role_key: 'front_desk',
  is_owner: false,
  permissions: { role_key: 'front_desk' },
};
const staff = { id: 's1', name: 'Dee', email: 'dee@x.com', role: 'staff', role_key: 'staff', is_owner: false, permissions: {} };

beforeEach(() => {
  mockMemberSheet.mockClear();
  mockInviteSheet.mockClear();
  mockMembers = [owner, admin, desk, staff];
});

it('names the four roles on the rows and in the descriptions', async () => {
  mockMe = { ...admin, linked_practitioner_id: null, linked_calendar_ids: [] };
  await render(<TeamScreen />);
  expect(screen.getByLabelText('Ana, Owner')).toBeTruthy();
  expect(screen.getByLabelText('Ben, Admin')).toBeTruthy();
  expect(screen.getByLabelText('Cal, Front desk')).toBeTruthy();
  expect(screen.getByLabelText('Dee, Staff')).toBeTruthy();
  expect(screen.getByText(/Takes bookings and payments, with the Front desk till settings\./)).toBeTruthy();
});

it('tells the sheets who is looking: an admin without the billing switch', async () => {
  mockMe = { ...admin, permissions: { billing_payouts_admins: false }, linked_practitioner_id: null, linked_calendar_ids: [] };
  await render(<TeamScreen />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Ana, Owner'));
  });
  expect(mockMemberSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({
      visible: true,
      member: expect.objectContaining({ id: 'o1' }),
      viewer: { staffId: 'a1', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true },
    }),
  );
  expect(mockInviteSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({ viewer: expect.objectContaining({ billingPayoutsAdmins: false }) }),
  );
});

it('knows the owner', async () => {
  mockMe = { ...owner, linked_practitioner_id: null, linked_calendar_ids: [] };
  await render(<TeamScreen />);
  expect(mockMemberSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({ viewer: { staffId: 'o1', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true } }),
  );
});
