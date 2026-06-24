/**
 * DeleteAccountSheet — the in-app, self-serve account-deletion danger zone
 * required by Apple Guideline 5.1.1(v). Exercises the armed type-to-confirm and
 * the post-request confirmation that hands off to sign-out.
 *
 *  - request form: the "Delete my account" button is DISABLED until the typed
 *    text matches the confirmation phrase (case-insensitive), then POSTs.
 *  - confirmation: after a successful request the form is replaced by a
 *    confirmation, and dismissing it (Done) fires `onDeleted` (the parent signs
 *    the user out — the server has already revoked the session globally).
 *
 * No `Alert.alert` is used — the destructive action is armed by typing the phrase.
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

// --- Deletion hook mock (mock-prefixed for jest hoisting) -------------------
const mockRequestMutateAsync = jest.fn(() =>
  Promise.resolve({ deletion_scheduled_at: '2026-07-24T00:00:00.000Z' }),
);
let mockRequestIsPending = false;

jest.mock('@/lib/queries/useAccountDeletion', () => ({
  useRequestAccountDeletion: () => ({
    mutateAsync: mockRequestMutateAsync,
    isPending: mockRequestIsPending,
  }),
}));

import { DeleteAccountSheet } from '@/components/manage/DeleteAccountSheet';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockRequestMutateAsync.mockClear();
  mockRequestMutateAsync.mockResolvedValue({ deletion_scheduled_at: '2026-07-24T00:00:00.000Z' });
  mockRequestIsPending = false;
});

describe('DeleteAccountSheet — request form (type-to-confirm)', () => {
  it('keeps the delete button disabled until the confirmation phrase matches', async () => {
    await render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />);

    const deleteBtn = screen.getByText('Delete my account');

    // Disabled before typing.
    await press(() => deleteBtn);
    expect(mockRequestMutateAsync).not.toHaveBeenCalled();

    // A wrong value stays disabled.
    const field = screen.getByPlaceholderText('DELETE MY ACCOUNT');
    await act(async () => {
      fireEvent.changeText(field, 'delete');
    });
    await press(() => deleteBtn);
    expect(mockRequestMutateAsync).not.toHaveBeenCalled();
  });

  it('enables + POSTs once the phrase matches (case-insensitive, trimmed)', async () => {
    await render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />);

    const field = screen.getByPlaceholderText('DELETE MY ACCOUNT');
    await act(async () => {
      fireEvent.changeText(field, '  delete my account  ');
    });
    await press(() => screen.getByText('Delete my account'));

    expect(mockRequestMutateAsync).toHaveBeenCalledTimes(1);
    // The mutation takes no argument — the server derives the user from the token.
    expect(mockRequestMutateAsync).toHaveBeenCalledWith();
  });
});

describe('DeleteAccountSheet — confirmation', () => {
  it('shows the scheduled confirmation and fires onDeleted on Done', async () => {
    const onDeleted = jest.fn();
    await render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={onDeleted} />);

    const field = screen.getByPlaceholderText('DELETE MY ACCOUNT');
    await act(async () => {
      fireEvent.changeText(field, 'DELETE MY ACCOUNT');
    });
    await press(() => screen.getByText('Delete my account'));

    // Confirmation view: the request form has been replaced.
    expect(screen.getByText('Account deletion scheduled')).toBeTruthy();
    expect(screen.queryByText('Delete my account')).toBeNull();

    await press(() => screen.getByText('Done'));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
