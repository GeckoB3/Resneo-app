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

import type { RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { DiaryMoveNoticeSheet } from '@/components/calendar/diary/DiaryMoveNoticeSheet';
import type { MoveNotice } from '@/lib/calendar/move-notice';

const previous: RescheduleTarget = { id: 'b1', guestName: 'Sam', date: '2026-11-27', time: '10:00' };

function notice(extra: Partial<MoveNotice<RescheduleTarget>> = {}): MoveNotice<RescheduleTarget> {
  return {
    bookingId: 'b1',
    guestName: 'Sam',
    visitKey: null,
    previous,
    startMoved: true,
    reassigned: false,
    lengthChanged: false,
    changes: [{ bookingId: 'b1', previous, lengthChanged: false }],
    ...extra,
  };
}

function handlers() {
  return { closeMoveNotice: jest.fn(), handleNotifyMove: jest.fn(), handleUndoMove: jest.fn() };
}

describe('DiaryMoveNoticeSheet', () => {
  it('asks to notify the client after a move', async () => {
    const h = handlers();
    await render(<DiaryMoveNoticeSheet moveNotice={notice()} {...h} />);
    expect(screen.getByText('Booking moved')).toBeTruthy();
    expect(screen.getByText('Let Sam know about the change?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Notify Sam'));
    expect(h.handleNotifyMove).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Don't notify"));
    expect(h.closeMoveNotice).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Undo change'));
    expect(h.handleUndoMove).toHaveBeenCalled();
  });

  it('offers only Undo and Done when the start did not move', async () => {
    const h = handlers();
    await render(<DiaryMoveNoticeSheet moveNotice={notice({ startMoved: false, reassigned: true })} {...h} />);
    expect(screen.getByText('The start time has not changed, so Sam has not been told.')).toBeTruthy();
    expect(screen.queryByText('Notify Sam')).toBeNull();
    await fireEvent.press(screen.getByText('Done'));
    expect(h.closeMoveNotice).toHaveBeenCalled();
  });

  it('shows the overlap note', async () => {
    await render(<DiaryMoveNoticeSheet moveNotice={notice({ overlapNote: 'Overlaps Jo.' })} {...handlers()} />);
    expect(screen.getByText('Overlaps Jo.')).toBeTruthy();
  });

  it('is closed with no notice', async () => {
    await render(<DiaryMoveNoticeSheet moveNotice={null} {...handlers()} />);
    expect(screen.queryByText('Undo change')).toBeNull();
  });
});
