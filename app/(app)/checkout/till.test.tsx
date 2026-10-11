/**
 * The till screen keeps the close sheet open on the Z report (UX spec §7.4). Closing the till
 * refreshes the list, so the card turns to "Front desk is closed" at once; the sheet used to sit
 * inside the open card and went with it, so the Z report was never seen.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
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
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: { id: 'venue-1' } }) }));
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosEnabled: () => true,
}));

// The till list behaves like a query the close refreshes: the screen re-renders when it changes.
let mockTills: unknown = null;
const mockListeners = new Set<() => void>();
function mockSetTills(next: unknown) {
  mockTills = next;
  mockListeners.forEach((l) => l());
}
const mockCount = jest.fn();
const mockClose = jest.fn();
jest.mock('@/lib/queries/useTill', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const subscribe = (l: () => void) => {
    mockListeners.add(l);
    return () => mockListeners.delete(l);
  };
  return {
    useTillSessions: () => {
      const data = React.useSyncExternalStore(subscribe, () => mockTills);
      return { data, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() };
    },
    useTillSession: () => ({ data: { movements: [], report: null }, isLoading: false, isError: false, refetch: jest.fn() }),
    useOpenTill: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCountTill: () => ({ mutateAsync: mockCount, isPending: false }),
    useCloseTill: () => ({ mutateAsync: mockClose, isPending: false }),
    useEmailZReport: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useTillMovement: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCashTipsDue: () => ({ data: [], isLoading: false, isError: false }),
    uploadTillReceiptPhoto: jest.fn(),
  };
});

import TillScreen from '@/app/(app)/checkout/till';
import type { PosTillSession, PosTillSessionsResponse } from '@/types/pos';

const SESSION: PosTillSession = {
  id: 's1',
  till_id: 't1',
  status: 'open',
  business_date: '2026-10-11',
  opened_at: '2026-10-11T10:54:00Z',
  opened_by_name: 'Jess',
  opening_float_pence: 5000,
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

function tills(session: PosTillSession | null): PosTillSessionsResponse {
  return {
    cash: { enabled: true, blind_close: true, variance_reason_threshold_pence: 500, default_float_pence: 5000, legacy_cash_till_id: null },
    tills: [{ id: 't1', name: 'Front desk', is_active: true, session, last_float_left_pence: 5000 }],
    today: '2026-10-11',
    timezone: 'Europe/London',
    currency: 'GBP',
    can: { open_close_till: true, paid_in_out: true, see_expected_cash: true, end_of_day: true, manage_settings: true },
  };
}

const Z_REPORT = {
  kind: 'z',
  status: 'closed',
  session_id: 's1',
  till_id: 't1',
  till_name: 'Front desk',
  business_date: '2026-10-11',
  opened_at: '2026-10-11T10:54:00Z',
  opened_by_name: 'Jess',
  as_at: '2026-10-11T11:06:00Z',
  closed_at: '2026-10-11T11:06:00Z',
  closed_by_name: 'Jess',
  sales_count: 1,
  by_method: [],
  taken_pence: 1200,
  refunds: [],
  refunds_pence: 0,
  discounts: { sales: 0, pence: 0 },
  voids: { sales: 0, pence: 0 },
  tips: { card_pence: 0, cash_pence: null, paid_out_pence: 0 },
  cash: null,
  expected_cash_pence: 6200,
  counted_cash_pence: 6200,
  variance_pence: 0,
  cash_to_bank_pence: 1200,
  float_left_pence: 5000,
};

beforeEach(() => {
  mockCount.mockReset();
  mockClose.mockReset();
  mockSetTills(tills(SESSION));
});

describe('closing the till from the till screen', () => {
  it('stays on the Z report after the till closes, until it is dismissed', async () => {
    mockCount.mockResolvedValue({
      counted_cash_pence: 6200,
      variance_pence: 0,
      needs_reason: false,
      threshold_pence: 500,
      count_attempts: 1,
      can_recount: true,
    });
    mockClose.mockImplementation(async () => {
      // The close refreshes the list before the sheet hears back, as the real query does.
      mockSetTills(tills(null));
      return { session: { ...SESSION, status: 'closed' }, movements: [], report: Z_REPORT };
    });
    await render(<TillScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Close the till'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Total counted'), '62');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    expect(screen.getByText('It balances.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Next'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Close till'));
    });

    expect(mockClose).toHaveBeenCalledWith(expect.objectContaining({ countedPence: 6200, bankPence: 1200, floatPence: 5000 }));
    // The card behind has closed, and the sheet still shows the Z report.
    expect(screen.getByText('Open the till')).toBeTruthy();
    expect(screen.getByText('Front desk is closed.')).toBeTruthy();
    expect(screen.getByText('Z report: Front desk')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Back'));
    });
    expect(screen.queryByText('Z report: Front desk')).toBeNull();
    expect(screen.getByText('Open the till')).toBeTruthy();
  });
});
