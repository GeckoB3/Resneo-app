/**
 * A signed-out device must stop receiving the venue's push notifications.
 *
 * The registration row is keyed `(user_id, push_token)` and the server fans out
 * by `user_id` alone, pruning tokens only when Expo reports them INVALID — which
 * never happens on a sign-out, because the token is still perfectly valid and
 * only its owner changed. So a row left behind keeps delivering the previous
 * venue's booking alerts, which carry the client's name and service in the body.
 * On a shared salon tablet that is one venue's client data arriving on another
 * venue's screen, indefinitely.
 *
 * Re-registering under the new user does NOT heal it: the unique index is on
 * `(user_id, push_token)`, so the second user gets a SECOND row and both fire.
 */
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
jest.mock('expo-device', () => ({ osVersion: '17.0', modelName: 'iPhone', isDevice: true }));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.8', extra: { eas: { projectId: 'proj-1' } } },
}));
jest.mock('@/lib/push/runtime', () => ({ isExpoGoClient: () => false }));
jest.mock('@/lib/push/notificationsModule', () => ({
  Notifications: {
    getPermissionsAsync: async () => ({ status: 'granted' }),
    requestPermissionsAsync: async () => ({ status: 'granted' }),
    getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[abc]' }),
  },
}));

import { POS_APP_STEP } from '@/lib/pos/client-build';
import {
  __resetDeviceRegistrationForTests,
  getRegisteredDeviceId,
  registerCurrentDeviceForPush,
  reportDeviceCardCapability,
  unregisterDevice,
} from '@/lib/push/registerDevice';

beforeEach(() => mockApiFetch.mockReset());

describe('unregisterDevice', () => {
  it('does nothing when this session never registered a device', async () => {
    await unregisterDevice('token-A');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does nothing without a token — the DELETE is scoped to auth.uid()', async () => {
    await unregisterDevice(null);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('never throws, so a failure cannot block signing out', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network'));
    await expect(unregisterDevice('token-A')).resolves.toBeUndefined();
  });
});

describe('registerCurrentDeviceForPush: the audience stamp (C0)', () => {
  function payloadOf(call: unknown[]): Record<string, unknown> {
    const opts = call[1] as { body?: string };
    return JSON.parse(opts.body ?? '{}');
  }

  it('sends the audience it was given', async () => {
    /*
      The field that decides which pushes this device receives. Before C0 the
      client sent none, so the server's `'staff'` default applied to every
      device, including one belonging to somebody who is not staff anywhere.
    */
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-1' } });
    await registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'customer' });
    expect(payloadOf(mockApiFetch.mock.calls[0]).audience).toBe('customer');
  });

  it('sends staff when that is who it is, rather than relying on the server default', async () => {
    /*
      Worth asserting even though the server would default to the same value.
      Relying on the default is what made the customer case silently wrong, and
      a client that states the answer cannot be broken by the default changing.
    */
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-2' } });
    await registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'staff' });
    expect(payloadOf(mockApiFetch.mock.calls[0]).audience).toBe('staff');
  });
});

describe('POS app step 2: the build and what the phone can do with a card', () => {
  function payloadOf(call: unknown[]): Record<string, unknown> {
    const opts = call[1] as { body?: string };
    return JSON.parse(opts.body ?? '{}');
  }

  beforeEach(() => __resetDeviceRegistrationForTests());

  it('sends client_build with the POS app step on every registration', async () => {
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-3' } });
    await registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'staff' });
    expect(String(payloadOf(mockApiFetch.mock.calls[0]).client_build)).toMatch(new RegExp(`; pos=${POS_APP_STEP}$`));
  });

  it('sends the registration again, on the same token, when the card capability changes', async () => {
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-4' } });
    await registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'staff' });
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-4' } });
    await expect(
      reportDeviceCardCapability('token-A', { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true }),
    ).resolves.toBe(true);
    const second = payloadOf(mockApiFetch.mock.calls[1]);
    expect(second).toMatchObject({
      push_token: 'ExponentPushToken[abc]',
      audience: 'staff',
      card_capability: 'tap_to_pay',
      tap_to_pay_terms_accepted: true,
    });
    expect(getRegisteredDeviceId()).toBe('dev-4');

    // The same answer again sends nothing.
    await expect(
      reportDeviceCardCapability('token-A', { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true }),
    ).resolves.toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('sends nothing extra for a phone that cannot take cards', async () => {
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-5' } });
    await registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'staff' });
    await expect(reportDeviceCardCapability('token-A', { card_capability: 'none', tap_to_pay_terms_accepted: null })).resolves.toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('sends a capability learned while the first registration was in flight (the lost Tap to Pay report)', async () => {
    let finishFirst: (v: unknown) => void = () => {};
    mockApiFetch.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-7' } });
    const registering = registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'staff' });
    // Let the registration build its payload (no card fields yet) and start the POST.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(payloadOf(mockApiFetch.mock.calls[0])).not.toHaveProperty('card_capability');
    // The reporter learns the phone takes cards before the POST answers: nothing to resend on yet.
    await expect(
      reportDeviceCardCapability('token-A', { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true }),
    ).resolves.toBe(false);
    finishFirst({ device: { id: 'dev-7' } });
    await registering;
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(payloadOf(mockApiFetch.mock.calls[1])).toMatchObject({ card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true });
    // And it is now recorded as sent, so the same answer sends nothing more.
    await expect(
      reportDeviceCardCapability('token-A', { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true }),
    ).resolves.toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('carries a capability known before registration in the first registration', async () => {
    await reportDeviceCardCapability('token-A', { card_capability: 'wisepad', tap_to_pay_terms_accepted: null });
    expect(mockApiFetch).not.toHaveBeenCalled();
    mockApiFetch.mockResolvedValueOnce({ device: { id: 'dev-6' } });
    await registerCurrentDeviceForPush({ accessToken: 'token-A', audience: 'staff' });
    expect(payloadOf(mockApiFetch.mock.calls[0])).toMatchObject({ card_capability: 'wisepad' });
  });
});
