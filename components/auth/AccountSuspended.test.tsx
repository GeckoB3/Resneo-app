/**
 * The screen a suspended account's staff see instead of the app (web Compliance tab): it says the
 * account is suspended and what that means, never why, and offers support, a fresh check and
 * signing out.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import { AccountSuspended } from './AccountSuspended';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockSignOut = jest.fn();
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

describe('<AccountSuspended />', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  it('names the business and explains what a suspension turns off', async () => {
    await render(<AccountSuspended venueName="Glow Studio" />);
    expect(screen.getByText('Account suspended')).toBeTruthy();
    expect(screen.getByText('ResNeo has suspended the account for Glow Studio.')).toBeTruthy();
    expect(screen.getByText(/changes are turned off, the booking page is offline/)).toBeTruthy();
  });

  it('never gives a reason', async () => {
    await render(<AccountSuspended venueName="Glow Studio" />);
    expect(JSON.stringify(screen.toJSON()).toLowerCase()).not.toMatch(/fraud|chargeback|spam|abuse/);
  });

  it('opens an email to support', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<AccountSuspended />);
    await fireEvent.press(screen.getByText('Email support'));
    expect(open).toHaveBeenCalledWith('mailto:support@resneo.com');
    open.mockRestore();
  });

  it('checks again and signs out', async () => {
    const onRetry = jest.fn();
    await render(<AccountSuspended onRetry={onRetry} />);
    await fireEvent.press(screen.getByText('Check again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('works without a business name and without a retry', async () => {
    await render(<AccountSuspended venueName={null} />);
    expect(screen.getByText('ResNeo has suspended this account.')).toBeTruthy();
    expect(screen.queryByText('Check again')).toBeNull();
  });
});
