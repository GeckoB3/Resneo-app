import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: [] }, isFetching: false }),
}));

import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const filledGuest: GuestDetails = {
  first_name: 'Jo',
  last_name: 'Bloggs',
  phone: '+447700900000',
  email: '',
  special_requests: undefined,
};

function renderStep(props: Partial<React.ComponentProps<typeof GuestDetailsStep>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <GuestDetailsStep
        value={filledGuest}
        onChange={jest.fn()}
        onContinue={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
}

describe('GuestDetailsStep client-address fieldset', () => {
  it('does not render the address fieldset by default', async () => {
    await renderStep();
    expect(screen.queryByText('Service address')).toBeNull();
  });

  it('renders the address fieldset when collectClientAddress is set', async () => {
    await renderStep({ collectClientAddress: true });
    expect(screen.getByText('Service address')).toBeTruthy();
    // Labels carry a trailing " *" / " (optional)" so match by substring.
    expect(screen.getByText(/Address line 1/)).toBeTruthy();
    expect(screen.getByText(/Town or city/)).toBeTruthy();
    expect(screen.getByText(/Postcode/)).toBeTruthy();
  });

  it('blocks Continue when a required address field is missing', async () => {
    const onContinue = jest.fn();
    await renderStep({ collectClientAddress: true, onContinue });
    await press(() => screen.getByText('Continue'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('Address line 1 is required')).toBeTruthy();
  });

  it('allows Continue once the address is complete', async () => {
    const onContinue = jest.fn();
    await renderStep({
      collectClientAddress: true,
      onContinue,
      value: {
        ...filledGuest,
        address_line1: '1 High St',
        address_city: 'Belfast',
        address_postcode: 'BT1 1AA',
      },
    });
    await press(() => screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('keeps the address optional for walk-ins', async () => {
    const onContinue = jest.fn();
    await renderStep({ collectClientAddress: true, isWalkIn: true, onContinue });
    await press(() => screen.getByText('Continue'));
    // Walk-ins never block on a missing address (web parity).
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
