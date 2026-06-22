/**
 * Domain 17 (Auth High): the set-password screen for invited staff +
 * password-reset recipients. Verifies the validation reused from `account.tsx`
 * (min 8 + confirm match) gates the submit, and that a valid submission POSTs to
 * the change-password mutation and routes into the app.
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// The screen now redirects to /sign-in when there's no session; provide one so the
// validation/submit behaviour under test renders normally.
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'test-user' } }, isLoading: false }),
}));

const mockChangePasswordAsync = jest.fn(() => Promise.resolve({ success: true }));
jest.mock('@/lib/queries/useTeamMutations', () => ({
  useChangeOwnPassword: () => ({ mutateAsync: mockChangePasswordAsync, isPending: false }),
}));

import SetPasswordScreen from '@/app/set-password';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

async function type(el: Parameters<typeof fireEvent.changeText>[0], value: string) {
  await act(async () => {
    fireEvent.changeText(el, value);
  });
}

beforeEach(() => {
  mockReplace.mockClear();
  mockChangePasswordAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe('SetPasswordScreen', () => {
  it('blocks submit with an inline error when the password is too short', async () => {
    await render(<SetPasswordScreen />);

    await type(screen.getByPlaceholderText('At least 8 characters'), 'short');
    await type(screen.getByPlaceholderText('Re-enter password'), 'short');
    await press(() => screen.getByText('Save password and continue'));

    expect(mockChangePasswordAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('blocks submit with an inline error when the passwords do not match', async () => {
    await render(<SetPasswordScreen />);

    await type(screen.getByPlaceholderText('At least 8 characters'), 'longenough1');
    await type(screen.getByPlaceholderText('Re-enter password'), 'different99');
    await press(() => screen.getByText('Save password and continue'));

    expect(mockChangePasswordAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls the change-password mutation and routes into the app on success', async () => {
    await render(<SetPasswordScreen />);

    await type(screen.getByPlaceholderText('At least 8 characters'), 'longenough1');
    await type(screen.getByPlaceholderText('Re-enter password'), 'longenough1');
    await press(() => screen.getByText('Save password and continue'));

    expect(mockChangePasswordAsync).toHaveBeenCalledTimes(1);
    expect(mockChangePasswordAsync).toHaveBeenCalledWith({ new_password: 'longenough1' });
    expect(mockToast.success).toHaveBeenCalledWith('Password set. Welcome to Resneo.');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
