/**
 * Regression cover for the 2026-08-16 crash loop.
 *
 * A notification tap must be routed by a component INSIDE the navigator, and
 * exactly once no matter how many times that component (or the provider tree
 * above it) remounts. jest hoists mock factories above imports, so variables a
 * factory closes over are prefixed `mock*`.
 */
import { act, render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { PendingPushRouteHandler } from '@/components/push/PendingPushRouteHandler';
import {
  resetPendingBookingRoute,
  setPendingBookingRoute,
} from '@/lib/push/pendingNotificationRoute';

describe('PendingPushRouteHandler', () => {
  beforeEach(() => {
    mockPush.mockClear();
    resetPendingBookingRoute();
  });

  it('routes a tap parked before it mounted (the cold-start case)', async () => {
    setPendingBookingRoute('booking-1');

    await act(async () => {
      render(<PendingPushRouteHandler />);
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/booking/booking-1');
  });

  it('routes a tap that arrives while it is mounted', async () => {
    await act(async () => {
      render(<PendingPushRouteHandler />);
    });
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      setPendingBookingRoute('booking-2');
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/booking/booking-2');
  });

  it('does not route anything when no tap is parked', async () => {
    await act(async () => {
      render(<PendingPushRouteHandler />);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('never re-routes the same tap, however many handlers mount after it', async () => {
    setPendingBookingRoute('booking-3');

    await act(async () => {
      render(<PendingPushRouteHandler />);
    });
    expect(mockPush).toHaveBeenCalledTimes(1);

    // This is the loop: every remount of the tree used to re-read the launch
    // response and navigate again, which remounted the tree, which navigated…
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        render(<PendingPushRouteHandler />);
      });
    }

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('routes once even when two handlers are mounted at the same time', async () => {
    setPendingBookingRoute('booking-4');

    await act(async () => {
      render(
        <>
          <PendingPushRouteHandler />
          <PendingPushRouteHandler />
        </>,
      );
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
