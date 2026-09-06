/**
 * LinkedVenueCalendarGrid — a partner's day is one column per calendar it
 * shares, headed with the calendar's name (web parity: "Jenny", not "light2";
 * the venue is named in the card header instead), on the shared multi-calendar
 * grid. This is the view a phone reaches through the partner's chip on the
 * calendar tab, and the linked calendar screen stacks one per partner.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('react-native-gesture-handler', () => {
  const ReactLib = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const chainable = (): Record<string, () => unknown> =>
    new Proxy({}, { get: () => () => chainable() }) as Record<string, () => unknown>;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(View, null, children),
    Gesture: new Proxy({}, { get: () => () => chainable() }),
  };
});

import { LinkedVenueCalendarGrid } from '@/components/linked/LinkedVenueCalendarGrid';
import type {
  LinkedBooking,
  LinkedPractitioner,
  LinkedVenueCalendar,
} from '@/types/linked-venues';

const DATE = '2026-06-15';
// The date's local weekday, so the working-hours lookup is locale-proof.
const WEEKDAY = String(new Date(2026, 5, 15).getDay());
const HOURS = { [WEEKDAY]: [{ start: '09:00', end: '17:00' }] };

function booking(overrides: Partial<LinkedBooking> = {}): LinkedBooking {
  return {
    id: 'b1',
    practitionerId: 'p1',
    bookingDate: DATE,
    bookingTime: '10:00:00',
    bookingEndTime: '10:30:00',
    status: 'Booked',
    guestName: 'Ada Lovelace',
    serviceName: 'Cut & Finish',
    editable: true,
    ...overrides,
  };
}

function practitioner(overrides: Partial<LinkedPractitioner> = {}): LinkedPractitioner {
  return { id: 'p1', name: 'Jenny', isActive: true, workingHours: HOURS, ...overrides };
}

function venue(overrides: Partial<LinkedVenueCalendar> = {}): LinkedVenueCalendar {
  return {
    venueId: 'v1',
    venueName: 'light2',
    linkId: 'l1',
    visibility: 'full_details',
    action: 'edit_existing',
    pii: true,
    practitioners: [practitioner()],
    services: [],
    resources: [],
    bookings: [booking()],
    ...overrides,
  };
}

async function renderGrid(
  v: LinkedVenueCalendar,
  onCreate: (time?: string, practitionerId?: string) => void = jest.fn(),
  showCreateButton?: boolean,
): Promise<void> {
  await render(
    <LinkedVenueCalendarGrid
      embedded
      venue={v}
      date={DATE}
      nowMinutes={null}
      onOpenBooking={jest.fn()}
      onCreate={onCreate}
      showCreateButton={showCreateButton}
    />,
  );
}

/** Tap a column's empty-slot layer a little way down the day. */
async function tapEmptySlot(calendarName: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(`Tap an empty slot to add a booking for ${calendarName}`), {
      nativeEvent: { locationY: 120 },
    });
  });
}

