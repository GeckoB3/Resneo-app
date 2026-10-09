/**
 * Gift vouchers and account credit in the app (POS Pass V app step, UX spec §20.2 to §20.5;
 * test plan GV-20): selling a voucher line, paying with a voucher found by its code (the code goes
 * only in the look-up's body and leaves the field once found), paying with credit, the cap for a
 * sale that holds a voucher line, and refunds that go back to the voucher.
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
jest.mock('@/components/ui/DatePickerField', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { DatePickerField: ({ value }: { value: string }) => React.createElement(Text, null, `DATE ${value}`) };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/components/pos/SaleCardCollect', () => ({ SaleCardCollect: () => null }));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
const mockLookup = jest.fn();
let mockCredit = 0;
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  lookupVoucher: (...args: unknown[]) => mockLookup(...args),
  useClientStoredValue: () => ({ data: { credit: { account_id: 'c', balance_pence: mockCredit }, vouchers: [] } }),
  useVoucherSettings: () => ({ data: null, isLoading: false }),
}));

import { RefundSheet } from '@/components/pos/AfterSaleSheets';
import { PaySheet } from '@/components/pos/PaySheet';
import { VoucherSellForm } from '@/components/pos/VoucherSheets';
import { ApiError } from '@/lib/api/client';
import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';
import { addDaysToYmd, sendAtIso, todayInZone } from '@/lib/pos/voucher-math';
import type { PosBootstrap, PosSale } from '@/types/pos';

function bootstrap(over: Partial<PosBootstrap> = {}): PosBootstrap {
  return {
    settings: { max_payment_pence: 1_000_000 },
    capabilities: { take_payment: true, create_sale: true, refund: true },
    role: 'staff',
    tills: [],
    payment_types: [],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [],
    card_methods: { card_app: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    vouchers: { selling: true, redeemable: true },
    ...over,
  };
}

const sale = makeSale({ total_pence: 3550, balance_due_pence: 3550, lines: [makeLine({ total_pence: 3550 })] });
const VOUCHER = {
  id: 'voucher-1',
  code_last4: '9HPA',
  status: 'active',
  balance_pence: 5000,
  initial_pence: 5000,
  expires_at: '2027-10-10T23:00:00Z',
  recipient_name: 'Jo',
};

async function renderPay(over: { sale?: PosSale; bootstrap?: PosBootstrap; send?: jest.Mock } = {}) {
  const send = over.send ?? jest.fn().mockResolvedValue({ sale, balance_left_pence: 1450 });
  const onPaid = jest.fn();
  const onClose = jest.fn();
  await render(
    <PaySheet
      visible
      onClose={onClose}
      sale={over.sale ?? sale}
      bootstrap={over.bootstrap ?? bootstrap()}
      send={send}
      cardAvailable={false}
      isAdmin={false}
      onPaid={onPaid}
    />,
  );
  return { send, onPaid, onClose };
}

async function findVoucher(typed: string) {
  await act(async () => {
    fireEvent.press(screen.getByText('Gift voucher'));
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Voucher code'), typed);
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Find voucher'));
  });
}

beforeEach(() => {
  mockLookup.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockCredit = 0;
});

describe('paying with a gift voucher', () => {
  it('is offered only where vouchers can be taken', async () => {
    await renderPay({ bootstrap: bootstrap({ vouchers: undefined }) });
    expect(screen.queryByText('Gift voucher')).toBeNull();
  });

  it('stops a code that is not one before anything is sent', async () => {
    await renderPay();
    await findVoucher('12');
    expect(screen.getByText("That doesn't look like a voucher code. Check it and try again.")).toBeTruthy();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('looks the code up in the body, clears it, and takes the smaller of the balance and the bill', async () => {
    mockLookup.mockResolvedValue(VOUCHER);
    const { send, onPaid } = await renderPay();
    await findVoucher('7k4q m2xd 9hpa');
    expect(mockLookup).toHaveBeenCalledWith('token-A', '7K4QM2XD9HPA');
    expect(screen.getByLabelText('Voucher code').props.value).toBe('');
    expect(screen.getByText('Gift voucher ending 9HPA')).toBeTruthy();
    expect(screen.getByText('£50.00 left')).toBeTruthy();
    expect(screen.getByText('For Jo')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Take £35.50 from the voucher'));
    });
    const input = send.mock.calls[0]![0] as { action: string; money: boolean; body: Record<string, unknown> };
    expect(input).toMatchObject({ action: 'payments', money: true });
    expect(input.body).toMatchObject({ method: 'gift_card', voucher_id: 'voucher-1', amount_pence: 3550, version: 3 });
    expect(input.body).not.toHaveProperty('voucher_code');
    expect(input.body).not.toHaveProperty('tip_pence');
    expect(JSON.stringify(input.body)).not.toContain('7K4Q');
    expect(mockToast.success).toHaveBeenCalledWith("Done. There's £14.50 left on the voucher.");
    expect(onPaid).toHaveBeenCalledWith({ changePence: 0, method: 'gift_card' });
  });

  it('cannot pay for a voucher line on the same sale', async () => {
    mockLookup.mockResolvedValue(VOUCHER);
    const withVoucherLine = makeSale({
      total_pence: 6050,
      balance_due_pence: 6050,
      lines: [makeLine({ total_pence: 3550 }), makeLine({ id: 'gv', line_type: 'gift_card', total_pence: 2500 })],
    });
    await renderPay({ sale: withVoucherLine });
    await findVoucher('7K4QM2XD9HPA');
    expect(
      screen.getByText("Gift vouchers and account credit can't pay for another gift voucher. Take £25.00 another way."),
    ).toBeTruthy();
    expect(screen.getByText('Take £35.50 from the voucher')).toBeTruthy();
  });

  it('says plainly when a voucher cannot be used, and offers no button', async () => {
    mockLookup.mockResolvedValue({ ...VOUCHER, status: 'expired', expires_at: '2026-01-01T00:00:00Z' });
    await renderPay();
    await findVoucher('7K4QM2XD9HPA');
    expect(
      screen.getByText("This gift voucher ran out on 31 December 2025. An admin can extend it if you're happy to take it."),
    ).toBeTruthy();
    expect(screen.queryByText(/from the voucher$/)).toBeNull();
  });

  it('says "payment dispute" only when a dispute put the voucher on hold', async () => {
    mockLookup.mockResolvedValue({ ...VOUCHER, status: 'frozen', on_hold: 'dispute' });
    await renderPay();
    await findVoucher('7K4QM2XD9HPA');
    expect(screen.getByText("This gift voucher is on hold while a payment dispute is open, so it can't be used yet.")).toBeTruthy();
    expect(screen.queryByText(/from the voucher$/)).toBeNull();
  });

  it("uses the server's sentence, naming no reason, for a hold an admin made", async () => {
    mockLookup.mockResolvedValue({ ...VOUCHER, status: 'frozen', on_hold: 'staff' });
    await renderPay();
    await findVoucher('7K4QM2XD9HPA');
    expect(screen.getByText("This gift voucher is on hold, so it can't be used yet. An admin can check why in Gift vouchers.")).toBeTruthy();
    expect(screen.queryByText(/payment dispute/)).toBeNull();
    expect(screen.queryByText(/from the voucher$/)).toBeNull();
  });

  it("shows the server's sentence when it holds less, and offers to take what is left", async () => {
    mockLookup.mockResolvedValue(VOUCHER);
    const send = jest.fn().mockRejectedValue(
      new ApiError('x', 409, {
        error: 'This gift voucher only has £10.00 left. Take £10.00 from it, and the rest another way.',
        code: 'VOUCHER_INSUFFICIENT_BALANCE',
        balance_pence: 1000,
      }),
    );
    await renderPay({ send });
    await findVoucher('7K4QM2XD9HPA');
    await act(async () => {
      fireEvent.press(screen.getByText('Take £35.50 from the voucher'));
    });
    expect(screen.getByText('This gift voucher only has £10.00 left. Take £10.00 from it, and the rest another way.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Take £10.00'));
    });
    expect(screen.getByText('Take £10.00 from the voucher')).toBeTruthy();
  });

  it("shows the server's sentence for a code it does not know", async () => {
    mockLookup.mockRejectedValue(
      new ApiError('x', 404, {
        error: "We can't find a gift voucher with that code at Studio. Check the code and try again.",
        code: 'VOUCHER_NOT_FOUND',
      }),
    );
    await renderPay();
    await findVoucher('7K4QM2XD9HPA');
    expect(screen.getByText("We can't find a gift voucher with that code at Studio. Check the code and try again.")).toBeTruthy();
  });
});

describe('paying with account credit', () => {
  const withClient = makeSale({
    total_pence: 3550,
    balance_due_pence: 3550,
    lines: [makeLine({ total_pence: 3550 })],
    guest: { id: 'g1', name: 'Alex', email: null, phone: null },
  });

  it('is offered only when the client has some', async () => {
    await renderPay({ sale: withClient });
    expect(screen.queryByText('Account credit')).toBeNull();
  });

  it('uses the credit, up to what the client has', async () => {
    mockCredit = 2000;
    const { send, onPaid } = await renderPay({ sale: withClient });
    expect(screen.getByText('Alex has £20.00 credit')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Account credit'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Use £20.00 of credit'));
    });
    expect((send.mock.calls[0]![0] as { body: Record<string, unknown> }).body).toMatchObject({
      method: 'account_credit',
      amount_pence: 2000,
    });
    expect(onPaid).toHaveBeenCalledWith({ changePence: 0, method: 'account_credit' });
  });
});

describe('selling a voucher', () => {
  const settings = { preset_pence: [2500, 5000], custom_allowed: true, min_pence: 1000, max_pence: 50000, expiry_months: 12, set_up: true };

  it('adds a gift voucher line for someone else, emailed on a date at 8am', async () => {
    const send = jest.fn().mockResolvedValue({ sale });
    const onDone = jest.fn();
    await render(
      <VoucherSellForm settings={settings} presetPence={5000} sale={sale} send={send} timeZone="Europe/London" onDone={onDone} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('A gift for someone else'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Their name'), 'Jo');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Email it on a date'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Their email, to send it to them'), 'jo@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add to sale'));
    });
    const tomorrow = addDaysToYmd(todayInZone('Europe/London'), 1);
    expect(send).toHaveBeenCalledWith({
      action: 'lines',
      body: {
        version: 3,
        ops: [
          {
            op: 'add',
            line: {
              kind: 'gift_card',
              value_pence: 5000,
              recipient_name: 'Jo',
              recipient_email: 'jo@example.com',
              send_at: sendAtIso(tomorrow, 'Europe/London'),
            },
          },
        ],
      },
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('holds another amount to the venue range', async () => {
    const send = jest.fn();
    await render(<VoucherSellForm settings={settings} presetPence={null} sale={sale} send={send} timeZone="Europe/London" onDone={jest.fn()} />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Value'), '5');
    });
    expect(screen.getByText('The smallest voucher is £10.00.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Add to sale'));
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('refunding voucher and credit payments', () => {
  const gift = makePayment({
    id: 'gv',
    method: 'gift_card',
    is_money: false,
    amount_pence: 3000,
    refundable_pence: 0,
    voucher: { account_id: 'acc-1', code_last4: '9HPA', status: 'active', expires_at: null },
  });

  it('sends a voucher payment back to the voucher, whoever is signed in', async () => {
    const paid = makeSale({ status: 'completed', balance_due_pence: 0, payments: [gift] });
    const send = jest.fn().mockResolvedValue({ sale: paid, refunds: [] });
    await render(
      <RefundSheet visible onClose={jest.fn()} sale={paid} bootstrap={bootstrap({ settings: { refund_reasons: ['Goodwill'] } })} send={send} cancelSale={false} onRefunded={jest.fn()} />,
    );
    expect(screen.getByText('Back to the gift voucher ending 9HPA')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Goodwill'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Refund £30.00'));
    });
    const body = (send.mock.calls[0]![0] as { body: { destinations: Record<string, unknown>[] } }).body;
    expect(body.destinations).toEqual([{ payment_id: 'gv', amount_pence: 3000, destination: 'original' }]);
  });

  it('needs a client before an expired voucher can go to credit', async () => {
    const expired = { ...gift, voucher: { ...gift.voucher!, status: 'expired' } };
    const paid = makeSale({ status: 'completed', balance_due_pence: 0, payments: [expired] });
    const send = jest.fn();
    await render(
      <RefundSheet visible onClose={jest.fn()} sale={paid} bootstrap={bootstrap({ settings: { refund_reasons: ['Goodwill'] } })} send={send} cancelSale={false} onRefunded={jest.fn()} />,
    );
    expect(screen.getByText('Add the client first, so the credit has somewhere to go.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Goodwill'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Refund £30.00'));
    });
    expect(send).not.toHaveBeenCalled();
  });
});
