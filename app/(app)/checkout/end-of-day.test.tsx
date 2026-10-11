/**
 * End of day lists each till session counted that day. A day can hold several sessions of the same
 * till, so each row says when it was open; the balance reads as part of the row's sentence.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosEnabled: () => true,
}));
let mockEod: unknown = null;
jest.mock('@/lib/queries/useTill', () => ({
  useEndOfDay: () => ({ data: mockEod, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
}));

import EndOfDayScreen from '@/app/(app)/checkout/end-of-day';
import type { PosEndOfDayResponse, PosEndOfDayTill } from '@/types/pos';

function session(over: Partial<PosEndOfDayTill>): PosEndOfDayTill {
  return {
    session_id: 's1',
    till_id: 't1',
    till_name: 'Front desk',
    status: 'closed',
    business_date: '2026-10-11',
    opened_at: '2026-10-11T10:26:00Z',
    closed_at: '2026-10-11T10:36:00Z',
    opened_by_name: 'Jess',
    closed_by_name: 'Jess',
    expected_cash_pence: 8200,
    counted_cash_pence: 7000,
    variance_pence: -1200,
    variance_reason: 'Change given wrongly',
    ...over,
  };
}

function eod(tills: PosEndOfDayTill[]): PosEndOfDayResponse {
  return {
    today: '2026-10-11',
    summary: {
      date: '2026-10-11',
      totals: {
        payments_pence: 0,
        refunds_pence: 0,
        disputes_pence: 0,
        net_pence: 0,
        tips_pence: 0,
        card_pence: 0,
        cash_pence: 0,
        other_pence: 0,
      },
      by_method: [],
      refunds: [],
      deposits: { deposits_pence: 0, fees_pence: 0 },
      tips: [],
      tills,
      cash_outside: { total_pence: 0, rows: [] },
      orders_waiting: 0,
      open_sessions: 0,
    },
    legacy_cash_till_id: null,
    currency: 'GBP',
    timezone: 'Europe/London',
    can: { manage_settings: true },
  };
}

describe('End of day tills', () => {
  it('says when each session was open, and reads the balance inside the sentence', async () => {
    mockEod = eod([
      session({}),
      session({
        session_id: 's2',
        opened_at: '2026-10-11T10:40:00Z',
        closed_at: '2026-10-11T10:41:00Z',
        expected_cash_pence: 5000,
        counted_cash_pence: 5000,
        variance_pence: 0,
        variance_reason: null,
      }),
      session({ session_id: 's3', status: 'open', opened_at: '2026-10-11T11:13:00Z', closed_at: null, counted_cash_pence: null }),
    ]);
    await render(<EndOfDayScreen />);

    expect(screen.getByText('11:26 to 11:36')).toBeTruthy();
    expect(screen.getByText('Counted £70.00, expected £82.00, £12.00 short')).toBeTruthy();
    expect(screen.getByText('11:40 to 11:41')).toBeTruthy();
    expect(screen.getByText('Counted £50.00, expected £50.00, it balances')).toBeTruthy();
    expect(screen.getByText('Open since 12:13')).toBeTruthy();
  });
});
