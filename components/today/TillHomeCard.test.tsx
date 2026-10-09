/**
 * The Today "Till" card: web parity with the dashboard home's TillHomeCard. Shown only with POS on
 * and the venue counting cash in till sessions; one line per active till (or one with a session
 * still open); a till left open from an earlier day is called out, and the link says "Close the
 * till" then.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { homeTills, TillHomeCard, tillOpenedDate } from './TillHomeCard';
import type { PosTillSessionsResponse, PosTillState } from '@/types/pos';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'client' } }),
}));

let mockPosOn = true;
let mockData: PosTillSessionsResponse | undefined;
const mockUseTillSessions = jest.fn();
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => mockPosOn }));
jest.mock('@/lib/queries/useTill', () => ({
  useTillSessions: (opts: unknown) => {
    mockUseTillSessions(opts);
    return { data: mockData };
  },
}));

function till(id: string, name: string, over: Partial<PosTillState> = {}): PosTillState {
  return { id, name, is_active: true, session: null, last_float_left_pence: null, ...over };
}

function session(business_date: string, opened_at: string): PosTillState['session'] {
  return {
    id: `s-${business_date}`,
    till_id: 't',
    status: 'open',
    business_date,
    opened_at,
    opened_by_name: null,
    opening_float_pence: 10000,
    closed_at: null,
    closed_by_name: null,
    count_attempts: 0,
  } as PosTillState['session'];
}

function payload(tills: PosTillState[], cashOn = true): PosTillSessionsResponse {
  return {
    cash: {
      enabled: cashOn,
      blind_close: false,
      variance_reason_threshold_pence: 0,
      default_float_pence: 10000,
      legacy_cash_till_id: null,
    },
    tills,
    today: '2026-10-09',
    timezone: 'Europe/London',
    currency: 'GBP',
    can: { open_close_till: true, paid_in_out: true, see_expected_cash: true, end_of_day: true, manage_settings: true },
  };
}

beforeEach(() => {
  mockPosOn = true;
  mockData = undefined;
  mockPush.mockClear();
  mockUseTillSessions.mockClear();
});

describe('TillHomeCard', () => {
  it('asks nothing and shows nothing with POS off', async () => {
    mockPosOn = false;
    mockData = payload([till('t1', 'Front desk')]);
    await render(<TillHomeCard />);
    expect(screen.queryByText('Till')).toBeNull();
    expect(mockUseTillSessions).toHaveBeenCalledWith({ enabled: false });
  });

  it('hides while the venue does not count cash in till sessions', async () => {
    mockData = payload([till('t1', 'Front desk')], false);
    await render(<TillHomeCard />);
    expect(screen.queryByText('Till')).toBeNull();
  });

  it('hides when it has not loaded', async () => {
    await render(<TillHomeCard />);
    expect(screen.queryByText('Till')).toBeNull();
  });

  it('lists a closed till and an open one, and opens Checkout', async () => {
    mockData = payload([
      till('t1', 'Front desk'),
      till('t2', 'Back bar', { session: session('2026-10-09', '2026-10-09T08:05:00Z') }),
    ]);
    await render(<TillHomeCard />);
    expect(screen.getByText('Till')).toBeTruthy();
    expect(screen.getByText('Front desk is closed. Open it before you take cash.')).toBeTruthy();
    expect(screen.getByText('Back bar is open, since 09:05.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open Checkout →'));
    expect(mockPush).toHaveBeenCalledWith('/checkout/till');
  });

  it('calls out a till left open from an earlier day and offers to close it', async () => {
    mockData = payload([till('t1', 'Front desk', { session: session('2026-10-05', '2026-10-05T08:00:00Z') })]);
    await render(<TillHomeCard />);
    expect(
      screen.getByText('Front desk has been open since Monday 5 October. Close it to count the cash.'),
    ).toBeTruthy();
    expect(screen.getByText('Close the till →')).toBeTruthy();
  });

  it('leaves out inactive tills with no session', async () => {
    mockData = payload([till('t1', 'Old till', { is_active: false })]);
    await render(<TillHomeCard />);
    expect(screen.queryByText('Till')).toBeNull();
  });
});

describe('homeTills', () => {
  it('keeps active tills and inactive ones still open', () => {
    const open = till('t3', 'Spare', { is_active: false, session: session('2026-10-09', '2026-10-09T08:00:00Z') });
    const ids = homeTills({ tills: [till('t1', 'A'), till('t2', 'B', { is_active: false }), open] }).map((x) => x.id);
    expect(ids).toEqual(['t1', 't3']);
  });
});

describe('tillOpenedDate', () => {
  it('reads the day in the venue time zone', () => {
    expect(tillOpenedDate('2026-10-05T23:30:00Z', 'Europe/London')).toBe('Tuesday 6 October');
    expect(tillOpenedDate(null, 'Europe/London')).toBe('');
    expect(tillOpenedDate('not a date', 'Europe/London')).toBe('');
  });
});
