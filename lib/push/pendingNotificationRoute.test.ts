/**
 * The one-shot hand-off that replaced "PushNotificationsProvider navigates".
 * The single property everything else rests on: a parked tap can be taken ONCE.
 * See pendingNotificationRoute.ts for the crash loop that made it necessary.
 */
import {
  resetPendingPushRoute,
  setPendingPushRoute,
  subscribePendingPushRoute,
  takePendingPushRoute,
} from '@/lib/push/pendingNotificationRoute';

describe('pendingNotificationRoute', () => {
  beforeEach(() => {
    resetPendingPushRoute();
  });

  it('returns null when nothing is parked', () => {
    expect(takePendingPushRoute()).toBeNull();
  });

  it('hands a parked booking id to the first taker and no one else', () => {
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-1' });

    expect(takePendingPushRoute()).toEqual({ kind: 'booking', bookingId: 'booking-1' });
    // The loop regression: a second consumer (a remounted handler) gets nothing.
    expect(takePendingPushRoute()).toBeNull();
    expect(takePendingPushRoute()).toBeNull();
  });

  it('notifies subscribers when a tap is parked', () => {
    const notify = jest.fn();
    const unsubscribe = subscribePendingPushRoute(notify);

    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-2' });
    expect(notify).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-3' });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('survives a subscriber unsubscribing while being notified', () => {
    const notify = jest.fn(() => unsubscribe());
    const unsubscribe = subscribePendingPushRoute(notify);

    expect(() => setPendingPushRoute({ kind: 'booking', bookingId: 'booking-4' })).not.toThrow();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps only the most recent tap', () => {
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-5' });
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-6' });

    expect(takePendingPushRoute()).toEqual({ kind: 'booking', bookingId: 'booking-6' });
    expect(takePendingPushRoute()).toBeNull();
  });
});
