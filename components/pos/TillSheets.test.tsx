/**
 * Cash-up in the app (POS app step 3, UX spec §7.2 to §7.4, §3.19.1; test plan TS-05, TS-08):
 * opening the till with a float, the blind close (the difference, the reason it needs, banking that
 * adds up), and "Open the till" from a cash payment refused with POS_TILL_SESSION_REQUIRED.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

const mockOpen = jest.fn();
const mockCount = jest.fn();
const mockClose = jest.fn();
let mockTills: unknown = null;
jest.mock('@/lib/queries/useTill', () => ({
  useOpenTill: () => ({ mutateAsync: mockOpen, isPending: false }),
  useCountTill: () => ({ mutateAsync: mockCount, isPending: false }),
  useCloseTill: () => ({ mutateAsync: mockClose, isPending: false }),
  useEmailZReport: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useTillMovement: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCashTipsDue: () => ({ data: [], isLoading: false, isError: false }),
  useTillSessions: () => ({ data: mockTills }),
  uploadTillReceiptPhoto: jest.fn(),
}));

import { ApiError } from '@/lib/api/client';
import { CashTillPrompt, CloseTillSheet, OpenTillSheet } from '@/components/pos/TillSheets';
import type { PosTillSession, PosTillState } from '@/types/pos';

const SESSION: PosTillSession = {
  id: 's1',
  till_id: 't1',
  status: 'open',
  business_date: '2026-10-09',
  opened_at: '2026-10-09T07:52:00Z',
  opened_by_name: 'Jess',
  opening_float_pence: 10000,
  closed_at: null,
  closed_by_name: null,
  count_attempts: 0,
  counted_cash_pence: null,
  variance_pence: null,
  variance_reason: null,
  cash_to_bank_pence: null,
  float_left_pence: null,
  version: 1,
};
const TILL: PosTillState = { id: 't1', name: 'Front desk', is_active: true, session: SESSION, last_float_left_pence: 10000 };

beforeEach(() => {
  mockOpen.mockReset();
  mockCount.mockReset();
  mockClose.mockReset();
});

describe('opening the till', () => {
  it('fills the float with what was left last time and sends it with one request id', async () => {
    mockOpen.mockResolvedValue({ session: SESSION, movements: [], report: null });
    const onOpened = jest.fn();
    await render(
      <OpenTillSheet
        visible
        till={{ ...TILL, session: null, last_float_left_pence: 8500 }}
        usualFloatPence={10000}
        onClose={jest.fn()}
        onOpened={onOpened}
      />,
    );
    expect(screen.getByText('Open Front desk')).toBeTruthy();
    expect(screen.getByText('Left in the drawer last time: £85.00')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Open till'));
    });
    expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ tillId: 't1', floatPence: 8500, denominations: null }));
    expect(onOpened).toHaveBeenCalledWith(expect.anything(), 'Front desk is open.');
  });
});

describe('closing the till: a blind count', () => {
  async function renderClose() {
    await render(
      <CloseTillSheet
        visible
        till={TILL}
        session={SESSION}
        blindClose
        canSeeExpected={false}
        expectedBeforePence={18150}
        usualFloatPence={10000}
        timeZone="Europe/London"
        onClose={jest.fn()}
      />,
    );
  }

  it('hides the expected figure, then shows the difference and asks for a reason', async () => {
    mockCount.mockResolvedValue({
      counted_cash_pence: 18000,
      variance_pence: -650,
      needs_reason: true,
      threshold_pence: 500,
      count_attempts: 1,
      can_recount: true,
    });
    await renderClose();
    expect(screen.getByText("You'll see how it compares once you've counted.")).toBeTruthy();
    expect(screen.queryByText(/Expected in the drawer/)).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Total counted'), '180.00');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    expect(mockCount).toHaveBeenCalledWith({ countedPence: 18000, denominations: null });
    expect(screen.getByText('£6.50 short')).toBeTruthy();
    expect(screen.getByText("The count doesn't match what we expected. Please say what might explain it.")).toBeTruthy();
    expect(screen.getByText('Count again')).toBeTruthy();
  });

  it('closes with the reason, the cash to the bank and the float left, then shows the Z report', async () => {
    mockCount.mockResolvedValue({
      counted_cash_pence: 18000,
      variance_pence: -150,
      needs_reason: false,
      threshold_pence: 500,
      count_attempts: 1,
      can_recount: true,
    });
    mockClose.mockResolvedValue({
      session: { ...SESSION, status: 'closed' },
      movements: [],
      report: {
        kind: 'z',
        status: 'closed',
        session_id: 's1',
        till_id: 't1',
        till_name: 'Front desk',
        business_date: '2026-10-09',
        opened_at: '2026-10-09T07:52:00Z',
        opened_by_name: 'Jess',
        as_at: '2026-10-09T17:07:00Z',
        closed_at: '2026-10-09T17:07:00Z',
        closed_by_name: 'Sam',
        sales_count: 3,
        by_method: [],
        taken_pence: 0,
        refunds: [],
        refunds_pence: 0,
        discounts: { sales: 0, pence: 0 },
        voids: { sales: 0, pence: 0 },
        tips: { card_pence: 0, cash_pence: null, paid_out_pence: 0 },
        cash: null,
        expected_cash_pence: null,
        counted_cash_pence: 18000,
        variance_pence: -150,
        cash_to_bank_pence: 8000,
        float_left_pence: 10000,
      },
    });
    await renderClose();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Total counted'), '180');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('What might explain the difference?'), 'Change given wrongly');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    // The usual float stays, the rest goes to the bank.
    expect(screen.getByDisplayValue('80.00')).toBeTruthy();
    expect(screen.getByDisplayValue('100.00')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Float left in the drawer'), '90.00');
    });
    expect(screen.getByText('These need to add up to the £180.00 you counted.')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Float left in the drawer'), '100.00');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Close till'));
    });
    expect(mockClose).toHaveBeenCalledWith({
      countedPence: 18000,
      denominations: null,
      reason: 'Change given wrongly',
      bankPence: 8000,
      floatPence: 10000,
    });
    expect(screen.getByText('Front desk is closed.')).toBeTruthy();
    expect(screen.getByText('Z report: Front desk')).toBeTruthy();
    expect(screen.getByText('Email to admins')).toBeTruthy();
  });

  it('goes back to the reason when the server says one is needed', async () => {
    mockCount.mockResolvedValue({
      counted_cash_pence: 18000,
      variance_pence: -150,
      needs_reason: false,
      threshold_pence: 500,
      count_attempts: 1,
      can_recount: false,
    });
    mockClose.mockRejectedValue(
      new ApiError('The count is £1.50 out, so please say why before closing.', 400, {
        error: 'The count is £1.50 out, so please say why before closing.',
        code: 'POS_VARIANCE_REASON_REQUIRED',
      }),
    );
    await renderClose();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Total counted'), '180');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Close till'));
    });
    expect(screen.getByText('The count is £1.50 out, so please say why before closing.')).toBeTruthy();
    expect(screen.getByText("The count doesn't match what we expected. Please say what might explain it.")).toBeTruthy();
  });
});

describe('"Open the till" from a cash payment', () => {
  it('opens the only till and puts a sale with no till on it', async () => {
    mockTills = {
      cash: { enabled: true, blind_close: true, variance_reason_threshold_pence: 500, default_float_pence: 10000, legacy_cash_till_id: null },
      tills: [{ ...TILL, session: null }],
      today: '2026-10-09',
      timezone: 'Europe/London',
      currency: 'GBP',
      can: { open_close_till: true, paid_in_out: true, see_expected_cash: false, end_of_day: false, manage_settings: false },
    };
    mockOpen.mockResolvedValue({ session: SESSION, movements: [], report: null });
    const send = jest.fn(async () => ({}));
    const onResolved = jest.fn();
    await render(<CashTillPrompt sale={{ till_id: null, version: 7 }} send={send} onResolved={onResolved} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Open the till'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Open till'));
    });
    expect(send).toHaveBeenCalledWith({ action: '', method: 'PATCH', body: { version: 7, till_id: 't1' } });
    expect(onResolved).toHaveBeenCalledWith('Front desk is open.');
  });
});
