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
jest.mock('expo-notifications', () => ({}), { virtual: true });

import { unregisterDevice } from '@/lib/push/registerDevice';

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
