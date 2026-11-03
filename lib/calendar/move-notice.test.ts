import { joinsPendingMoveNotice, mergeMoveNotice, type MoveNoticeInput } from '@/lib/calendar/move-notice';

type Prev = { time: string; calendar: string };

function notice(over: Partial<MoveNoticeInput<Prev>> & { bookingId: string }): MoveNoticeInput<Prev> {
  return {
    guestName: 'Sam',
    previous: { time: '10:00', calendar: 'aisha' },
    startMoved: true,
    reassigned: false,
    lengthChanged: false,
    visitKey: 'visit-1',
    ...over,
  };
}

describe('the notify prompt is keyed by visit (split-visit plan G7)', () => {
  it('starts a prompt of its own when none is pending', () => {
    const first = mergeMoveNotice(null, notice({ bookingId: 'cut' }));
    expect(first.changes.map((c) => c.bookingId)).toEqual(['cut']);
  });

  it('joins a second move of another service of the same visit to the pending prompt', () => {
    const first = mergeMoveNotice(null, notice({ bookingId: 'cut', previous: { time: '10:00', calendar: 'aisha' } }));
    const second = mergeMoveNotice(
      first,
      notice({ bookingId: 'mani', previous: { time: '10:45', calendar: 'steph' }, startMoved: false, reassigned: true }),
    );
    // One prompt: Notify is offered once, against the latest service, and Undo covers both.
    expect(second.bookingId).toBe('mani');
    expect(second.startMoved).toBe(true);
    expect(second.reassigned).toBe(true);
    expect(second.changes).toEqual([
      { bookingId: 'cut', previous: { time: '10:00', calendar: 'aisha' }, lengthChanged: false },
      { bookingId: 'mani', previous: { time: '10:45', calendar: 'steph' }, lengthChanged: false },
    ]);
  });

  it('keeps where a service was before its FIRST change when it moves twice', () => {
    const first = mergeMoveNotice(null, notice({ bookingId: 'cut', previous: { time: '10:00', calendar: 'aisha' } }));
    const again = mergeMoveNotice(
      first,
      notice({ bookingId: 'cut', previous: { time: '11:00', calendar: 'aisha' }, lengthChanged: true }),
    );
    expect(again.changes).toEqual([
      { bookingId: 'cut', previous: { time: '10:00', calendar: 'aisha' }, lengthChanged: true },
    ]);
  });

  it('gives another visit, or an ordinary booking, a prompt of its own', () => {
    const first = mergeMoveNotice(null, notice({ bookingId: 'cut' }));
    expect(joinsPendingMoveNotice(first, { visitKey: 'visit-2' })).toBe(false);
    expect(mergeMoveNotice(first, notice({ bookingId: 'other', visitKey: 'visit-2' })).changes).toHaveLength(1);
    expect(joinsPendingMoveNotice(first, { visitKey: null })).toBe(false);
    const single = mergeMoveNotice(null, notice({ bookingId: 'a', visitKey: null }));
    expect(joinsPendingMoveNotice(single, { visitKey: null })).toBe(false);
  });
});
