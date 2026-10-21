/**
 * The sale's payment sheet (UX spec §3.18, §3.19, §13.3): cash with change, other payment types
 * with a required reference, the card button only where the app can take a card, and, when tipping
 * is on, the client's own tip screen handed to the card collector (never a tip step in staff's sheet).
 *
 * Laid out as Part 2 mock-up 1 (2026-10-11): "£35.50 to pay" as the headline, the amount behind
 * "Pay part of it" with an even split that shows every share (odd pennies first), the methods as
 * tiles, the venue's own types under "Other ways", and a card tile that says when this phone can't
 * take cards.
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

jest.mock('@/components/pos/PayLinkPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { PayLinkPanel: (props: { amountPence: number }) => <Text>{`pay-link-panel ${props.amountPence}`}</Text> };
});
jest.mock('@/components/pos/ReaderPayPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ReaderPayPanel: (props: { amountPence: number }) => <Text>{`reader-panel ${props.amountPence}`}</Text> };
});
const mockPhoneProps = jest.fn();
jest.mock('@/components/pos/SendToPhonePanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SendToPhonePanel: (props: { amountPence: number }) => {
      mockPhoneProps(props);
      return <Text>{`phone-panel ${props.amountPence}`}</Text>;
    },
  };
});
// Whether this build and phone may offer Tap to Pay (the card tile's line says so).
let mockTapToPay = true;
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({ buildSupportsTapToPay: () => mockTapToPay }));
// What the Android probe said about this device (false: a tablet without NFC; null: unknown).
let mockDeviceTapToPay: boolean | null = null;
jest.mock('@/lib/payments/tap-to-pay-device-support', () => ({ useTapToPayDeviceSupport: () => mockDeviceTapToPay }));
jest.mock('@/components/pos/SavedCards', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SavedCardMethods: () => <Text>saved-cards</Text>, SavedCardCharge: () => <Text>saved-charge</Text> };
});

import { PaySheet } from '@/components/pos/PaySheet';
import { ApiError } from '@/lib/api/client';
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

async function openPart() {
  await act(async () => {
    fireEvent.press(screen.getByText('Pay part of it'));
  });
}

beforeEach(() => {
  mockCardProps.mockReset();
  mockPhoneProps.mockReset();
  mockTapToPay = true;
  mockDeviceTapToPay = null;
});

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

  it("shows the server's sentence for a reused request id and tries again with a new id", async () => {
    const sentence = 'That request was already used for a different payment, so nothing new was taken. Refresh the sale and try again.';
    const send = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(sentence, 409, { error: sentence, code: 'CONFLICT', reason: 'request_reused' }))
      .mockRejectedValueOnce(new ApiError('Network request failed', 0))
      .mockResolvedValue({ sale, change_given_pence: 0 });
    await renderSheet({ send });
    await act(async () => {
      fireEvent.press(screen.getByText('Cash'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Cash handed over'), '35.50');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Record £35.50 in cash'));
    });
    expect(screen.getByText(sentence)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Record £35.50 in cash'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Record £35.50 in cash'));
    });
    const ids = send.mock.calls.map((c) => (c[0] as { body: { client_request_id: string } }).body.client_request_id);
    // The refused id is never sent again; a lost answer keeps its id for the retry.
    expect(ids[1]).not.toBe(ids[0]);
    expect(ids[2]).toBe(ids[1]);
  });

  it('takes part of the bill and says what is left', async () => {
    await renderSheet();
    await openPart();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '20');
    });
    expect(screen.getByText('Paying part now leaves £15.50 to pay.')).toBeTruthy();
    expect(screen.getByText('Take £20.00 by')).toBeTruthy();
  });

  it('refuses more than the balance before sending anything', async () => {
    const { send } = await renderSheet();
    await openPart();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '40');
    });
    expect(screen.getByText("That's more than the £35.50 still to pay. Enter £35.50 or less.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('needs the reference a payment type asks for', async () => {
    const { send } = await renderSheet();
    await act(async () => {
      fireEvent.press(screen.getByText('Other ways'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Bank transfer'));
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

  it('offers a card only where the app can take one, and says so in the card tile where it cannot', async () => {
    await renderSheet({ cardAvailable: false });
    // The venue takes cards in the app, this phone can't, and there is no counter reader.
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.getByText('Not on this phone')).toBeTruthy();
    expect(screen.getByText('Take cash or another way, or use the web till')).toBeTruthy();
    // Nothing to press: the collector never opens, and the old footnote is gone.
    expect(screen.queryByRole('button', { name: 'Card' })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Card'));
    });
    expect(screen.queryByText('card-collector')).toBeNull();
    expect(screen.queryByText("Card payments can't be taken on this phone. Take cash or another way, or use the web till.")).toBeNull();
  });

  it('goes straight to the card with tipping on, giving the collector the client\'s tip screen', async () => {
    const tipSettings = { tipping_enabled: true, tip_percent_presets: [10, 15, 20], smart_tip_threshold_pence: 1000 };
    await renderSheet({ cardAvailable: true, bootstrap: bootstrap({ tip_settings: tipSettings }) });
    await act(async () => {
      fireEvent.press(screen.getByText('Card'));
    });
    // No tip step in staff's sheet: the client chooses once the reader is ready.
    expect(screen.queryByText('Would you like to add a tip?')).toBeNull();
    expect(screen.getByText('card-collector')).toBeTruthy();
    const props = mockCardProps.mock.calls.at(-1)![0] as { amountPence: number; customerTip: Record<string, unknown>; onCustomerFacing: (f: boolean) => void };
    expect(props.amountPence).toBe(3550);
    expect(props.customerTip).toEqual(
      expect.objectContaining({ amountPence: 3550, balancePence: 3550, tipSettings, venueName: 'Studio', maxPaymentPence: 1_000_000 }),
    );
    // While the client holds the phone the sheet becomes client mode: the collector draws the whole
    // screen and none of staff's words stay on it.
    await act(async () => {
      props.onCustomerFacing(true);
    });
    expect(screen.getByText('card-collector')).toBeTruthy();
    expect(screen.queryByText('Take payment')).toBeNull();
  });

  it('goes straight to the card with no tip screen when tipping is off', async () => {
    await renderSheet({ cardAvailable: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Card'));
    });
    expect(mockCardProps).toHaveBeenLastCalledWith(expect.objectContaining({ amountPence: 3550, customerTip: null }));
  });

  it('offers the counter reader and a pay link only where the venue has them (app step 2)', async () => {
    await renderSheet();
    expect(screen.queryByText('Card reader')).toBeNull();
    expect(screen.queryByText('Pay by link or QR code')).toBeNull();
    expect(screen.queryByText('saved-cards')).toBeNull();
  });

  it('sends the amount to the counter reader or a pay link', async () => {
    await renderSheet({ bootstrap: bootstrap({ card_methods: { card_app: true, card_reader: true, pay_link: true } }) });
    await act(async () => {
      fireEvent.press(screen.getByText('Card reader'));
    });
    expect(screen.getByText('reader-panel 3550')).toBeTruthy();
  });

  it('makes a pay link for part of the bill', async () => {
    await renderSheet({ bootstrap: bootstrap({ card_methods: { card_app: true, pay_link: true } }) });
    await openPart();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '20.00');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Pay by link or QR code'));
    });
    expect(screen.getByText('pay-link-panel 2000')).toBeTruthy();
  });

  it('offers cards on file with charge_saved_card, the setting on and a client on the sale', async () => {
    const withClient = { ...sale, guest: { id: 'g-1', name: 'Ada Lovelace', email: null, phone: null } };
    await renderSheet({
      sale: withClient,
      bootstrap: bootstrap({
        settings: { max_payment_pence: 1_000_000, card_on_file_enabled: true },
        capabilities: { take_payment: true, charge_saved_card: true },
      }),
    });
    expect(screen.getByText('saved-cards')).toBeTruthy();
  });

  it('lets the client be asked to save their card when cards on file are on', async () => {
    const withClient = { ...sale, guest: { id: 'g-1', name: 'Ada Lovelace', email: null, phone: null } };
    await renderSheet({
      sale: withClient,
      cardAvailable: true,
      bootstrap: bootstrap({ settings: { max_payment_pence: 1_000_000, card_on_file_enabled: true } }),
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Card'));
    });
    expect(mockCardProps).toHaveBeenLastCalledWith(expect.objectContaining({ consentClientName: 'Ada' }));
  });
  describe('as a clear choice (Part 2 mock-up 1)', () => {
    const types = [
      { id: 'type-1', name: 'Bank transfer', requires_reference: true, is_active: true },
      { id: 'type-2', name: 'Paper voucher', requires_reference: false, is_active: true },
    ];

    it("leads with the amount due, shows the methods as tiles and folds the venue's own types", async () => {
      await renderSheet({
        bootstrap: bootstrap({
          card_methods: { card_app: true, card_reader: true, pay_link: true },
          vouchers: { selling: true, redeemable: true },
          payment_types: types,
        }),
      });
      expect(screen.getByText('Take payment')).toBeTruthy();
      expect(screen.getByText('£35.50 to pay')).toBeTruthy();
      // Most sales are paid in one go: the amount waits behind "Pay part of it".
      expect(screen.queryByLabelText('Amount to pay now')).toBeNull();
      expect(screen.getByText('Tap, insert or swipe')).toBeTruthy();
      expect(screen.getByText('Shows the change to give')).toBeTruthy();
      expect(screen.getByText('They pay on their own phone')).toBeTruthy();
      expect(screen.getByText('Scan or type the code')).toBeTruthy();
      // Card methods are navy; the rest are not.
      expect(screen.getByRole('button', { name: 'Card reader' })).toHaveStyle({ backgroundColor: '#003B6F' });
      expect(screen.getByRole('button', { name: 'Cash' })).not.toHaveStyle({ backgroundColor: '#003B6F' });
      // This phone can't take cards, but the counter reader can: no "Not on this phone", no footnote.
      expect(screen.queryByText('Not on this phone')).toBeNull();
      expect(screen.queryByText("Card payments can't be taken on this phone. Take cash or another way, or use the web till.")).toBeNull();
      // One row names the venue's own types; each is a tap away once it opens.
      expect(screen.getByText('Bank transfer, Paper voucher')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Paper voucher' })).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Other ways' }));
      });
      expect(screen.getByRole('button', { name: 'Paper voucher' })).toBeTruthy();
      expect(screen.queryByText('Other: Bank transfer')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Paper voucher' }));
      });
      expect(screen.getByText('Record £35.50 by Paper voucher')).toBeTruthy();
    });

    it('splits evenly with every share shown, odd pennies first, and takes exactly that share', async () => {
      const odd = makeSale({ total_pence: 4995, balance_due_pence: 4995, lines: [makeLine({ total_pence: 4995 })] });
      const { send } = await renderSheet({ sale: odd });
      expect(screen.getByText('£49.95 to pay')).toBeTruthy();
      await openPart();
      await act(async () => {
        fireEvent.press(screen.getByRole('radio', { name: 'Split it 2 ways' }));
      });
      expect(screen.getByText('£24.98 + £24.97')).toBeTruthy();
      expect(screen.getByLabelText('Amount to pay now').props.value).toBe('24.98');
      expect(screen.getByText('Paying part now leaves £24.97 to pay.')).toBeTruthy();
      expect(screen.getByText('Take £24.98 by')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByRole('radio', { name: 'Split it 4 ways' }));
      });
      expect(screen.getByText('£12.49 + £12.49 + £12.49 + £12.48')).toBeTruthy();
      expect(screen.getByText('Take £12.49 by')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByRole('radio', { name: 'Split it 2 ways' }));
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Cash'));
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Record £24.98 in cash'));
      });
      expect((send.mock.calls[0]![0] as { body: Record<string, unknown> }).body).toMatchObject({ method: 'cash', amount_pence: 2498 });
    });

    it('puts the odd penny of £10.00 in three on the first share', async () => {
      const ten = makeSale({ total_pence: 1000, balance_due_pence: 1000, lines: [makeLine({ total_pence: 1000 })] });
      await renderSheet({ sale: ten });
      await openPart();
      await act(async () => {
        fireEvent.press(screen.getByRole('radio', { name: 'Split it 3 ways' }));
      });
      expect(screen.getByText('£3.34 + £3.33 + £3.33')).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Split it 3 ways' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
      // Typing an amount by hand lets go of the split.
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '5');
      });
      expect(screen.queryByText('£3.34 + £3.33 + £3.33')).toBeNull();
      expect(screen.getByText('Paying part now leaves £5.00 to pay.')).toBeTruthy();
    });

    it('goes back to the whole bill with "Pay all of it"', async () => {
      const { send } = await renderSheet();
      await openPart();
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '20');
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Pay all of it'));
      });
      expect(screen.queryByLabelText('Amount to pay now')).toBeNull();
      expect(screen.queryByText(/^Take .* by$/)).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByText('Cash'));
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Record £35.50 in cash'));
      });
      expect((send.mock.calls[0]![0] as { body: Record<string, unknown> }).body).toMatchObject({ amount_pence: 3550 });
    });

    it("opens the amount by itself when the whole bill is more than the venue's largest single payment", async () => {
      await renderSheet({ bootstrap: bootstrap({ settings: { max_payment_pence: 2000 } }) });
      expect(screen.getByLabelText('Amount to pay now')).toBeTruthy();
      expect(
        screen.getByText(
          "That's more than £20.00, the largest single payment Studio allows. Check the amount, or ask an admin to change the limit in Settings, Checkout.",
        ),
      ).toBeTruthy();
      // "Pay all of it" would only bring the same problem back.
      expect(screen.queryByText('Pay all of it')).toBeNull();
      expect(screen.getByRole('button', { name: 'Cash' })).toBeDisabled();
      await act(async () => {
        fireEvent.press(screen.getByRole('radio', { name: 'Split it 2 ways' }));
      });
      expect(screen.getByText('£17.75 + £17.75')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Cash' })).not.toBeDisabled();
    });

    it('holds every tile that takes the amount while the amount is more than the bill', async () => {
      await renderSheet({ bootstrap: bootstrap({ card_methods: { card_app: true, pay_link: true }, vouchers: { selling: true, redeemable: true } }) });
      await openPart();
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '40');
      });
      expect(screen.getByRole('button', { name: 'Cash' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Pay by link or QR code' })).toBeDisabled();
      // A voucher asks for its own amount, as before.
      expect(screen.getByRole('button', { name: 'Gift voucher' })).not.toBeDisabled();
    });

    it("tells staff to send a pay link when the phone can't take cards and links are on", async () => {
      await renderSheet({ cardAvailable: false, bootstrap: bootstrap({ card_methods: { card_app: true, pay_link: true } }) });
      expect(screen.getByText('Not on this phone')).toBeTruthy();
      expect(screen.getByText('Send a pay link, or use the web till')).toBeTruthy();
      expect(screen.getByLabelText('Card. Not on this phone. Send a pay link, or use the web till')).toBeTruthy();
    });

    it('shows no card tile at a venue that takes no cards in the app', async () => {
      await renderSheet({ cardAvailable: false, bootstrap: bootstrap({ card_methods: { card_app: false } }) });
      expect(screen.queryByText('Card')).toBeNull();
      expect(screen.queryByText('Not on this phone')).toBeNull();
    });

    it('offers the card on this phone first, in navy, saying how it is taken', async () => {
      await renderSheet({ cardAvailable: true, bootstrap: bootstrap({ card_methods: { card_app: true, card_reader: true } }) });
      expect(screen.getByRole('button', { name: 'Card' })).toHaveStyle({ backgroundColor: '#003B6F' });
      expect(screen.getByText('Tap to Pay on iPhone or a Bluetooth reader')).toBeTruthy();
      const order = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
      expect(order.indexOf('Card')).toBeLessThan(order.indexOf('Card reader'));
      expect(order.indexOf('Card reader')).toBeLessThan(order.indexOf('Cash'));
    });

    it('says a phone without Tap to Pay takes cards on its Bluetooth reader', async () => {
      mockTapToPay = false;
      await renderSheet({ cardAvailable: true });
      expect(screen.getByText('With your Bluetooth card reader')).toBeTruthy();
    });
  });

  describe('Send to a phone, on a device that cannot take cards', () => {
    const phoneBoot = (card_methods: PosBootstrap['card_methods']) => bootstrap({ card_methods });

    it('comes first, in navy, in place of the card tile when someone has a phone that can take cards', async () => {
      await renderSheet({ cardAvailable: false, bootstrap: phoneBoot({ card_app: true, send_to_phone: true, card_reader: true }) });
      expect(screen.getByRole('button', { name: 'Send to a phone' })).toHaveStyle({ backgroundColor: '#003B6F' });
      expect(screen.getByText("Take it on a team member's phone")).toBeTruthy();
      expect(screen.queryByText('Not on this phone')).toBeNull();
      const order = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
      expect(order.indexOf('Send to a phone')).toBeLessThan(order.indexOf('Card reader'));
      expect(order.indexOf('Card reader')).toBeLessThan(order.indexOf('Cash'));
    });

    it('opens the panel with the amount, and a pay link and the counter reader to fall back on', async () => {
      await renderSheet({
        cardAvailable: false,
        bootstrap: phoneBoot({ card_app: true, send_to_phone: true, card_reader: true, pay_link: true }),
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Send to a phone' }));
      });
      expect(screen.getByText('phone-panel 3550')).toBeTruthy();
      const props = mockPhoneProps.mock.calls.at(-1)![0] as { onUseLink?: () => void; onUseReader?: () => void };
      expect(props.onUseLink).toBeInstanceOf(Function);
      expect(props.onUseReader).toBeInstanceOf(Function);
    });

    it('sends the part typed, not the whole bill', async () => {
      await renderSheet({ cardAvailable: false, bootstrap: phoneBoot({ card_app: true, send_to_phone: true }) });
      await openPart();
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Amount to pay now'), '20');
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Send to a phone' }));
      });
      expect(screen.getByText('phone-panel 2000')).toBeTruthy();
    });

    it('closes the sheet once the phone has taken it', async () => {
      const { onPaid, onClose } = await renderSheet({ cardAvailable: false, bootstrap: phoneBoot({ card_app: true, send_to_phone: true }) });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Send to a phone' }));
      });
      const props = mockPhoneProps.mock.calls.at(-1)![0] as { onPaid: () => void };
      await act(async () => {
        props.onPaid();
      });
      expect(onPaid).toHaveBeenCalledWith({ changePence: 0, method: 'card_app' });
      expect(onClose).toHaveBeenCalled();
    });

    it('comes first on an Android tablet without NFC, with the card tile kept for a Bluetooth reader', async () => {
      // The app's card SDK is in every store build, so the card is "available" on the tablet too:
      // only the device's own answer says it can't tap.
      mockDeviceTapToPay = false;
      await renderSheet({ cardAvailable: true, bootstrap: phoneBoot({ card_app: true, send_to_phone: true }) });
      const order = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
      expect(order.indexOf('Send to a phone')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('Send to a phone')).toBeLessThan(order.indexOf('Card'));
      expect(screen.getByText('With your Bluetooth card reader')).toBeTruthy();
      expect(screen.queryByText('Tap to Pay on iPhone or a Bluetooth reader')).toBeNull();
    });

    it('comes first on an iPad, which never has Tap to Pay', async () => {
      mockTapToPay = false;
      await renderSheet({ cardAvailable: true, bootstrap: phoneBoot({ card_app: true, send_to_phone: true }) });
      expect(screen.getByRole('button', { name: 'Send to a phone' })).toBeTruthy();
      expect(screen.getByText('With your Bluetooth card reader')).toBeTruthy();
    });

    it('is not offered on a device that takes the card itself', async () => {
      await renderSheet({ cardAvailable: true, bootstrap: phoneBoot({ card_app: true, send_to_phone: true }) });
      expect(screen.queryByRole('button', { name: 'Send to a phone' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Card' })).toBeTruthy();
    });

    it('still says the card is not on this phone when nobody has a phone that can take one', async () => {
      await renderSheet({ cardAvailable: false, bootstrap: phoneBoot({ card_app: true, send_to_phone: false }) });
      expect(screen.queryByRole('button', { name: 'Send to a phone' })).toBeNull();
      expect(screen.getByText('Not on this phone')).toBeTruthy();
    });

    it('is not offered to a login that cannot take payments', async () => {
      await renderSheet({
        cardAvailable: false,
        bootstrap: bootstrap({ card_methods: { card_app: true, send_to_phone: true }, capabilities: {} }),
      });
      expect(screen.queryByRole('button', { name: 'Send to a phone' })).toBeNull();
    });
  });
});
