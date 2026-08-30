/**
 * C0's acceptance: a device registers as what its owner actually is, or not at
 * all.
 *
 * The defect this closes is live in production. Registration was gated on
 * having a session and nothing else, and the payload carried no audience, so
 * the server's `'staff'` default applied to everyone. Someone who signed in,
 * failed the staff check and landed on <StaffRequired/> was still registered as
 * a staff device, and `sendStaffPush` fans out by user and audience, so that
 * device received a venue's booking alerts. Those carry a client's name and the
 * service they booked.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

import type { Role } from '@/lib/queries/useRole';

const state = { role: 'staff' as Role };
const mockRegister = jest.fn().mockResolvedValue({ registered: true });

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/push/runtime', () => ({ isExpoGoClient: () => false }));
jest.mock('@/lib/push/notificationsModule', () => ({ Notifications: null }));
jest.mock('@/lib/push/registerDevice', () => ({
  registerCurrentDeviceForPush: (...args: unknown[]) => mockRegister(...args),
  unregisterDevice: jest.fn(),
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ session: { access_token: 'token-A', user: { id: 'user-1' } } }),
}));
jest.mock('@/lib/queries/useRole', () => ({
  useRole: () => state.role,
  // The real mapping, not a stub: this test is partly about the two agreeing.
  audienceForRole: (r: Role) => (r === 'staff' || r === 'customer' ? r : null),
}));

const { PushNotificationsProvider } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/providers/PushNotificationsProvider') as typeof import('@/providers/PushNotificationsProvider');

async function mount() {
  return await render(<PushNotificationsProvider>{null}</PushNotificationsProvider>);
}

function audienceOfFirstCall(): unknown {
  return (mockRegister.mock.calls[0]?.[0] as { audience?: unknown })?.audience;
}

beforeEach(() => {
  mockRegister.mockClear();
  state.role = 'staff';
});

describe('what gets registered, and as what', () => {
  it('registers a staff member as staff', async () => {
    await mount();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(audienceOfFirstCall()).toBe('staff');
  });

  it('registers a customer as CUSTOMER, not as staff', async () => {
    // The whole point. Before C0 this device was indistinguishable in the
    // database from the venue's own iPad.
    state.role = 'customer';
    await mount();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(audienceOfFirstCall()).toBe('customer');
  });

  it('registers NOTHING while the role is still loading', async () => {
    /*
      Not merely a tidiness point. Registering early would have to pick an
      audience before the answer exists, and the only available guess is the
      server's `'staff'` default, which is exactly the defect.
    */
    state.role = 'loading';
    await mount();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registers NOTHING when the role cannot be determined', async () => {
    /*
      A staff member whose staff/me call fails with a 500 does not register on
      this pass, and that is the deliberate trade. The effect re-runs when the
      access token rotates, roughly hourly, so it self-heals; a row written with
      the wrong audience persists until somebody deletes it, and sends another
      venue's client details in the meantime.
    */
    state.role = 'unknown';
    await mount();
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
