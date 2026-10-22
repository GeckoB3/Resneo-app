/**
 * Inviting with the four roles (web roles plan A1): Front desk is a choice on a server that knows
 * it, Admin only for the owner or an admin with "Billing, payouts and admins", the role goes as
 * `role_key` with `role`, and the daily invite limit (429) shows the server's words.
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
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
const mockInvite = jest.fn();
jest.mock('@/lib/queries/useTeamMutations', () => ({
  useInviteStaff: () => ({ mutateAsync: mockInvite, isPending: false }),
}));

import { InviteStaffSheet } from '@/components/manage/InviteStaffSheet';
import { ApiError } from '@/lib/api/client';
import type { TeamViewer } from '@/lib/roles/roles';

const OWNER: TeamViewer = { staffId: 'o', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true };
const LIMITED_ADMIN: TeamViewer = { staffId: 'a', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true };
const calendars = [{ id: 'c1', name: 'Chair 1', is_active: true, calendar_type: 'practitioner' }];

async function open(viewer?: TeamViewer) {
  await render(<InviteStaffSheet visible onClose={jest.fn()} practitioners={calendars} viewer={viewer} />);
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('user@example.com'), 'new@x.com');
  });
}

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  mockInvite.mockReset();
  mockToast.error.mockClear();
});

it('invites Front desk with role_key, and lets them have calendars', async () => {
  mockInvite.mockResolvedValue({ message: 'ok', invite_email_sent: true, staff: {} });
  await open(OWNER);
  await press('Front desk');
  expect(screen.getByText('Chair 1')).toBeTruthy();
  await press('Chair 1');
  await press('Send invitation');
  expect(mockInvite).toHaveBeenCalledWith({
    email: 'new@x.com',
    name: undefined,
    role: 'staff',
    role_key: 'front_desk',
    calendar_ids: ['c1'],
  });
});

it('offers Admin to the owner, and not to an admin without the billing switch', async () => {
  await open(OWNER);
  expect(screen.getByText('Admin')).toBeTruthy();
  await render(<InviteStaffSheet visible onClose={jest.fn()} practitioners={[]} viewer={LIMITED_ADMIN} />);
  expect(screen.queryByText('Admin')).toBeNull();
  expect(screen.getByText('Front desk')).toBeTruthy();
});

it('keeps to Staff and Admin on a server before the four roles', async () => {
  await open();
  expect(screen.getByText('Admin')).toBeTruthy();
  expect(screen.queryByText('Front desk')).toBeNull();
});

it("shows the server's words for the daily invite limit", async () => {
  mockInvite.mockRejectedValue(
    new ApiError("You've sent a lot of invites today. Please try again tomorrow.", 429, {
      error: "You've sent a lot of invites today. Please try again tomorrow.",
      code: 'RATE_LIMITED',
      retry_after_seconds: 3600,
    }),
  );
  await open(OWNER);
  await press('Send invitation');
  expect(mockToast.error).toHaveBeenCalledWith("You've sent a lot of invites today. Please try again tomorrow.");
});
