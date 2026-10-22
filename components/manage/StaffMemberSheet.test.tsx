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

describe('the A2 switches on a Front desk or Staff row', () => {
  const desk: TeamMember = {
    id: 'f1',
    name: 'Fay',
    email: 'fay@x.com',
    role: 'staff',
    role_key: 'front_desk',
    is_owner: false,
    permissions: { role_key: 'front_desk' },
    linked_calendar_ids: ['c1'],
  };

  it('shows the three switches to any admin, with the help text, reading absent as on', async () => {
    await open(desk, LIMITED_ADMIN);
    await press('Role');
    expect(screen.getByText("When this is off, they see 'Hidden' instead of phone numbers and emails.")).toBeTruthy();
    expect(screen.getByLabelText('Can see client phone numbers and emails').props.value).toBe(true);
    expect(screen.getByText("Other people's diaries")).toBeTruthy();
    expect(screen.getByText('Can book and change')).toBeTruthy();
    expect(screen.getByText('View only')).toBeTruthy();
    // A2b: the third choice is offered to everyone now.
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByLabelText('Can export client data').props.value).toBe(true);
    expect(
      screen.getByText(
        "Shows or hides the buttons that download client lists. It can't stop someone copying details they can already see. To keep phone numbers and emails private, switch off 'Can see client phone numbers and emails'.",
      ),
    ).toBeTruthy();
  });

  it('saves each switch as soon as it changes', async () => {
    mockPatch.mockResolvedValue({ staff: desk });
    await open(desk, ADMIN_VIEWER);
    await press('Role');
    await act(async () => {
      fireEvent(screen.getByLabelText('Can see client phone numbers and emails'), 'valueChange', false);
    });
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { client_contact: false } } });
    await act(async () => {
      fireEvent(screen.getByLabelText('Can export client data'), 'valueChange', false);
    });
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { export_clients: false } } });
    await press('View only');
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { other_diaries: 'view' } } });
    expect(mockToast.success).toHaveBeenCalledWith('Saved.');
  });

  it('reads the stored switches', async () => {
    await open({ ...desk, permissions: { role_key: 'front_desk', client_contact: false, export_clients: false } }, ADMIN_VIEWER);
    await press('Role');
    expect(screen.getByLabelText('Can see client phone numbers and emails').props.value).toBe(false);
    expect(screen.getByLabelText('Can export client data').props.value).toBe(false);
  });

  const NO_CALENDAR_NOTE =
    'Fay has no calendar. With View only they can look but not book. With Hidden they see no bookings.';

  it('explains View only for someone with no calendar', async () => {
    await open({ ...desk, linked_calendar_ids: [], permissions: { role_key: 'front_desk', other_diaries: 'view' } }, ADMIN_VIEWER);
    await press('Role');
    expect(screen.getByText(NO_CALENDAR_NOTE)).toBeTruthy();
  });

  it('explains Hidden for someone with no calendar, with the same note', async () => {
    await open({ ...desk, linked_calendar_ids: [], permissions: { role_key: 'front_desk', other_diaries: 'hidden' } }, ADMIN_VIEWER);
    await press('Role');
    expect(screen.getByText(NO_CALENDAR_NOTE)).toBeTruthy();
  });

  it('does not explain it for someone with a calendar', async () => {
    await open({ ...desk, permissions: { role_key: 'front_desk', other_diaries: 'view' } }, ADMIN_VIEWER);
    await press('Role');
    expect(screen.queryByText(NO_CALENDAR_NOTE)).toBeNull();
  });

  it('does not explain it on Can book and change, even with no calendar', async () => {
    await open({ ...desk, linked_calendar_ids: [] }, ADMIN_VIEWER);
    await press('Role');
    expect(screen.queryByText(NO_CALENDAR_NOTE)).toBeNull();
  });

  it('saves Hidden as soon as it is chosen', async () => {
    mockPatch.mockResolvedValue({ staff: desk });
    await open(desk, ADMIN_VIEWER);
    await press('Role');
    await press('Hidden');
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { other_diaries: 'hidden' } } });
  });

  it('reads Hidden as chosen for someone set to it, and lets you move them off it', async () => {
    mockPatch.mockResolvedValue({ staff: desk });
    await open({ ...desk, permissions: { role_key: 'front_desk', other_diaries: 'hidden' } }, ADMIN_VIEWER);
    await press('Role');
    await press('Hidden');
    expect(mockPatch).not.toHaveBeenCalled();
    await press('Can book and change');
    expect(mockPatch).toHaveBeenCalledWith({ id: 'f1', body: { permissions: { other_diaries: 'book' } } });
  });

  it('is never offered on your own row', async () => {
    await open(desk, { ...ADMIN_VIEWER, staffId: 'f1' });
    await press('Role');
    expect(screen.queryByText('Can see client phone numbers and emails')).toBeNull();
    expect(screen.queryByText('Can export client data')).toBeNull();
  });

  it("shows the server's words when it refuses", async () => {
    mockPatch.mockRejectedValue(
      new ApiError('Check the highlighted fields.', 400, { error: 'Check the highlighted fields.', code: 'VALIDATION_FAILED' }),
    );
    await open(staff, ADMIN_VIEWER);
    await press('Role');
    await act(async () => {
      fireEvent(screen.getByLabelText('Can see client phone numbers and emails'), 'valueChange', false);
    });
    expect(mockToast.error).toHaveBeenCalledWith('Check the highlighted fields.');
  });
});

describe('"Can export client data" on an admin', () => {
  it('shows to the owner, and saves when switched', async () => {
    mockPatch.mockResolvedValue({ staff: admin });
    await open({ ...admin, permissions: { export_clients: false } }, OWNER_VIEWER);
    await press('Role');
    const toggle = screen.getByLabelText('Can export client data');
    expect(toggle.props.value).toBe(false);
    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });
    expect(mockPatch).toHaveBeenCalledWith({ id: 'a9', body: { permissions: { export_clients: true } } });
    expect(screen.queryByText('Can see client phone numbers and emails')).toBeNull();
  });

  it('is not shown to an admin', async () => {
    await open(admin, ADMIN_VIEWER);
    await press('Role');
    expect(screen.queryByText('Can export client data')).toBeNull();
  });

  it("is not on the owner's own row", async () => {
    await open(owner, OWNER_VIEWER);
    await press('Role');
    expect(screen.queryByText('Can export client data')).toBeNull();
  });
});
