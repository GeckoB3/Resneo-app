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
const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canDismiss: () => true, dismissAll: mockDismissAll }),
}));

// A push for another site switches first (web roles plan §6.2c); its own suite is push-site.test.ts.
const mockSwitchSiteForPush = jest.fn(async (_venueId: string | null | undefined) => false);
jest.mock('@/lib/sites/push-site', () => ({
  switchSiteForPush: (venueId: string | null | undefined) => mockSwitchSiteForPush(venueId),
}));

import { PendingPushRouteHandler } from '@/components/push/PendingPushRouteHandler';
import {
  resetPendingPushRoute,
  setPendingPushRoute,
} from '@/lib/push/pendingNotificationRoute';

describe('PendingPushRouteHandler', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockDismissAll.mockClear();
    mockSwitchSiteForPush.mockClear();
    mockSwitchSiteForPush.mockImplementation(async () => false);
    resetPendingPushRoute();
  });

  it('opens a push that names no site straight away, without asking about sites', async () => {
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-0' });
    await act(async () => {
      render(<PendingPushRouteHandler />);
    });
    expect(mockSwitchSiteForPush).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/booking/booking-0');
  });

  it('switches to the booking’s site first, clears the old site’s screens, then opens it', async () => {
    const order: string[] = [];
    mockSwitchSiteForPush.mockImplementation(async (venueId) => {
      order.push(`switch ${String(venueId)}`);
      return true;
    });
    mockDismissAll.mockImplementation(() => order.push('dismiss'));
    mockPush.mockImplementation((href: string) => order.push(`open ${href}`));

    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-9', venueId: 'venue-2' });
    await act(async () => {
      render(<PendingPushRouteHandler />);
    });

    expect(order).toEqual(['switch venue-2', 'dismiss', 'open /booking/booking-9']);
    mockDismissAll.mockReset();
    mockPush.mockReset();
  });

  it('does the same for the till and shop pushes, which name their venue', async () => {
    mockSwitchSiteForPush.mockImplementation(async () => true);
    setPendingPushRoute({ kind: 'posOrder', orderId: 'order-1', venueId: 'venue-3' });
    await act(async () => {
      render(<PendingPushRouteHandler />);
    });
    expect(mockSwitchSiteForPush).toHaveBeenCalledWith('venue-3');
    expect(mockPush).toHaveBeenCalledWith('/orders/order-1?venue=venue-3');
  });

  it('opens a push for the current site without clearing anything', async () => {
    setPendingPushRoute({ kind: 'posTill', sessionId: null, venueId: 'venue-1' });
    await act(async () => {
      render(<PendingPushRouteHandler />);
    });
    expect(mockSwitchSiteForPush).toHaveBeenCalledWith('venue-1');
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/checkout/till?venue=venue-1');
  });

  it('routes a tap parked before it mounted (the cold-start case)', async () => {
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-1' });

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
      setPendingPushRoute({ kind: 'booking', bookingId: 'booking-2' });
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
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-3' });

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
    setPendingPushRoute({ kind: 'booking', bookingId: 'booking-4' });

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
