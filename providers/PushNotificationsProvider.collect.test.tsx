/**
 * A sale sent to this phone while the app is open (owner, 2026-10-10): when the in-app prompt
 * takes the push, the phone's own banner is left out (the sound still plays); when it can't, or the
 * app isn't in front, every notification shows its banner as before.
 */
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState } from 'react-native';

type Behaviour = { shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean };
type Handler = { handleNotification: (n: unknown) => Promise<Behaviour> };

const mockHandlers: Handler[] = [];
const mockOffer = jest.fn((_data: unknown) => false);

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/push/runtime', () => ({ isExpoGoClient: () => false }));
jest.mock('@/lib/push/registerDevice', () => ({
  registerCurrentDeviceForPush: jest.fn().mockResolvedValue({ registered: true }),
  unregisterDevice: jest.fn(),
}));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/lib/queries/useRole', () => ({ useRole: () => 'staff', audienceForRole: () => 'staff' }));
jest.mock('@/lib/push/collect-prompt', () => ({ offerCollectPrompt: (data: unknown) => mockOffer(data) }));
jest.mock('@/lib/push/notificationsModule', () => ({
  Notifications: {
    DEFAULT_ACTION_IDENTIFIER: 'default',
    setNotificationHandler: (h: Handler) => mockHandlers.push(h),
    setNotificationChannelAsync: jest.fn(async () => null),
    setNotificationCategoryAsync: jest.fn(async () => null),
    setBadgeCountAsync: jest.fn(async () => true),
    clearLastNotificationResponse: jest.fn(),
    addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
    getLastNotificationResponseAsync: jest.fn(async () => null),
  },
}));

const { PushNotificationsProvider } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/providers/PushNotificationsProvider') as typeof import('@/providers/PushNotificationsProvider');

const notification = (data: Record<string, unknown>) => ({ request: { content: { data } } });
const collectPush = { type: 'pos_collect_request', payment_id: '0f8b7c1e-1a2b-4c3d-8e9f-001122334455', venue_id: 'venue-1' };

async function handler(): Promise<Handler> {
  await render(<PushNotificationsProvider>{null}</PushNotificationsProvider>);
  await waitFor(() => expect(mockHandlers.length).toBeGreaterThan(0));
  return mockHandlers.at(-1)!;
}

// React Native's jest mock keeps `currentState` as a plain property.
const setAppState = (state: string) => {
  (AppState as unknown as { currentState: string }).currentState = state;
};
beforeEach(() => {
  mockHandlers.length = 0;
  mockOffer.mockReset().mockReturnValue(false);
  setAppState('active');
});

describe('the notification handler and the in-app collect prompt', () => {
  it('leaves the banner out when the prompt shows the request, keeping the sound', async () => {
    mockOffer.mockReturnValue(true);
    const h = await handler();
    await expect(h.handleNotification(notification(collectPush))).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    expect(mockOffer).toHaveBeenCalledWith(collectPush);
  });

  it('shows the banner when the prompt cannot, and for every other notification', async () => {
    const h = await handler();
    const banner = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
    await expect(h.handleNotification(notification(collectPush))).resolves.toEqual(banner);
    await expect(h.handleNotification(notification({ booking_id: 'b-1' }))).resolves.toEqual(banner);
  });

  it('never offers a push to the prompt while the app is not in front', async () => {
    mockOffer.mockReturnValue(true);
    setAppState('background');
    const h = await handler();
    await expect(h.handleNotification(notification(collectPush))).resolves.toEqual(expect.objectContaining({ shouldShowBanner: true }));
    expect(mockOffer).not.toHaveBeenCalled();
  });
});
