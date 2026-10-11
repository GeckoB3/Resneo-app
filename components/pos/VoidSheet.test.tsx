/**
 * Voiding a sale with bookings on it: the bookings can be checked out again, and a deposit paid
 * online stays with its booking, so the sheet must not say they "go back to unpaid" then.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

import { VoidSheet } from '@/components/pos/SaleSheets';
import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';
import type { PosBootstrap } from '@/types/pos';

const bootstrap = { settings: { void_reasons: ['Started by mistake'] } } as unknown as PosBootstrap;
const booked = makeLine({ id: 'b1', booking_id: 'booking-1', walkin_booking: false });

describe('VoidSheet', () => {
  it('says the bookings go back to unpaid when no deposit was paid', async () => {
    await render(<VoidSheet visible onClose={jest.fn()} sale={makeSale({ lines: [booked], payments: [] })} bootstrap={bootstrap} send={jest.fn()} />);
    expect(screen.getByText('The bookings on it go back to unpaid, so they can be checked out again.')).toBeTruthy();
  });

  it('keeps the deposit with its booking', async () => {
    const deposit = makePayment({ id: 'd1', method: 'deposit_applied', is_money: false, amount_pence: 3000 });
    await render(
      <VoidSheet visible onClose={jest.fn()} sale={makeSale({ lines: [booked], payments: [deposit] })} bootstrap={bootstrap} send={jest.fn()} />,
    );
    expect(screen.getByText('The bookings on it can be checked out again. Any deposit already paid stays with its booking.')).toBeTruthy();
    expect(screen.queryByText(/go back to unpaid/)).toBeNull();
  });
});
