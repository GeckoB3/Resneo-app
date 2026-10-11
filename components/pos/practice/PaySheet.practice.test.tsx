/**
 * The pay sheet's one hook for the practice sale (POS test round 2026-10-11, Part 4, OB4): a sale
 * the server marks `practice: true` gets the practice choice, where each method only shows what
 * would happen and the sale's write function is never called. Every other sale records its payment
 * exactly as before.
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
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockCardCollector = jest.fn();
jest.mock('@/components/pos/SaleCardCollect', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SaleCardCollect: (props: Record<string, unknown>) => {
      mockCardCollector(props);
      return <Text>card-collector</Text>;
    },
  };
});
const mockReaderPanel = jest.fn();
jest.mock('@/components/pos/ReaderPayPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ReaderPayPanel: (props: Record<string, unknown>) => {
      mockReaderPanel(props);
      return <Text>reader-panel</Text>;
    },
  };
});
const mockLinkPanel = jest.fn();
jest.mock('@/components/pos/PayLinkPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PayLinkPanel: (props: Record<string, unknown>) => {
      mockLinkPanel(props);
      return <Text>pay-link-panel</Text>;
    },
  };
});
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({ buildSupportsTapToPay: () => true }));
jest.mock('@/components/pos/SavedCards', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SavedCardMethods: () => <Text>saved-cards</Text>, SavedCardCharge: () => <Text>saved-charge</Text> };
});

import { PaySheet } from '@/components/pos/PaySheet';
import { makeLine, makeSale } from '@/lib/pos/test-sale';
import type { PosBootstrap, PosSale } from '@/types/pos';

function bootstrap(): PosBootstrap {
  return {
    settings: { max_payment_pence: 1_000_000 },
    capabilities: { take_payment: true },
    role: 'admin',
    tills: [],
    payment_types: [{ id: 'type-1', name: 'Bank transfer', requires_reference: false, is_active: true }],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [],
    card_methods: { card_app: true, card_reader: true, pay_link: true },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

const base = makeSale({ total_pence: 3550, balance_due_pence: 3550, lines: [makeLine({ total_pence: 3550 })] });

async function renderSheet(sale: PosSale, shared?: jest.Mock) {
  const send = shared ?? jest.fn().mockResolvedValue({ sale, change_given_pence: 450 });
  const onPaid = jest.fn();
  const onClose = jest.fn();
  await render(
    <PaySheet
      visible
      onClose={onClose}
      sale={sale}
      bootstrap={bootstrap()}
      send={send}
      cardAvailable
      isAdmin
      onPaid={onPaid}
    />,
  );
  return { send, onPaid, onClose };
}

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  mockCardCollector.mockReset();
  mockReaderPanel.mockReset();
  mockLinkPanel.mockReset();
});

describe('PaySheet and practice sales', () => {
  it('records cash on an ordinary sale exactly as before', async () => {
    for (const sale of [base, { ...base, practice: false } as PosSale]) {
      const { send, onPaid } = await renderSheet(sale);
      expect(screen.queryByText('Practice sale. Nothing here is real, and no money moves.')).toBeNull();
      await press('Cash');
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Cash handed over'), '40');
      });
      await press('Record £35.50 in cash');
      expect(send).toHaveBeenCalledTimes(1);
      const input = send.mock.calls[0]![0] as { action: string; money: boolean; body: Record<string, unknown> };
      expect(input.action).toBe('payments');
      expect(input.money).toBe(true);
      expect(input.body).toMatchObject({ version: 3, method: 'cash', amount_pence: 3550, cash_tendered_pence: 4000 });
      expect(onPaid).toHaveBeenCalledWith({ changePence: 450, method: 'cash' });
      await screen.unmount();
    }
  });

  it('starts a real card, reader or pay link on an ordinary sale', async () => {
    await renderSheet(base);
    await press('Card');
    expect(screen.getByText('card-collector')).toBeTruthy();
    expect(mockCardCollector).toHaveBeenCalled();
  });

  it('only shows what each method would do on a practice sale, and never writes', async () => {
    const sale = { ...base, practice: true } as PosSale;
    const send = jest.fn();
    const card = await renderSheet(sale, send);
    expect(screen.getByText('Practice sale. Nothing here is real, and no money moves.')).toBeTruthy();
    // Each method hands its outcome straight back for the sale screen to show (design B13).
    await press('Card');
    expect(screen.queryByText('card-collector')).toBeNull();
    expect(card.onPaid).toHaveBeenCalledWith({ method: 'card_app', changePence: 0 }, undefined);
    expect(card.onClose).toHaveBeenCalled();
    await screen.unmount();

    const reader = await renderSheet(sale, send);
    await press('Card reader');
    expect(reader.onPaid).toHaveBeenCalledWith({ method: 'card_reader', changePence: 0 }, undefined);
    await screen.unmount();

    const link = await renderSheet(sale, send);
    await press('Pay by link or QR code');
    expect(link.onPaid).toHaveBeenCalledWith({ method: 'pay_link', changePence: 0 }, undefined);
    await screen.unmount();

    // The venue's own payment types, under "Other ways".
    const other = await renderSheet(sale, send);
    await press('Other ways');
    await press('Bank transfer');
    expect(other.onPaid).toHaveBeenCalledWith({ method: 'external', changePence: 0 }, { typeName: 'Bank transfer' });
    await screen.unmount();

    const cash = await renderSheet(sale, send);
    await press('Cash');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Cash handed over'), '40');
    });
    expect(screen.getByText('Change to give: £4.50')).toBeTruthy();
    await press('Record £35.50 in cash');
    expect(cash.onPaid).toHaveBeenCalledWith({ method: 'cash', changePence: 450 }, undefined);

    expect(send).not.toHaveBeenCalled();
    expect(mockCardCollector).not.toHaveBeenCalled();
    expect(mockReaderPanel).not.toHaveBeenCalled();
    expect(mockLinkPanel).not.toHaveBeenCalled();
  });
});
