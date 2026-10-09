/**
 * The sale's payment sheet (UX spec §3.18, §3.19, §13.3): cash with change, other payment types
 * with a required reference, the card button only where the app can take a card, and the app's
 * own tip screen before a card when tipping is on.
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
const mockCardProps = jest.fn();
jest.mock('@/components/pos/SaleCardCollect', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SaleCardCollect: (props: Record<string, unknown>) => {
      mockCardProps(props);
      return <Text>card-collector</Text>;
    },
  };
});

import { PaySheet } from '@/components/pos/PaySheet';
import { makeLine, makeSale } from '@/lib/pos/test-sale';
import type { PosBootstrap } from '@/types/pos';

function bootstrap(over: Partial<PosBootstrap> = {}): PosBootstrap {
  return {
    settings: { max_payment_pence: 1_000_000 },
    capabilities: { take_payment: true },
    role: 'staff',
    tills: [],
    payment_types: [{ id: 'type-1', name: 'Bank transfer', requires_reference: true, is_active: true }],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [],
    card_methods: { card_app: true },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    ...over,
  };
}

const sale = makeSale({ total_pence: 3550, balance_due_pence: 3550, lines: [makeLine({ total_pence: 3550 })] });

async function renderSheet(props: Partial<Parameters<typeof PaySheet>[0]> = {}) {
  const send = jest.fn().mockResolvedValue({ sale, change_given_pence: 450 });
  const onPaid = jest.fn();
  const onClose = jest.fn();
  await render(
    <PaySheet
      visible
      onClose={onClose}
      sale={sale}
      bootstrap={bootstrap()}
      send={send}
      cardAvailable={false}
      isAdmin={false}
      onPaid={onPaid}
      {...props}
    />,
  );
  return { send, onPaid, onClose };
}

beforeEach(() => mockCardProps.mockReset());

describe('PaySheet', () => {
  it('records cash with what was handed over, a request id, and shows the change', async () => {
    const { send, onPaid } = await renderSheet();
    await act(async () => {
      fireEvent.press(screen.getByText('Cash'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Cash handed over'), '40');
    });
    expect(screen.getByText('Change to give: £4.50')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Record £35.50 in cash'));
    });
    const input = send.mock.calls[0]![0] as { action: string; money: boolean; body: Record<string, unknown> };
    expect(input.action).toBe('payments');
    expect(input.money).toBe(true);
    expect(input.body).toMatchObject({ version: 3, method: 'cash', amount_pence: 3550, cash_tendered_pence: 4000 });
    expect(String(input.body.client_request_id).length).toBeGreaterThanOrEqual(8);
    expect(onPaid).toHaveBeenCalledWith({ changePence: 450, method: 'cash' });
    expect(screen.getByText('Give £4.50 change')).toBeTruthy();
  });

  it('takes part of the bill and says what is left', async () => {
    await renderSheet();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '20');
    });
    expect(screen.getByText('Paying part now leaves £15.50 to pay.')).toBeTruthy();
  });

  it('refuses more than the balance before sending anything', async () => {
    const { send } = await renderSheet();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '40');
    });
    expect(screen.getByText("That's more than the £35.50 still to pay. Enter £35.50 or less.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('needs the reference a payment type asks for', async () => {
    const { send } = await renderSheet();
    await act(async () => {
      fireEvent.press(screen.getByText('Other: Bank transfer'));
    });
    const confirm = screen.getByText('Record £35.50 by Bank transfer');
    await act(async () => {
      fireEvent.press(confirm);
    });
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Reference'), '4242');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Record £35.50 by Bank transfer'));
    });
    expect((send.mock.calls[0]![0] as { body: Record<string, unknown> }).body).toMatchObject({
      method: 'external',
      payment_type_id: 'type-1',
      reference: '4242',
      amount_pence: 3550,
    });
  });

  it('offers a card only where the app can take one', async () => {
    await renderSheet({ cardAvailable: false });
    expect(screen.queryByText('Card')).toBeNull();
  });

  it('asks for a tip first when tipping is on, then hands the tip to the card collector', async () => {
    await renderSheet({
      cardAvailable: true,
      bootstrap: bootstrap({ tip_settings: { tipping_enabled: true, tip_percent_presets: [10, 15, 20], smart_tip_threshold_pence: 1000 } }),
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Card'));
    });
    expect(screen.getAllByText('Would you like to add a tip?').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(screen.getByText('10% (£3.55)'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Charge £39.05'));
    });
    expect(screen.getByText('card-collector')).toBeTruthy();
    expect(mockCardProps).toHaveBeenLastCalledWith(expect.objectContaining({ amountPence: 3550, tipPence: 355 }));
  });

  it('goes straight to the card when tipping is off', async () => {
    await renderSheet({ cardAvailable: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Card'));
    });
    expect(mockCardProps).toHaveBeenLastCalledWith(expect.objectContaining({ amountPence: 3550, tipPence: 0 }));
  });
});
