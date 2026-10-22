/**
 * The member sheet with the four roles (web roles plan A1, Settings, Staff): the owner's row is
 * theirs alone, an admin without "Billing, payouts and admins" cannot act on other admins, the
 * owner sees the switch on each admin, Front desk is a role choice sent as `role_key`, the owner's
 * own row says transfers are on the web, and a refusal shows the server's words.
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

const mockPatch = jest.fn();
const mockDelete = jest.fn();
const mockResend = jest.fn();
jest.mock('@/lib/queries/useTeamMutations', () => ({
  usePatchStaffMember: () => ({ mutateAsync: mockPatch, isPending: false }),
  useDeleteStaffMember: () => ({ mutateAsync: mockDelete, isPending: false }),
  useResendInvite: () => ({ mutateAsync: mockResend, isPending: false }),
  useResetStaffPassword: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePatchStaffCalendar: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { StaffMemberSheet } from '@/components/manage/StaffMemberSheet';
import { ApiError } from '@/lib/api/client';
import type { TeamViewer } from '@/lib/roles/roles';
import type { TeamMember } from '@/types/staff';

const OWNER_VIEWER: TeamViewer = { staffId: 'owner', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true };
const ADMIN_VIEWER: TeamViewer = { staffId: 'a1', isOwner: false, billingPayoutsAdmins: true, rolesKnown: true };
const LIMITED_ADMIN: TeamViewer = { staffId: 'a2', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true };

const owner: TeamMember = { id: 'owner', name: 'Ana', email: 'ana@x.com', role: 'admin', role_key: 'owner', is_owner: true, permissions: {} };
const admin: TeamMember = { id: 'a9', name: 'Ben', email: 'ben@x.com', role: 'admin', role_key: 'admin', is_owner: false, permissions: {} };
const staff: TeamMember = { id: 's1', name: 'Cal', email: 'cal@x.com', role: 'staff', role_key: 'staff', is_owner: false, permissions: {} };

async function open(member: TeamMember, viewer: TeamViewer) {
  await render(
    <StaffMemberSheet
      visible
      member={member}
      isSelf={member.id === viewer.staffId}
      viewer={viewer}
      practitioners={[]}
      onClose={jest.fn()}
      onDeleted={jest.fn()}
    />,
  );
}

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  mockPatch.mockReset();
  mockDelete.mockReset();
  mockResend.mockReset();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe("the owner's row", () => {
  it('offers nothing to anyone else, and says who can change it', async () => {
    await open(owner, ADMIN_VIEWER);
    expect(screen.getByText('Only Ana can change this. The owner can transfer ownership from their own row.')).toBeTruthy();
    expect(screen.queryByText('Remove from team')).toBeNull();
    expect(screen.queryByText('Resend invitation email')).toBeNull();
    expect(screen.queryByText('Role')).toBeNull();
  });

  it('tells the owner that transferring ownership is done on the web', async () => {
    await open(owner, OWNER_VIEWER);
    expect(screen.getByText('Transfer ownership from your ResNeo dashboard on the web.')).toBeTruthy();
    expect(screen.getByText('You cannot remove yourself from the team.')).toBeTruthy();
  });
});

describe('an admin without "Billing, payouts and admins"', () => {
  it('cannot act on another admin', async () => {
    await open(admin, LIMITED_ADMIN);
    expect(screen.getByText('Only the owner, or an admin they allow, can do this.')).toBeTruthy();
    expect(screen.queryByText('Remove from team')).toBeNull();
  });

  it('can still change Staff and Front desk, but cannot make admins', async () => {
    await open(staff, LIMITED_ADMIN);
    await press('Role');
    expect(screen.getByText('Front desk')).toBeTruthy();
    expect(screen.queryByText('Admin')).toBeNull();
  });
});

describe('the role picker', () => {
  it('makes someone Front desk with role_key, keeping role for older servers', async () => {
    mockPatch.mockResolvedValue({ staff: { ...staff, role_key: 'front_desk' } });
    await open(staff, ADMIN_VIEWER);
    await press('Role');
    await press('Front desk');
    expect(screen.getByText('Takes bookings and payments, with the Front desk till settings.')).toBeTruthy();
    await press('Save role');
    expect(mockPatch).toHaveBeenCalledWith({ id: 's1', body: { role: 'staff', role_key: 'front_desk' } });
    expect(mockToast.success).toHaveBeenCalledWith('Cal is now Front desk.');
  });

  it("shows the server's words when it refuses", async () => {
    mockPatch.mockRejectedValue(
      new ApiError('Only the owner, or an admin they allow, can do this.', 403, {
        error: 'Only the owner, or an admin they allow, can do this.',
        code: 'BILLING_ADMINS_ONLY',
      }),
    );
    await open(staff, ADMIN_VIEWER);
    await press('Role');
    await press('Admin');
    await press('Save role');
    expect(mockToast.error).toHaveBeenCalledWith('Only the owner, or an admin they allow, can do this.');
  });
});

describe('"Billing, payouts and admins"', () => {
  it('shows on an admin to the owner, and saves when switched', async () => {
    mockPatch.mockResolvedValue({ staff: admin });
    await open(admin, OWNER_VIEWER);
    await press('Role');
    expect(screen.getByText('Lets this admin manage your plan, payouts and other admins. Only you can change this.')).toBeTruthy();
    const toggle = screen.getByLabelText('Billing, payouts and admins');
    expect(toggle.props.value).toBe(true);
    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });
    expect(mockPatch).toHaveBeenCalledWith({ id: 'a9', body: { permissions: { billing_payouts_admins: false } } });
  });

  it('reads off when the admin has it switched off', async () => {
    await open({ ...admin, permissions: { billing_payouts_admins: false } }, OWNER_VIEWER);
    await press('Role');
    expect(screen.getByLabelText('Billing, payouts and admins').props.value).toBe(false);
  });

  it('is not shown to an admin', async () => {
    await open(admin, ADMIN_VIEWER);
    await press('Role');
    expect(screen.queryByText('Billing, payouts and admins')).toBeNull();
  });
});
