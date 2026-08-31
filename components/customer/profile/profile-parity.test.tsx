/**
 * The profile screen against the web's.
 *
 * Three behaviours here are load-bearing rather than cosmetic: a password you
 * cannot see has to be typed twice, a setting that does nothing for you should
 * not be shown to you, and a preference write must carry one key.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// The confirm sheet's drag-to-dismiss needs reanimated's worklet runtime, which
// jest-expo does not initialise. Nothing under test depends on the gesture.
jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  for (const m of ['activeOffsetY', 'failOffsetY', 'onChange', 'onEnd']) {
    builder[m] = () => builder;
  }
  return {
    Gesture: { Pan: () => builder },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@/providers/AppLockProvider', () => ({ AppLockCover: () => null }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

const mockSetPassword = jest.fn();
jest.mock('@/lib/queries/useCustomerAccount', () => ({
  useSetPassword: () => ({ mutate: mockSetPassword, isPending: false }),
  useSignOutEverywhere: () => ({ mutate: jest.fn(), isPending: false }),
}));

let mockRole = 'customer';
jest.mock('@/lib/queries/useRole', () => ({ useRole: () => mockRole }));

const mockUpdate = jest.fn();
let mockProfile: Record<string, unknown> = {};
jest.mock('@/lib/queries/useCustomerProfile', () => ({
  useCustomerProfile: () => ({ data: { profile: mockProfile }, isLoading: false }),
  useUpdateCustomerProfile: () => ({ mutate: mockUpdate, isPending: false }),
}));

import { AccountEmailSection } from '@/components/customer/profile/AccountEmailSection';
import { AccountSecuritySection } from '@/components/customer/profile/AccountSecuritySection';
import { LoginDestinationSection } from '@/components/customer/profile/LoginDestinationSection';

beforeEach(() => {
  mockSetPassword.mockReset();
  mockUpdate.mockReset();
  mockToast.error.mockReset();
  mockRole = 'customer';
  mockProfile = {};
});

describe('setting a password, which the web has always asked twice for', () => {
  it('offers a confirm field', async () => {
    /*
      The gap the app shipped with. Typing a password you cannot see and getting
      one character wrong locks you out of the thing you were setting up, and
      you find out at the login screen rather than here.
    */
    const { getByText } = await render(<AccountSecuritySection />);
    expect(getByText('Confirm password')).toBeTruthy();
  });

  it('refuses to save while the two do not match', async () => {
    const { getByText, getByPlaceholderText } = await render(
      <AccountSecuritySection />,
    );
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('At least 8 characters'), 'a-long-enough-password');
      fireEvent.changeText(getByPlaceholderText('Repeat password'), 'a-long-enough-passwerd');
    });

    expect(getByText('Passwords do not match')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText('Save password'));
    });
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it('saves once they agree, sending only the password', async () => {
    const { getByText, getByPlaceholderText } = await render(<AccountSecuritySection />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('At least 8 characters'), 'a-long-enough-password');
      fireEvent.changeText(getByPlaceholderText('Repeat password'), 'a-long-enough-password');
    });

    await act(async () => {
      fireEvent.press(getByText('Save password'));
    });
    expect(mockSetPassword).toHaveBeenCalledTimes(1);
    expect(mockSetPassword.mock.calls[0][0]).toBe('a-long-enough-password');
  });

  it('will not save a matching pair that is too short', async () => {
    // Two identical short passwords agree with each other and are still refused
    // by the server. Checking only the match would send a guaranteed 400.
    const { getByText, getByPlaceholderText } = await render(<AccountSecuritySection />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('At least 8 characters'), 'short');
      fireEvent.changeText(getByPlaceholderText('Repeat password'), 'short');
    });

    await act(async () => {
      fireEvent.press(getByText('Save password'));
    });
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it('shows the server’s own refusal rather than a flat failure', async () => {
    /*
      The route answers a repeated password with "New password must be different
      from the current one." Replacing that with "could not save" turns a
      precise, actionable refusal into a mystery.
    */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiError } = require('@/lib/api/client') as typeof import('@/lib/api/client');
    mockSetPassword.mockImplementation((_pw: string, opts: { onError: (e: unknown) => void }) => {
      opts.onError(
        new ApiError('Bad Request', 400, {
          error: 'New password must be different from the current one.',
        }),
      );
    });
    const { getByText, getByPlaceholderText } = await render(<AccountSecuritySection />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('At least 8 characters'), 'a-long-enough-password');
      fireEvent.changeText(getByPlaceholderText('Repeat password'), 'a-long-enough-password');
    });
    // A separate act, so the enabling re-render lands before the press. Pressing
    // in the same block hits the still-disabled button and calls nothing.
    await act(async () => {
      fireEvent.press(getByText('Save password'));
    });

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        'New password must be different from the current one.',
      ),
    );
  });
});

