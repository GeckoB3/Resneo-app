/**
 * The in-app prompt for a sale sent to this phone while the app is open (owner, 2026-10-10): it
 * offers the request at once with a buzz, opens the collect screen only when staff press "Take
 * payment", and stays out of the way (another venue, the collect screen, a sheet already open, the
 * app locked, a phone that can't take cards), where the phone's own banner shows instead.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { PosCollectRequest } from '@/types/pos';

jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) => (visible ? React.createElement(View, null, children) : null),
  };
});
const mockRouter = { push: jest.fn() };
let mockPathname = '/today';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => mockPathname }));
let mockCanCollect = true;
jest.mock('@/components/pos/CollectRequests', () => ({
  ...jest.requireActual<typeof import('@/components/pos/CollectRequests')>('@/components/pos/CollectRequests'),
  useCanCollectHere: () => mockCanCollect,
}));
let mockRequests: PosCollectRequest[] = [];
const mockRefetch = jest.fn(async () => undefined);
jest.mock('@/lib/queries/usePos', () => ({
  useCollectRequests: () => ({ data: { requests: mockRequests }, refetch: mockRefetch }),
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: { id: 'venue-1' } }) }));
let mockLocked = false;
jest.mock('@/providers/AppLockProvider', () => ({ useAppLock: () => ({ isLocked: mockLocked }) }));
let mockOverlays = 0;
jest.mock('@/lib/ui/open-overlays', () => ({ openOverlayCount: () => mockOverlays }));
const mockHaptic = jest.fn();
jest.mock('@/lib/haptics', () => ({
  ...jest.requireActual<typeof import('@/lib/haptics')>('@/lib/haptics'),
  hapticWarning: () => mockHaptic(),
}));

import { CollectRequestPrompt } from '@/components/pos/CollectRequestPrompt';
import { offerCollectPrompt } from '@/lib/push/collect-prompt';

const PAYMENT = '0f8b7c1e-1a2b-4c3d-8e9f-001122334455';
const push = (venueId = 'venue-1') => ({ type: 'pos_collect_request', payment_id: PAYMENT, sale_id: 'sale-1', venue_id: venueId });

function request(over: Partial<PosCollectRequest> = {}): PosCollectRequest {
  return {
    payment_id: PAYMENT,
    sale_id: 'sale-1',
    sale_no: 'R-1042',
    amount_pence: 4500,
    for_anyone: false,
    target_staff_id: 'staff-1',
    target_name: 'Jess',
    sent_by_name: 'Sam',
    client_name: 'Ada Lovelace',
    till_name: 'Front desk',
    expires_at: '2026-10-10T12:02:00Z',
    seconds_left: 110,
    created_at: '2026-10-10T12:00:00Z',
    ...over,
  };
}

async function offer(data = push()): Promise<boolean> {
  let shown = false;
  await act(async () => {
    shown = offerCollectPrompt(data);
  });
  return shown;
}

beforeEach(() => {
  mockPathname = '/today';
  mockCanCollect = true;
  mockLocked = false;
  mockOverlays = 0;
  mockRequests = [request()];
  mockRouter.push.mockReset();
  mockRefetch.mockClear();
  mockHaptic.mockClear();
});

describe('CollectRequestPrompt', () => {
  it('offers the request at once, with a buzz, and opens the collect screen only on Take payment', async () => {
    await render(<CollectRequestPrompt />);
    expect(screen.queryByText('Take £45.00')).toBeNull();
    expect(await offer()).toBe(true);
    expect(mockHaptic).toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalled();
    expect(screen.getByText('Waiting for you')).toBeTruthy();
    expect(screen.getByText('Take £45.00')).toBeTruthy();
    expect(screen.getByText('Sale R-1042 at Front desk, sent by Sam')).toBeTruthy();
    expect(screen.getByText('For Ada Lovelace')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByText('Take payment'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/collect/${PAYMENT}`);
    expect(screen.queryByText('Take £45.00')).toBeNull();
  });

  it('goes away on Not now, leaving the request where it was', async () => {
    await render(<CollectRequestPrompt />);
    await offer();
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(screen.queryByText('Take £45.00')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('says when it was sent to anyone', async () => {
    mockRequests = [request({ for_anyone: true, target_staff_id: null })];
    await render(<CollectRequestPrompt />);
    await offer();
    expect(screen.getByText('For anyone')).toBeTruthy();
  });

  it('leaves it to the banner while a sheet is open, on the collect screen, when locked, or for another venue', async () => {
    await render(<CollectRequestPrompt />);
    mockOverlays = 1;
    expect(await offer()).toBe(false);
    mockOverlays = 0;
    expect(await offer(push('venue-2'))).toBe(false);
    mockLocked = true;
    await render(<CollectRequestPrompt />);
    expect(await offer()).toBe(false);
    mockLocked = false;
    mockPathname = `/checkout/collect/${PAYMENT}`;
    await render(<CollectRequestPrompt />);
    expect(await offer()).toBe(false);
    expect(mockHaptic).not.toHaveBeenCalled();
    // Each push still reads the list again, so the banner doesn't wait for its poll.
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('asks nothing on a phone that cannot take cards here', async () => {
    mockCanCollect = false;
    await render(<CollectRequestPrompt />);
    expect(await offer()).toBe(false);
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('shows nothing for a request that is no longer waiting', async () => {
    mockRequests = [];
    await render(<CollectRequestPrompt />);
    expect(await offer()).toBe(true);
    expect(screen.queryByText('Take payment')).toBeNull();
  });
});
