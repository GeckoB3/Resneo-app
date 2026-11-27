import { act, renderHook } from '@testing-library/react-native';

import type { RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import type { MoveNoticeInput } from '@/lib/calendar/move-notice';
import { useDiaryMoveNotice, type DiaryMoveNoticeInput } from '@/lib/calendar/diary/useDiaryMoveNotice';

const mockNotifyMutate = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useNotifyBookingModification: () => ({ mutate: mockNotifyMutate }),
}));

function setup() {
  const input = {
    rescheduleById: { mutate: jest.fn() },
    visitScheduleById: { mutate: jest.fn() },
    toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() },
  };
  return { input, useHook: () => useDiaryMoveNotice(input as unknown as DiaryMoveNoticeInput) };
}

const previous: RescheduleTarget = {
  id: 'b1',
  guestName: 'Sam',
  date: '2026-11-27',
  time: '10:00:00',
  durationMinutes: 45,
};

function notice(extra: Partial<MoveNoticeInput<RescheduleTarget>> = {}): MoveNoticeInput<RescheduleTarget> {
  return {
    bookingId: 'b1',
    guestName: 'Sam',
    visitKey: null,
    previous,
    startMoved: true,
    reassigned: false,
    lengthChanged: false,
    ...extra,
  };
}

describe('useDiaryMoveNotice', () => {
  beforeEach(() => mockNotifyMutate.mockReset());

  it('opens the notify prompt after a move', async () => {
    const { useHook } = setup();
    const { result } = await renderHook(useHook);
    expect(result.current.moveNotice).toBeNull();
    await act(async () => result.current.raiseChangeNotice(notice()));
    expect(result.current.moveNotice?.guestName).toBe('Sam');
    expect(result.current.moveNotice?.changes).toHaveLength(1);
  });

  it('gives a pure resize a toast with Undo, not the prompt', async () => {
    const { useHook, input } = setup();
    const { result } = await renderHook(useHook);
    await act(async () => result.current.raiseChangeNotice(notice({ startMoved: false, lengthChanged: true })));
    expect(result.current.moveNotice).toBeNull();
    expect(input.toast.success).toHaveBeenCalledTimes(1);
    const [, options] = input.toast.success.mock.calls[0];
    expect(options.actionLabel).toBe('Undo');
    options.onAction();
    expect(input.rescheduleById.mutate).toHaveBeenCalledWith({
      bookingId: 'b1',
      date: '2026-11-27',
      time: '10:00:00',
      endTime: '10:45:00',
      skipGuestNotification: true,
    });
  });

  it('notifies the client and closes the prompt', async () => {
    const { useHook } = setup();
    const { result } = await renderHook(useHook);
    await act(async () => result.current.raiseChangeNotice(notice()));
    await act(async () => result.current.handleNotifyMove());
    expect(mockNotifyMutate).toHaveBeenCalledWith({ bookingId: 'b1' }, expect.any(Object));
    expect(result.current.moveNotice).toBeNull();
  });

  it('undoes a move back to its column and closes the prompt', async () => {
    const { useHook, input } = setup();
    const { result } = await renderHook(useHook);
    await act(async () =>
      result.current.raiseChangeNotice(notice({ previous: { ...previous, practitionerId: 'cal-1' } })),
    );
    await act(async () => result.current.handleUndoMove());
    expect(input.rescheduleById.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', practitionerId: 'cal-1', skipGuestNotification: true }),
    );
    expect(result.current.moveNotice).toBeNull();
  });

  it('closes without sending anything', async () => {
    const { useHook, input } = setup();
    const { result } = await renderHook(useHook);
    await act(async () => result.current.raiseChangeNotice(notice()));
    await act(async () => result.current.closeMoveNotice());
    expect(result.current.moveNotice).toBeNull();
    expect(mockNotifyMutate).not.toHaveBeenCalled();
    expect(input.rescheduleById.mutate).not.toHaveBeenCalled();
  });
});