describe('where signing in takes you', () => {
  it('is not shown to somebody who only books things', async () => {
    /*
      `useAppMode` reads this preference only AFTER establishing the person is
      not a confirmed customer, so for a pure customer it changes nothing.
      Offering it would be a switch that saves and does nothing, which is what
      got the notification matrix removed from this same screen.
    */
    mockRole = 'customer';
    const { toJSON } = await render(<LoginDestinationSection />);
    expect(toJSON()).toBeNull();
  });

  it('is not shown before we know which kind of account this is', async () => {
    mockRole = 'loading';
    const { toJSON } = await render(<LoginDestinationSection />);
    expect(toJSON()).toBeNull();
  });

  it('is shown to an account that has a venue side too', async () => {
    mockRole = 'staff';
    const { getByText } = await render(<LoginDestinationSection />);
    expect(getByText('WHERE SIGNING IN TAKES YOU')).toBeTruthy();
  });

  it('saves the destination the person picked', async () => {
    mockRole = 'staff';
    const { getByText } = await render(<LoginDestinationSection />);
    await act(async () => {
      fireEvent.press(getByText('My bookings'));
    });
    expect(mockUpdate.mock.calls[0][0]).toEqual({ default_login_destination: 'account' });
  });

  it('explains that "Ask me" behaves differently here than on the website', async () => {
    // The web renders a chooser page; the app opens the dashboard with a
    // switcher. Offering the option without saying so promises a screen that
    // does not exist.
    mockRole = 'staff';
    mockProfile = { default_login_destination: 'ask' };
    const { getByText } = await render(<LoginDestinationSection />);
    expect(getByText(/switcher to your bookings/i)).toBeTruthy();
  });
});

describe('email from ResNeo', () => {
  it('sends ONE flat key, never the whole bag', async () => {
    /*
      The route merges into a column the staff app also writes to. The web had
      exactly this bug: a customer client sending its own keys erased every
      staff push preference on the row.
    */
    const { getByLabelText } = await render(<AccountEmailSection />);
    fireEvent(getByLabelText('ResNeo product updates and news'), 'valueChange', true);
    expect(mockUpdate.mock.calls[0][0]).toEqual({
      notification_preferences: { marketing_email: true },
    });
  });

  it('starts marketing OFF and account email ON for a new account', async () => {
    // The asymmetry that matters: consent is given, not assumed.
    const { getByLabelText } = await render(<AccountEmailSection />);
    expect(getByLabelText('ResNeo product updates and news').props.value).toBe(false);
    expect(getByLabelText('Account emails from ResNeo').props.value).toBe(true);
  });

  it('reads the customer half when the column has been split', async () => {
    // Mid-migration the column is namespaced. Reading the flat shape only would
    // show defaults that are not this customer's, silently.
    mockProfile = { notification_preferences: { customer: { marketing_email: true }, staff: {} } };
    const { getByLabelText } = await render(<AccountEmailSection />);
    expect(getByLabelText('ResNeo product updates and news').props.value).toBe(true);
  });
});
