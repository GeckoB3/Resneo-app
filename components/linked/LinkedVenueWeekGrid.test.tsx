/**
 * LinkedVenueWeekGrid — a partner's merged week. The heading names the
 * calendar when the partner shares one (web parity with the day column:
 * "Jenny", not "light2") and the venue over several; the header's New booking
 * button is withheld for a partner inside the caller's collective, whose
 * bookings go through the calendar tab's Plus button instead.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { LinkedVenueWeekGrid } from '@/components/linked/LinkedVenueWeekGrid';
import type { LinkedPractitioner, LinkedVenueCalendar } from '@/types/linked-venues';

const WEEK = [
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
];

function practitioner(overrides: Partial<LinkedPractitioner> = {}): LinkedPractitioner {
  return { id: 'p1', name: 'Jenny', isActive: true, ...overrides };
}

function venue(overrides: Partial<LinkedVenueCalendar> = {}): LinkedVenueCalendar {
  return {
    venueId: 'v1',
    venueName: 'light2',
    linkId: 'l1',
    visibility: 'full_details',
    action: 'create_edit_cancel',
    pii: true,
    practitioners: [practitioner()],
    services: [],
    resources: [],
    bookings: [],
    ...overrides,
  };
}

async function renderWeek(v: LinkedVenueCalendar, showCreateButton?: boolean): Promise<void> {
  await render(
    <LinkedVenueWeekGrid
      venue={v}
      weekDays={WEEK}
      today={WEEK[0]!}
      nowMinutes={null}
      onOpenBooking={jest.fn()}
      onCreate={jest.fn()}
      onDayPress={jest.fn()}
      showCreateButton={showCreateButton}
    />,
  );
}

describe('LinkedVenueWeekGrid', () => {
  it("heads a single shared calendar with the calendar's name, the venue under it", async () => {
    await renderWeek(venue());
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(screen.getByText('light2')).toBeTruthy();
  });

  it('keeps the venue name over several calendars and lists them', async () => {
    await renderWeek(venue({ practitioners: [practitioner(), practitioner({ id: 'p2', name: 'Sam' })] }));
    expect(screen.getByText('light2')).toBeTruthy();
    expect(screen.getByText('Jenny, Sam')).toBeTruthy();
  });

  it('shows the header New booking button by default', async () => {
    await renderWeek(venue());
    expect(screen.getByText('New booking')).toBeTruthy();
  });

  it('withholds the header button when told to (a partner inside the collective)', async () => {
    await renderWeek(venue(), false);
    expect(screen.queryByText('New booking')).toBeNull();
  });
});
