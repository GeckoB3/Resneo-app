/**
 * The one-shot hand-off that replaced "PushNotificationsProvider navigates".
 * The single property everything else rests on: a parked tap can be taken ONCE.
 * See pendingNotificationRoute.ts for the crash loop that made it necessary.
 */
import {
  resetPendingBookingRoute,
  setPendingBookingRoute,
  subscribePendingBookingRoute,
  takePendingBookingRoute,
} from '@/lib/push/pendingNotificationRoute';

describe('pendingNotificationRoute', () => {
  beforeEach(() => {
    resetPendingBookingRoute();
  });

  it('returns null when nothing is parked', () => {
    expect(takePendingBookingRoute()).toBeNull();
  });

  it('hands a parked booking id to the first taker and no one else', () => {
    setPendingBookingRoute('booking-1');

    expect(takePendingBookingRoute()).toBe('booking-1');
    // The loop regression: a second consumer (a remounted handler) gets nothing.
    expect(takePendingBookingRoute()).toBeNull();
    expect(takePendingBookingRoute()).toBeNull();
  });

  it('notifies subscribers when a tap is parked', () => {
    const notify = jest.fn();
    const unsubscribe = subscribePendingBookingRoute(notify);

    setPendingBookingRoute('booking-2');
    expect(notify).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPendingBookingRoute('booking-3');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('survives a subscriber unsubscribing while being notified', () => {
    const notify = jest.fn(() => unsubscribe());
    const unsubscribe = subscribePendingBookingRoute(notify);

    expect(() => setPendingBookingRoute('booking-4')).not.toThrow();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps only the most recent tap', () => {
    setPendingBookingRoute('booking-5');
    setPendingBookingRoute('booking-6');

    expect(takePendingBookingRoute()).toBe('booking-6');
    expect(takePendingBookingRoute()).toBeNull();
  });
});
