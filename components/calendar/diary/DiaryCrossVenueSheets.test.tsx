import { fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import {
  DiaryCrossVenueSheets,
  type CrossVenueMoveState,
  type DiaryCrossVenueSheetsProps,
} from '@/components/calendar/diary/DiaryCrossVenueSheets';
import { cancelOriginalCopy, collectiveMoveCopy, crossVenueMoveCopy } from '@/lib/calendar/cross-venue-rebook';
import type { CalendarGridBooking } from '@/types/calendar-grid';

const move: CrossVenueMoveState = {
  guestName: 'Sam',
  sourceCalendarName: 'Alex',
  sourceVenueName: null,
  targetCalendarName: 'Jo',
  targetVenueName: 'Partner Studio',
  booking: { id: 'b1', group_booking_id: null } as unknown as CalendarGridBooking,
  sourceVenue: null,
  sourceLinked: null,
  targetColumnId: 'col-1',
  targetLinked: null,
  time: '10:00',
  collectiveMove: null,
};

function props(extra: Partial<DiaryCrossVenueSheetsProps> = {}): DiaryCrossVenueSheetsProps {
  return {
    crossVenueMove: null,
    venue: null,
    moveToVenue: { isPending: false },
    confirmCollectiveMove: jest.fn(),
    setCrossVenueMove: jest.fn(),
    startCrossVenueRebook: jest.fn(() => Promise.resolve()),
    cancelOriginalPrompt: null,
    cancelOwnOriginal: { isPending: false },
    cancelLinkedOriginal: { isPending: false },
    cancelOriginalAfterRebook: jest.fn(),
    setCancelOriginalPrompt: jest.fn(),
    ...extra,
  };
}

describe('DiaryCrossVenueSheets', () => {
  it('shows nothing with no move in hand', async () => {
    await render(<DiaryCrossVenueSheets {...props()} />);
    expect(screen.queryByText('Not now')).toBeNull();
    expect(screen.queryByText('Keep both')).toBeNull();
  });

  it('offers to book afresh on another account', async () => {
    const p = props({ crossVenueMove: move });
    await render(<DiaryCrossVenueSheets {...p} />);
    const copy = crossVenueMoveCopy(move);
    expect(screen.getByText(copy.title)).toBeTruthy();
    await fireEvent.press(screen.getByText(copy.confirmLabel));
    expect(p.startCrossVenueRebook).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Not now'));
    expect(p.setCrossVenueMove).toHaveBeenCalledWith(null);
  });

  it('moves within the collective in one step', async () => {
    const collective = { ...move, collectiveMove: { targetCalendarId: 'cal-9', targetVenueName: 'Partner Studio' } };
    const p = props({ crossVenueMove: collective });
    await render(<DiaryCrossVenueSheets {...p} />);
    const copy = collectiveMoveCopy({
      targetCalendarName: 'Jo',
      targetVenueName: 'Partner Studio',
      ownVenueName: 'your business',
      time: '10:00',
      visitServiceName: null,
    });
    await fireEvent.press(screen.getByText(copy.confirmLabel));
    expect(p.confirmCollectiveMove).toHaveBeenCalled();
  });

  it('offers to cancel the original once the new booking is made', async () => {
    const prompt = {
      originalBookingId: 'b1',
      originalOwnerVenueId: null,
      guestName: 'Sam',
      originalLabel: 'Alex at 10:00',
      targetLabel: 'Jo at 10:00',
      created: true,
    };
    const p = props({ cancelOriginalPrompt: prompt });
    await render(<DiaryCrossVenueSheets {...p} />);
    expect(screen.getByText(cancelOriginalCopy(prompt).title)).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel the original'));
    expect(p.cancelOriginalAfterRebook).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep both'));
    expect(p.setCancelOriginalPrompt).toHaveBeenCalledWith(null);
  });
});