describe('LinkedVenueCalendarGrid', () => {
  it("names the calendar in the card header, the venue under it, with no column header over a single column", async () => {
    await renderGrid(venue());
    // The card header names the calendar; the venue is its caption.
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(screen.getAllByText('light2')).toHaveLength(1);
    // No column-header row: the own single-calendar view has none either.
    expect(screen.queryByTestId('column-headers')).toBeNull();
    // The bar keeps the bare service: the header already names the practitioner.
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText(/Cut & Finish · Jenny/)).toBeNull();
  });

  it('draws one headed column per calendar the partner shares, the venue in the card header', async () => {
    await renderGrid(
      venue({
        practitioners: [practitioner(), practitioner({ id: 'p2', name: 'Sam' })],
        bookings: [booking(), booking({ id: 'b2', practitionerId: 'p2', guestName: 'Grace' })],
      }),
    );
    expect(screen.getByTestId('column-headers')).toBeTruthy();
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('light2')).toBeTruthy();
  });

  it('adds a venue-level column only for a booking that names no listed calendar', async () => {
    await renderGrid(venue({ bookings: [booking(), booking({ id: 'b2', practitionerId: null })] }));
    expect(screen.getByText('Jenny')).toBeTruthy();
    // The card header plus the venue-level column.
    expect(screen.getAllByText('light2')).toHaveLength(2);
  });

  it("carries the tapped column's calendar into the new booking, and none from the venue column", async () => {
    const onCreate = jest.fn();
    await renderGrid(
      venue({
        action: 'create_edit_cancel',
        bookings: [booking(), booking({ id: 'b2', practitionerId: null })],
      }),
      onCreate,
    );
    await tapEmptySlot('Jenny');
    expect(onCreate).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/), 'p1');
    await tapEmptySlot('light2');
    expect(onCreate).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/), undefined);
  });

  it('shows the header New booking button for a partner that books for itself', async () => {
    await renderGrid(venue({ action: 'create_edit_cancel' }));
    expect(screen.getByText('New booking')).toBeTruthy();
  });

  it('withholds the header button when told to, keeping the empty-slot tap', async () => {
    // A partner inside the caller's collective: the tab's Plus button books for
    // the collective instead, so the header button would only duplicate it.
    const onCreate = jest.fn();
    await renderGrid(venue({ action: 'create_edit_cancel' }), onCreate, false);
    expect(screen.queryByText('New booking')).toBeNull();
    await tapEmptySlot('Jenny');
    expect(onCreate).toHaveBeenCalledWith(expect.any(String), 'p1');
  });

  it('ignores an empty-slot tap when the grant does not allow creating', async () => {
    const onCreate = jest.fn();
    await renderGrid(venue({ action: 'edit_existing' }), onCreate);
    await tapEmptySlot('Jenny');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('keeps the per-calendar columns on a time-only link, as busy blocks', async () => {
    await renderGrid(venue({ visibility: 'time_only', action: 'none' }));
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(screen.getByText('light2 — busy')).toBeTruthy();
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
  });
});

describe('LinkedVenueCalendarGrid — an edit grant joins the interactive grid', () => {
  const RESIZE_HANDLE = 'Touch and hold the bottom edge to change duration';

  async function renderInteractive(
    v: LinkedVenueCalendar,
    extra: { onCreateRefused?: () => void } = {},
  ): Promise<void> {
    await render(
      <LinkedVenueCalendarGrid
        embedded
        venue={v}
        date={DATE}
        nowMinutes={null}
        onOpenBooking={jest.fn()}
        onCreate={jest.fn()}
        onDragReschedule={jest.fn()}
        onDragResize={jest.fn()}
        onStatusChange={jest.fn()}
        onArrivalToggle={jest.fn()}
        onCreateRefused={extra.onCreateRefused}
      />,
    );
  }

  it('gives an edit-existing link the same draggable bar as an own column', async () => {
    await renderInteractive(venue({ action: 'edit_existing' }));
    // The interactive bar may fold the service into the name's line.
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.getByLabelText(RESIZE_HANDLE)).toBeTruthy();
  });

  it('gives a create-edit-cancel link the same', async () => {
    await renderInteractive(venue({ action: 'create_edit_cancel' }));
    expect(screen.getByLabelText(RESIZE_HANDLE)).toBeTruthy();
  });

  it('keeps a view-only link static, even when handed the gestures', async () => {
    await renderInteractive(venue({ action: 'none' }));
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.queryByLabelText(RESIZE_HANDLE)).toBeNull();
  });

  it('says why an empty slot cannot be booked on an edit-existing link', async () => {
    const onCreateRefused = jest.fn();
    await renderInteractive(venue({ action: 'edit_existing' }), { onCreateRefused });
    await tapEmptySlot('Jenny');
    expect(onCreateRefused).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on an empty slot of a view-only link', async () => {
    const onCreateRefused = jest.fn();
    await renderInteractive(venue({ action: 'none' }), { onCreateRefused });
    await tapEmptySlot('Jenny');
    expect(onCreateRefused).not.toHaveBeenCalled();
  });
});
