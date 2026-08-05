import {
  LOCATION_REFUSED_MESSAGE,
  ensureIosLocationPermission,
} from '@/lib/payments/card-present-permissions';

/**
 * iOS location permission for card-present payments. Stripe requires location on
 * both platforms but ships a permission helper for Android only, so this is the
 * iOS half. jest hoists mock factories, so closed-over vars are `mock*`.
 */

const mockRequest = jest.fn(async () => ({ status: 'granted' }) as { status: string });
const mockGet = jest.fn(async () => ({ status: 'undetermined' }) as { status: string });
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => mockRequest(),
  getForegroundPermissionsAsync: () => mockGet(),
}));

beforeEach(() => {
  mockRequest.mockClear();
  mockGet.mockClear();
  mockRequest.mockResolvedValue({ status: 'granted' });
  mockGet.mockResolvedValue({ status: 'undetermined' });
});

describe('ensureIosLocationPermission', () => {
  it('does nothing on Android — the SDK helper covers that platform', async () => {
    await expect(ensureIosLocationPermission('android')).resolves.toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('requests on iOS and passes when granted', async () => {
    await expect(ensureIosLocationPermission('ios')).resolves.toBeNull();
    expect(mockRequest).toHaveBeenCalled();
  });

  it('returns the refusal message when denied', async () => {
    mockRequest.mockResolvedValue({ status: 'denied' });
    await expect(ensureIosLocationPermission('ios')).resolves.toBe(LOCATION_REFUSED_MESSAGE);
  });

  it('reports a standing refusal without re-prompting', async () => {
    // A second `request` after a denial resolves instantly without a dialog, so
    // checking first is the only way to tell "refused" from "granted".
    mockGet.mockResolvedValue({ status: 'denied' });
    mockRequest.mockResolvedValue({ status: 'denied' });
    await expect(ensureIosLocationPermission('ios')).resolves.toBe(LOCATION_REFUSED_MESSAGE);
  });

  it('skips the prompt entirely when already granted', async () => {
    mockGet.mockResolvedValue({ status: 'granted' });
    await expect(ensureIosLocationPermission('ios')).resolves.toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('never lets the probe itself be what stops a payment', async () => {
    mockGet.mockRejectedValue(new Error('module exploded'));
    await expect(ensureIosLocationPermission('ios')).resolves.toBeNull();
  });
});
