/**
 * Changing how a tip is split, when the sale has more than one tipped payment: each payment is a
 * chip that starts with a capital ("Cash £2.00"), not the lower-case name used inside a sentence.
 */
import { render, screen } from '@testing-library/react-native';
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
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

import { TipSplitSheet } from '@/components/pos/AfterSaleSheets';
import { makePayment, makeSale } from '@/lib/pos/test-sale';

describe('TipSplitSheet', () => {
  it('names each tipped payment with a capital letter', async () => {
    const sale = makeSale({
      payments: [
        makePayment({ id: 'pay-cash', method: 'cash', tip_pence: 200 }),
        makePayment({ id: 'pay-card', method: 'card_present', tip_pence: 100, card_brand: 'visa', card_last4: '4242' }),
      ],
    });
    await render(<TipSplitSheet visible onClose={jest.fn()} sale={sale} send={jest.fn()} />);
    expect(screen.getByText('Cash £2.00')).toBeTruthy();
    expect(screen.getByText('Visa ending 4242 £1.00')).toBeTruthy();
    expect(screen.queryByText('cash £2.00')).toBeNull();
  });
});
