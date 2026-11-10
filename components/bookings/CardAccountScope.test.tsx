/**
 * The card reader follows the booking's owner: its token, its venue scope, and the old reader being
 * dropped first (Aura taking Light 16's payment, 2026-11-07).
 */
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

const mockDisconnect = jest.fn().mockResolvedValue({});
const mockClear = jest.fn().mockResolvedValue({});
jest.mock('@/lib/payments/terminal-sdk', () => ({
  getTerminalSdk: () => ({
    useStripeTerminal: () => ({ disconnectReader: mockDisconnect, clearCachedCredentials: mockClear }),
  }),
  isTerminalInitialized: () => true,
}));

import { CardAccountScope } from '@/components/bookings/CardAccountScope';
import { getCardAccountOwner } from '@/lib/payments/card-account';
import { LinkedVenueContext, useLinkedVenueContext } from '@/providers/LinkedVenueProvider';

function Probe() {
  return <Text testID="seen">{useLinkedVenueContext().ownerVenueId ?? 'own'}</Text>;
}

function app(ownerVenueId: string | null) {
  return {
    ownerVenueId,
    ownerVenueName: null,
    ownerPractitionerId: null,
    hydrated: true,
    setOwnerVenueId: jest.fn(),
    clearOwnerVenue: jest.fn(),
    reconcileOwnerVenue: jest.fn(),
  };
}

beforeEach(() => {
  mockDisconnect.mockClear();
  mockClear.mockClear();
});

describe('CardAccountScope', () => {
  it("scopes the reader to the booking owner and drops the old reader first", async () => {
    const view = await render(
      <LinkedVenueContext.Provider value={app(null)}>
        <CardAccountScope ownerVenueId="light16">
          <Probe />
        </CardAccountScope>
      </LinkedVenueContext.Provider>,
    );
    await waitFor(() => expect(view.getByTestId('seen').props.children).toBe('light16'));
    expect(getCardAccountOwner()).toBe('light16');
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalled();

    await view.unmount();
    expect(getCardAccountOwner()).toBeNull();
    expect(mockDisconnect.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("leaves the reader alone on the business's own booking", async () => {
    const view = await render(
      <LinkedVenueContext.Provider value={app(null)}>
        <CardAccountScope ownerVenueId={null}>
          <Probe />
        </CardAccountScope>
      </LinkedVenueContext.Provider>,
    );
    expect(view.getByTestId('seen').props.children).toBe('own');
    expect(getCardAccountOwner()).toBeNull();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('does nothing when the app is already scoped to that business', async () => {
    const view = await render(
      <LinkedVenueContext.Provider value={app('light16')}>
        <CardAccountScope ownerVenueId="light16">
          <Probe />
        </CardAccountScope>
      </LinkedVenueContext.Provider>,
    );
    expect(view.getByTestId('seen').props.children).toBe('light16');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
