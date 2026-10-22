/**
 * A person's sheet on the Team screen (web roles plan §5.1 to §5.5, §5.11; the web's MemberCard):
 * nobody manages the owner's row or their own, an admin without "Billing, payouts and admins"
 * cannot act on other admins, changing a role asks first, the switches save at once and say
 * "Saved", signing in offers "Resend invitation" while the invite is pending and otherwise a
 * sign-in link and a new password, removing someone asks first, and refusals show inside the sheet.
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
const mockResetPassword = jest.fn();
const mockPatchCalendar = jest.fn();
jest.mock('@/lib/queries/useTeamMutations', () => ({
  usePatchStaffMember: () => ({ mutateAsync: mockPatch, isPending: false }),
  useDeleteStaffMember: () => ({ mutateAsync: mockDelete, isPending: false }),
  useResendInvite: () => ({ mutateAsync: mockResend, isPending: false }),
  useResetStaffPassword: () => ({ mutateAsync: mockResetPassword, isPending: false }),
  usePatchStaffCalendar: () => ({ mutateAsync: mockPatchCalendar, isPending: false }),
}));

import { StaffMemberSheet } from '@/components/manage/StaffMemberSheet';
import { ApiError } from '@/lib/api/client';
import type { TeamViewer } from '@/lib/roles/roles';
import type { AssignablePractitioner, TeamMember } from '@/types/staff';

const OWNER_VIEWER: TeamViewer = { staffId: 'owner', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true };
const ADMIN_VIEWER: TeamViewer = { staffId: 'a1', isOwner: false, billingPayoutsAdmins: true, rolesKnown: true };
const LIMITED_ADMIN: TeamViewer = { staffId: 'a2', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true };

const owner: TeamMember = { id: 'owner', name: 'Ana Lee', email: 'ana@x.com', role: 'admin', role_key: 'owner', is_owner: true, permissions: {} };
const admin: TeamMember = { id: 'a9', name: 'Ben', email: 'ben@x.com', role: 'admin', role_key: 'admin', is_owner: false, permissions: {} };
const staff: TeamMember = {
  id: 's1',
  name: 'Cal Jones',
  email: 'cal@x.com',
  role: 'staff',
  role_key: 'staff',
  is_owner: false,
  permissions: {},
  has_signed_in: true,
  invite_pending: false,
  linked_calendar_ids: [],
};
const desk: TeamMember = {
  id: 'f1',
  name: 'Fay',
  email: 'fay@x.com',
  role: 'staff',
  role_key: 'front_desk',
  is_owner: false,
  permissions: { role_key: 'front_desk' },
  has_signed_in: true,
  linked_calendar_ids: ['c1'],
};
const CALENDARS: AssignablePractitioner[] = [
  { id: 'c1', name: 'Chair 1', is_active: true, calendar_type: 'practitioner' },
  { id: 'c2', name: 'Chair 2', is_active: true, calendar_type: 'practitioner' },
];

const mockOnClose = jest.fn();
const mockOnDeleted = jest.fn();

async function open(member: TeamMember, viewer: TeamViewer, practitioners: AssignablePractitioner[] = []) {
  await render(
    <StaffMemberSheet
      visible
      member={member}
      isSelf={member.id === viewer.staffId}
      viewer={viewer}
      practitioners={practitioners}
      businessName="Glow Studio"
      onClose={mockOnClose}
      onDeleted={mockOnDeleted}
    />,
  );
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
  for (const fn of [mockPatch, mockDelete, mockResend, mockResetPassword, mockPatchCalendar, mockOnClose, mockOnDeleted]) fn.mockReset();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe('rows nobody manages from here', () => {
  it("offers nothing on the owner's row to anyone else, and says who can change it", async () => {
    await open(owner, ADMIN_VIEWER);
    expect(screen.getByText('Only Ana Lee can change this. The owner can transfer ownership from their own row.')).toBeTruthy();
    expect(screen.queryByText('Role')).toBeNull();
    expect(screen.queryByText('Remove from your team')).toBeNull();
    expect(screen.queryByText('Resend invitation')).toBeNull();
    expect(screen.queryByText('Set a new password')).toBeNull();
  });

  it("tells the owner on their own row that ownership is transferred on the web, with nothing to manage", async () => {
    await open(owner, OWNER_VIEWER);
    expect(screen.getByText('Transfer ownership from your ResNeo dashboard on the web.')).toBeTruthy();
    expect(screen.getByText("You're the owner, so nobody else can change or remove you.")).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.queryByText('Role')).toBeNull();
    expect(screen.queryByText('Remove from your team')).toBeNull();
  });

  it('sends an admin on their own row to the owner or another admin', async () => {
    await open({ ...admin, id: 'a1' }, ADMIN_VIEWER);
    expect(screen.getByText('To change your own role or settings, ask the owner or another admin.')).toBeTruthy();
    expect(screen.queryByText('Role')).toBeNull();
    expect(screen.queryByText('Email a sign-in link')).toBeNull();
    expect(screen.queryByText('Can export client data')).toBeNull();
  });

  it('keeps an admin without "Billing, payouts and admins" off another admin', async () => {
    await open(admin, LIMITED_ADMIN);
    expect(screen.getByText('Only the owner, or an admin they allow, can change another admin.')).toBeTruthy();
    expect(screen.queryByText('Role')).toBeNull();
    expect(screen.queryByText('Remove Ben')).toBeNull();
  });
});

describe('the sections, in order', () => {
  it('runs status, role, calendars, what they can see, signing in, then removing', async () => {
    await open({ ...staff, has_signed_in: false }, ADMIN_VIEWER, CALENDARS);
    expect(screen.getByText("Cal hasn't signed in yet.")).toBeTruthy();
    expect(screen.getByText('Not signed in yet')).toBeTruthy();
    const order = ['Role', 'Their calendars', 'What they can see', 'Signing in', 'Remove from your team'];
    const headings = screen.getAllByRole('header').map((node) => node.props.children as string);
    expect(headings).toEqual(order);
  });

  it('says an invited person has not accepted yet', async () => {
    await open({ ...staff, invite_pending: true }, ADMIN_VIEWER);
    expect(screen.getByText('Invited')).toBeTruthy();
    expect(screen.getByText("Cal hasn't accepted their invitation yet.")).toBeTruthy();
  });
});

describe('changing a role', () => {
  it('asks first, and "Keep it as it is" changes nothing', async () => {
    await open(staff, ADMIN_VIEWER);
    await press('Front desk');
    expect(screen.getByText("Change Cal's role to Front desk?")).toBeTruthy();
    expect(
      screen.getByText(
        'Front desk: Takes bookings and payments, with the Front desk till settings. It suits a receptionist who books for everyone and takes payments.',
      ),
    ).toBeTruthy();
    await press('Keep it as it is');
    expect(mockPatch).not.toHaveBeenCalled();
    expect(screen.queryByText("Change Cal's role to Front desk?")).toBeNull();
  });

  it('makes someone Front desk with role_key, keeping role for older servers, and says Saved', async () => {
    mockPatch.mockResolvedValue({ staff: { ...staff, role_key: 'front_desk' } });
    await open(staff, ADMIN_VIEWER);
    await press('Front desk');
    await press('Change role');
    expect(mockPatch).toHaveBeenCalledWith({ id: 's1', body: { role: 'staff', role_key: 'front_desk' } });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('explains what the owner making an admin means', async () => {
    await open(staff, OWNER_VIEWER);
    await press('Admin');
    expect(screen.getByText('Make Cal an admin?')).toBeTruthy();
    expect(
      screen.getByText(
        "Cal will see every setting, report and client, and can look after Front desk and Staff. They won't manage billing, payouts or other admins, or export client data, until you turn those on for them.",
      ),
    ).toBeTruthy();
  });

  it('tells an admin that only the owner can give a new admin more', async () => {
    await open(staff, ADMIN_VIEWER);
    await press('Admin');
    expect(screen.getByText(/Only the owner can let them manage billing, payouts or other admins, or export client data\./)).toBeTruthy();
  });

  it('says what an admin loses when they stop being one', async () => {
    await open(admin, OWNER_VIEWER);
    await press('Staff');
    expect(screen.getByText("Change Ben's role to Staff?")).toBeTruthy();
    expect(
      screen.getByText('Ben will no longer see Settings, Reports or the team. Staff: Works with clients, with the Staff till settings.'),
    ).toBeTruthy();
  });

  it('offers an admin without the billing switch Staff and Front desk, not Admin', async () => {
    await open(staff, LIMITED_ADMIN);
    expect(screen.getByText('Front desk')).toBeTruthy();
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it("shows the server's words inside the sheet when it refuses", async () => {
    mockPatch.mockRejectedValue(
      new ApiError('Only the owner, or an admin they allow, can do this.', 403, {
        error: 'Only the owner, or an admin they allow, can do this.',
        code: 'BILLING_ADMINS_ONLY',
      }),
    );
    await open(staff, ADMIN_VIEWER);
    await press('Admin');
    await press('Change role');
    expect(screen.getByText('Only the owner, or an admin they allow, can do this.')).toBeTruthy();
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});

describe('their calendars', () => {
  it('saves the whole set as soon as one is ticked', async () => {
    mockPatchCalendar.mockResolvedValue({ linked_calendar_ids: ['c1', 'c2'] });
    await open(desk, ADMIN_VIEWER, CALENDARS);
    await press('Chair 2');
    expect(mockPatchCalendar).toHaveBeenCalledWith({ id: 'f1', body: { calendar_ids: ['c1', 'c2'] } });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('are not offered on an admin, who sees every calendar', async () => {
    await open(admin, OWNER_VIEWER, CALENDARS);
    expect(screen.queryByText('Their calendars')).toBeNull();
  });
});

describe('what a Front desk or Staff person can see', () => {
  it('shows the three settings to any admin, with the help text, reading absent as on', async () => {
    await open(desk, LIMITED_ADMIN);
    expect(
      screen.getByText(
        "When this is off, they see 'Hidden' instead of phone numbers and emails. They can still book, check in and take payments for those clients.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Can see client phone numbers and emails').props.value).toBe(true);
    expect(screen.getByText("Other people's diaries")).toBeTruthy();
    expect(screen.getByText('Can book and change')).toBeTruthy();
    expect(screen.getByText('View only')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByText('They only see bookings on their own calendars.')).toBeTruthy();
    expect(screen.getByLabelText('Can export client data').props.value).toBe(true);
  });

  it('saves each setting as soon as it changes, and says Saved', async () => {
    mockPatch.mockResolvedValue({ staff: desk });
    await open(desk, ADMIN_VIEWER);
    await flip('Can see client phone numbers and emails', false);
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { client_contact: false } } });
    await flip('Can export client data', false);
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { export_clients: false } } });
    await press('View only');
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { other_diaries: 'view' } } });
    await press('Hidden');
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'f1', body: { permissions: { other_diaries: 'hidden' } } });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('reads the stored settings, and does not resend the one already chosen', async () => {
    await open(
      { ...desk, permissions: { role_key: 'front_desk', client_contact: false, export_clients: false, other_diaries: 'hidden' } },
      ADMIN_VIEWER,
    );
    expect(screen.getByLabelText('Can see client phone numbers and emails').props.value).toBe(false);
    expect(screen.getByLabelText('Can export client data').props.value).toBe(false);
    await press('Hidden');
    expect(mockPatch).not.toHaveBeenCalled();
  });

  const NO_CALENDAR_NOTE = 'Fay has no calendar. With View only they can look but not book. With Hidden they see no bookings.';

  it('explains View only or Hidden for someone with no calendar', async () => {
    await open({ ...desk, linked_calendar_ids: [], permissions: { role_key: 'front_desk', other_diaries: 'view' } }, ADMIN_VIEWER);
    expect(screen.getByText(NO_CALENDAR_NOTE)).toBeTruthy();
  });

  it('does not explain it for someone with a calendar, or on Can book and change', async () => {
    await open({ ...desk, permissions: { role_key: 'front_desk', other_diaries: 'view' } }, ADMIN_VIEWER);
    expect(screen.queryByText(NO_CALENDAR_NOTE)).toBeNull();
    await open({ ...desk, linked_calendar_ids: [] }, ADMIN_VIEWER);
    expect(screen.queryByText(NO_CALENDAR_NOTE)).toBeNull();
  });

  it("shows the server's words inside the sheet when it refuses", async () => {
    mockPatch.mockRejectedValue(
      new ApiError('Check the highlighted fields.', 400, { error: 'Check the highlighted fields.', code: 'VALIDATION_FAILED' }),
    );
    await open(staff, ADMIN_VIEWER);
    await flip('Can see client phone numbers and emails', false);
    expect(screen.getByText('Check the highlighted fields.')).toBeTruthy();
  });

  it('are not offered on a server before the four roles', async () => {
    await open(staff, { ...ADMIN_VIEWER, rolesKnown: false });
    expect(screen.queryByText('What they can see')).toBeNull();
  });
});

describe('what else an admin can manage', () => {
  it('shows the owner both switches on an admin, and saves each', async () => {
    mockPatch.mockResolvedValue({ staff: admin });
    await open({ ...admin, permissions: { export_clients: false } }, OWNER_VIEWER);
    expect(screen.getByText('What else they can manage')).toBeTruthy();
    expect(screen.getByText('Lets this admin manage your plan, payouts and other admins. Only you can change this.')).toBeTruthy();
    expect(screen.getByLabelText('Billing, payouts and admins').props.value).toBe(true);
    expect(screen.getByLabelText('Can export client data').props.value).toBe(false);
    await flip('Billing, payouts and admins', false);
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'a9', body: { permissions: { billing_payouts_admins: false } } });
    await flip('Can export client data', true);
    expect(mockPatch).toHaveBeenLastCalledWith({ id: 'a9', body: { permissions: { export_clients: true } } });
    expect(screen.queryByText('Can see client phone numbers and emails')).toBeNull();
  });

  it('is not shown to an admin', async () => {
    await open(admin, ADMIN_VIEWER);
    expect(screen.queryByText('What else they can manage')).toBeNull();
    expect(screen.queryByText('Billing, payouts and admins')).toBeNull();
  });
});

describe('signing in', () => {
  it('offers "Resend invitation", and no password, while the invitation is pending', async () => {
    mockResend.mockResolvedValue({ ok: true, message: 'We emailed them the invitation again.' });
    await open({ ...staff, invite_pending: true, has_signed_in: false }, ADMIN_VIEWER);
    expect(screen.getByText("If Cal can't find their invitation, check it went to cal@x.com, then send it again.")).toBeTruthy();
    expect(screen.queryByText('Set a new password')).toBeNull();
    expect(screen.queryByText('Email a sign-in link')).toBeNull();
    await press('Resend invitation');
    expect(mockResend).toHaveBeenCalledWith('s1');
    expect(screen.getByText('We emailed them the invitation again. It went to cal@x.com.')).toBeTruthy();
  });

  it('offers a sign-in link and a new password once they have accepted', async () => {
    mockResend.mockResolvedValue({ ok: true, message: 'A new sign-in link was emailed to them.' });
    await open(staff, ADMIN_VIEWER);
    expect(screen.queryByText('Resend invitation')).toBeNull();
    expect(screen.getByText('We email cal@x.com a link that signs them in.')).toBeTruthy();
    expect(screen.getByText('Choose a password for them, then tell them it in person.')).toBeTruthy();
    await press('Email a sign-in link');
    expect(screen.getByText('A new sign-in link was emailed to them. It went to cal@x.com.')).toBeTruthy();
  });

  it('sets a new password after checking its length', async () => {
    mockResetPassword.mockResolvedValue({ success: true });
    await open(staff, ADMIN_VIEWER);
    await press('Set a new password');
    expect(screen.getByText('Set a new password for Cal Jones')).toBeTruthy();
    expect(screen.getByText('They sign in with this until they change it. Tell them it in person rather than by text or email.')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    });
    await press('Set password');
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(mockResetPassword).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('New password'), 'long-enough-1');
    });
    await press('Set password');
    expect(mockResetPassword).toHaveBeenCalledWith({ id: 's1', body: { new_password: 'long-enough-1' } });
    expect(
      screen.getByText('Cal Jones can now sign in with the new password. Tell them it in person, and ask them to choose their own after they sign in.'),
    ).toBeTruthy();
  });
});

describe('removing someone', () => {
  it('explains what happens, asks first, then removes them', async () => {
    mockDelete.mockResolvedValue(undefined);
    await open(staff, ADMIN_VIEWER);
    expect(screen.getByText("Cal won't be able to sign in to Glow Studio any more. Their bookings stay in your diary.")).toBeTruthy();
    await press('Remove Cal');
    expect(screen.getByText('Remove Cal Jones from your team?')).toBeTruthy();
    expect(
      screen.getByText(
        "They won't be able to sign in to Glow Studio any more. Their bookings stay in your diary, and their calendar stays bookable. To stop new bookings on it, switch off Active (bookable) under Calendar availability.",
      ),
    ).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    await press('Remove');
    expect(mockDelete).toHaveBeenCalledWith('s1');
    expect(mockToast.success).toHaveBeenCalledWith('Cal Jones is no longer on your team.');
    expect(mockOnDeleted).toHaveBeenCalled();
  });

  it('keeps them when you cancel, and shows a refusal inside the sheet', async () => {
    mockDelete.mockRejectedValue(new ApiError("You can't change or remove the owner.", 403, { error: "You can't change or remove the owner.", code: 'OWNER_PROTECTED' }));
    await open(staff, ADMIN_VIEWER);
    await press('Remove Cal');
    await press('Cancel');
    expect(mockDelete).not.toHaveBeenCalled();
    await press('Remove Cal');
    await press('Remove');
    expect(screen.getByText("You can't change or remove the owner.")).toBeTruthy();
    expect(mockOnDeleted).not.toHaveBeenCalled();
  });
});
