/**
 * Settings-14 (Medium + Low): MyAccountSheet wires the shared PhoneInput +
 * `useStaffAccountForm`. This verifies the E.164 normalisation on save — a
 * national-format phone typed into the field is normalised before it reaches the
 * PATCH body — which is the behaviour the audit asks for ("PhoneInput-wired field
 * normalizing on blur").
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// NOTE: haptics are NOT mocked — the global jest.setup mocks expo-haptics, so the
// real lib/haptics (incl. hapticTap fired by Button on press) resolves cleanly.

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockRefreshSession = jest.fn(() => Promise.resolve());
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { refreshSession: mockRefreshSession } }),
}));

// Mock the underlying mutation hooks the shared form uses.
const mockPatchMeAsync = jest.fn((body: { name?: string; email?: string; phone?: string }) =>
  Promise.resolve({
    staff: {
      id: 's1',
      email: body.email ?? 'me@x.com',
      name: body.name ?? 'Me',
      phone: body.phone ?? null,
      role: 'staff',
    },
  }),
);
const mockChangePasswordAsync = jest.fn(() => Promise.resolve({ success: true }));
jest.mock('@/lib/queries/useTeamMutations', () => ({
  usePatchStaffMe: () => ({ mutateAsync: mockPatchMeAsync, isPending: false }),
  useChangeOwnPassword: () => ({ mutateAsync: mockChangePasswordAsync, isPending: false }),
}));

import { MyAccountSheet } from '@/components/manage/MyAccountSheet';
import type { StaffMe } from '@/types/staff';

const STAFF: StaffMe = {
  id: 's1',
  email: 'me@x.com',
  name: 'Me',
  phone: null,
  role: 'staff',
  linked_practitioner_id: null,
  linked_calendar_ids: [],
};

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockPatchMeAsync.mockClear();
  mockChangePasswordAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockRefreshSession.mockClear();
});

describe('MyAccountSheet — phone normalisation on save', () => {
  it('normalises a GB national phone to E.164 in the PATCH body', async () => {
    await render(<MyAccountSheet visible staff={STAFF} onClose={jest.fn()} />);

    // Type a national-format number; blur fires the PhoneInput normalisation,
    // then Save sends the diff-only body.
    const phone = screen.getByPlaceholderText('+44 7700 000000');
    await act(async () => {
      fireEvent.changeText(phone, '07725 123456');
    });
    await act(async () => {
      fireEvent(phone, 'blur');
    });

    await press(() => screen.getByText('Save profile'));

    expect(mockPatchMeAsync).toHaveBeenCalledTimes(1);
    expect(mockPatchMeAsync).toHaveBeenCalledWith({ phone: '+447725123456' });
  });

  it('refreshes the session and varies the toast when the email changes', async () => {
    const onClose = jest.fn();
    await render(<MyAccountSheet visible staff={STAFF} onClose={onClose} />);

    const email = screen.getByPlaceholderText('your@email.com');
    await act(async () => {
      fireEvent.changeText(email, 'new@x.com');
    });
    await press(() => screen.getByText('Save profile'));

    expect(mockPatchMeAsync).toHaveBeenCalledWith({ email: 'new@x.com' });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith(
      'Profile saved. Use your new sign-in email next time you log in.',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks save with an inline error on an invalid email', async () => {
    await render(<MyAccountSheet visible staff={STAFF} onClose={jest.fn()} />);

    const email = screen.getByPlaceholderText('your@email.com');
    await act(async () => {
      fireEvent.changeText(email, 'not-an-email');
    });
    await press(() => screen.getByText('Save profile'));

    expect(mockPatchMeAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });
});
