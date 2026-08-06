/**
 * LinkedSlotSheet — the slot menu for a LINKED venue's calendar column.
 *
 * The behaviour under test is what resneo#126 fixed on the web: an empty-slot
 * tap on a linked column used to open the booking form straight away, so a
 * walk-in into a linked chair was silently recorded as `source: 'phone'`,
 * misreporting how that client arrived in the owning venue's books. The two
 * actions differ ONLY by the `intent` param, so these assertions are on the
 * pushed params rather than on anything the sheet renders.
 *
 * Also pinned here: the tapped time reaches the form (every linked create path
 * dropped it before), and Block time is absent — blocking an independent
 * venue's diary has no grant in the §5.3 ladder.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { LinkedSlotSheet } from './LinkedSlotSheet';
import type { LinkedVenueCalendar } from '@/types/linked-venues';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// Only the identity fields are read; the rest of the feed is irrelevant here.
const VENUE = {
  venueId: '11111111-2222-3333-4444-555555555555',
  venueName: 'Bramble & Co',
} as LinkedVenueCalendar;

const onClose = jest.fn();

beforeEach(() => {
  mockPush.mockClear();
  onClose.mockClear();
});

/** fireEvent.press fires onPress, but the re-render flushes on a microtask. */
async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

describe('LinkedSlotSheet', () => {
  it('renders nothing without a target', async () => {
    await render(<LinkedSlotSheet target={null} onClose={onClose} />);
    expect(screen.queryByText('Walk-in')).toBeNull();
  });

  it('names the destination venue and the tapped time', async () => {
    await render(
      <LinkedSlotSheet
        target={{ venue: VENUE, date: '2026-08-07', time: '14:30' }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Add at 14:30')).toBeTruthy();
    expect(screen.getByText('In Bramble & Co')).toBeTruthy();
  });

  it('books into the linked venue at the tapped time, with no walk-in intent', async () => {
    await render(
      <LinkedSlotSheet
        target={{ venue: VENUE, date: '2026-08-07', time: '14:30' }}
        onClose={onClose}
      />,
    );
    await press('New booking');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/booking/new',
      params: {
        ownerVenueId: VENUE.venueId,
        ownerVenueName: 'Bramble & Co',
        date: '2026-08-07',
        time: '14:30',
      },
    });
    // No `intent` — the flow defaults to source 'phone'.
    expect(mockPush.mock.calls[0][0].params).not.toHaveProperty('intent');
    expect(onClose).toHaveBeenCalled();
  });

  it('carries intent=walk-in, which the flow maps to source walk-in', async () => {
    await render(
      <LinkedSlotSheet
        target={{ venue: VENUE, date: '2026-08-07', time: '14:30' }}
        onClose={onClose}
      />,
    );
    await press('Walk-in');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/booking/new',
      params: {
        ownerVenueId: VENUE.venueId,
        ownerVenueName: 'Bramble & Co',
        date: '2026-08-07',
        time: '14:30',
        intent: 'walk-in',
      },
    });
  });

  it('omits time when opened from the header button, keeping the date', async () => {
    await render(
      <LinkedSlotSheet target={{ venue: VENUE, date: '2026-08-07' }} onClose={onClose} />,
    );
    expect(screen.getByText('Add to calendar')).toBeTruthy();
    await press('Walk-in');

    const params = mockPush.mock.calls[0][0].params;
    expect(params).not.toHaveProperty('time');
    expect(params.date).toBe('2026-08-07');
    expect(params.intent).toBe('walk-in');
  });

  it('offers no Block time — there is no grant for blocking a linked diary', async () => {
    await render(
      <LinkedSlotSheet
        target={{ venue: VENUE, date: '2026-08-07', time: '09:00' }}
        onClose={onClose}
      />,
    );
    expect(screen.queryByText('Block time')).toBeNull();
  });

  it('closes without navigating on Cancel', async () => {
    await render(
      <LinkedSlotSheet
        target={{ venue: VENUE, date: '2026-08-07', time: '09:00' }}
        onClose={onClose}
      />,
    );
    await press('Cancel');

    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
