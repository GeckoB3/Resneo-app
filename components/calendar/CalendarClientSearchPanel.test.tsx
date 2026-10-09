import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

type QueryState = {
  data?: unknown;
  isFetching?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
};

let mockGuests: QueryState = {};
const mockUseGuests = jest.fn();
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: (...args: unknown[]) => {
    mockUseGuests(...args);
    return mockGuests;
  },
}));

let mockDetail: QueryState = {};
const mockUseGuestDetail = jest.fn();
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: (...args: unknown[]) => {
    mockUseGuestDetail(...args);
    return mockDetail;
  },
}));

import { CalendarClientSearchPanel } from '@/components/calendar/CalendarClientSearchPanel';
import { ApiError } from '@/lib/api/client';

const ADA = {
  id: 'g1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  tags: [],
  visit_count: 3,
  no_show_count: 0,
  last_visit_date: null,
  next_booking_date: null,
  next_booking_time: null,
  total_bookings: 3,
  upcoming_booking_count: 1,
};

function historyRow(id: string, date: string, status = 'Confirmed') {
  return {
    id,
    booking_date: date,
    booking_time: '10:00:00',
    party_size: 1,
    status,
    deposit_status: null,
    deposit_amount_pence: null,
    booking_model: 'unified_scheduling',
    kind_label: 'Appointment',
    detail_label: 'Cut and finish',
    practitioner_name: 'Sam',
    service_name: 'Cut and finish',
    area_name: null,
    calendar_id: 'cal-1',
    practitioner_id: 'cal-1',
  };
}

async function renderPanel(overrides: Partial<React.ComponentProps<typeof CalendarClientSearchPanel>> = {}) {
  const props = {
    clientWord: 'Client',
    timeZone: 'Europe/London',
    onPickBooking: jest.fn(),
    onBook: jest.fn(),
    onViewContact: jest.fn(),
    ...overrides,
  };
  return { props, view: await render(<CalendarClientSearchPanel {...props} />) };
}

async function typeAndSettle(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Search client'), text);
  await act(async () => {
    jest.advanceTimersByTime(280);
  });
}

describe('CalendarClientSearchPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGuests = {};
    mockDetail = {};
    mockUseGuests.mockClear();
    mockUseGuestDetail.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks for two characters and does not search on one', async () => {
    await renderPanel();
    await typeAndSettle('a');
    expect(screen.getByText('Type at least 2 characters…')).toBeTruthy();
    const lastCall = mockUseGuests.mock.calls.at(-1)!;
    expect(lastCall[1]).toEqual({ enabled: false });
  });

  it('searches 280 ms after typing, with the web query, and lists matches', async () => {
    mockGuests = { data: { guests: [ADA] }, isFetching: false };
    await renderPanel();
    await fireEvent.changeText(screen.getByLabelText('Search client'), 'ada');
    // Before the debounce: still the empty term.
    expect(mockUseGuests.mock.calls.at(-1)![1]).toEqual({ enabled: false });
    await act(async () => {
      jest.advanceTimersByTime(280);
    });
    const [params, options] = mockUseGuests.mock.calls.at(-1)!;
    expect(params).toEqual({ search: 'ada', filter: 'all', sort: 'name_asc', page: 0, limit: 10 });
    expect(options).toEqual({ enabled: true });
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it('says when nothing matches, using the venue word', async () => {
    mockGuests = { data: { guests: [] }, isFetching: false };
    await renderPanel({ clientWord: 'Guest' });
    await fireEvent.changeText(screen.getByLabelText('Search guest'), 'zz');
    await act(async () => {
      jest.advanceTimersByTime(280);
    });
    expect(screen.getByText('No guests match that search.')).toBeTruthy();
  });

  it('shows Searching while a search runs and the server error when it fails', async () => {
    mockGuests = { isFetching: true };
    const { view } = await renderPanel();
    await typeAndSettle('ada');
    expect(screen.getByText('Searching…')).toBeTruthy();

    mockGuests = { isError: true, error: new ApiError('Unauthorised', 401) };
    await view.rerender(
      <CalendarClientSearchPanel
        clientWord="Client"
        timeZone="Europe/London"
        onPickBooking={jest.fn()}
        onBook={jest.fn()}
        onViewContact={jest.fn()}
      />,
    );
    expect(screen.getByText('Unauthorised')).toBeTruthy();
    expect(screen.queryByText('No clients match that search.')).toBeNull();
  });

  it('opens a person on their upcoming and previous bookings and hands a picked one back', async () => {
    mockGuests = { data: { guests: [ADA] }, isFetching: false };
    const future = historyRow('b-future', '2099-01-05');
    const past = historyRow('b-past', '2020-01-05', 'Completed');
    mockDetail = { data: { booking_history: [past, future] }, isLoading: false };
    const { props } = await renderPanel();
    await typeAndSettle('ada');

    await fireEvent.press(screen.getByText('Ada Lovelace'));
    expect(mockUseGuestDetail).toHaveBeenLastCalledWith('g1', { bookingHistoryLimit: 40 });
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Previous')).toBeTruthy();
    expect(screen.getByText('Mon 5 Jan 2099 · 10:00')).toBeTruthy();
    expect(screen.getByText('Sun 5 Jan 2020 · 10:00')).toBeTruthy();

    await fireEvent.press(screen.getByText('Mon 5 Jan 2099 · 10:00'));
    expect(props.onPickBooking).toHaveBeenCalledWith(future);

    await fireEvent.press(screen.getByText('Book'));
    expect(props.onBook).toHaveBeenCalledWith('g1');
    await fireEvent.press(screen.getByText('View'));
    expect(props.onViewContact).toHaveBeenCalledWith('g1');

    await fireEvent.press(screen.getByLabelText('Back to results'));
    expect(screen.getByLabelText('Search client')).toBeTruthy();
  });

  it('says None under an empty group, and Loading while the bookings load', async () => {
    mockGuests = { data: { guests: [ADA] }, isFetching: false };
    mockDetail = { isLoading: true };
    const { view } = await renderPanel();
    await typeAndSettle('ada');
    await fireEvent.press(screen.getByText('Ada Lovelace'));
    expect(screen.getByText('Loading…')).toBeTruthy();

    mockDetail = { data: { booking_history: [] }, isLoading: false };
    await view.rerender(
      <CalendarClientSearchPanel
        clientWord="Client"
        timeZone="Europe/London"
        onPickBooking={jest.fn()}
        onBook={jest.fn()}
        onViewContact={jest.fn()}
      />,
    );
    expect(screen.getAllByText('None')).toHaveLength(2);
  });
});
