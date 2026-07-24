/**
 * Connection tokens + Terminal Location scoping (§6.2 / §7.5).
 *
 * The cached location decides which Stripe account a reader attaches to, so a
 * leak ACROSS venue scopes would let a payment settle against the wrong
 * venue's connected account. That is the highest-severity failure in this
 * feature, so the scoping is pinned here.
 */
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  clearTerminalLocationCache,
  ensureTerminalLocationId,
  fetchConnectionToken,
  getCachedTerminalLocationId,
} from '@/lib/payments/connection-token';

beforeEach(() => {
  mockApiFetch.mockReset();
  clearTerminalLocationCache();
});

describe('fetchConnectionToken', () => {
  it('POSTs with no body fields for the staff member’s own venue', async () => {
    mockApiFetch.mockResolvedValue({ secret: 's1', location_id: 'loc_own' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: null });

    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/payments/connection-token');
    expect((opts as { method: string }).method).toBe('POST');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({});
  });

  it('scopes the request to a linked venue when one is active', async () => {
    mockApiFetch.mockResolvedValue({ secret: 's2', location_id: 'loc_linked' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: 'venue-2' });

    expect(JSON.parse((mockApiFetch.mock.calls[0]![1] as { body: string }).body)).toEqual({
      owner_venue_id: 'venue-2',
    });
  });
});

describe('location cache scoping', () => {
  it('keeps own-venue and linked-venue locations apart', async () => {
    mockApiFetch.mockResolvedValueOnce({ secret: 's1', location_id: 'loc_own' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: null });
    mockApiFetch.mockResolvedValueOnce({ secret: 's2', location_id: 'loc_linked' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: 'venue-2' });

    // A reader connecting under one scope must never pick up the other's
    // Location: that would attach the payment to the wrong Stripe account.
    expect(getCachedTerminalLocationId(null)).toBe('loc_own');
    expect(getCachedTerminalLocationId('venue-2')).toBe('loc_linked');
  });

  it('returns null for a scope that has never been fetched', () => {
    expect(getCachedTerminalLocationId('venue-never')).toBeNull();
  });

  it('clears every scope on sign-out or venue switch', async () => {
    mockApiFetch.mockResolvedValue({ secret: 's', location_id: 'loc_a' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: null });
    expect(getCachedTerminalLocationId(null)).toBe('loc_a');

    clearTerminalLocationCache();
    expect(getCachedTerminalLocationId(null)).toBeNull();
  });
});

describe('ensureTerminalLocationId', () => {
  it('reuses the cached location without minting another token', async () => {
    mockApiFetch.mockResolvedValue({ secret: 's', location_id: 'loc_a' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: null });
    mockApiFetch.mockClear();

    const id = await ensureTerminalLocationId({ accessToken: 'tok', ownerVenueId: null });

    expect(id).toBe('loc_a');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('fetches when the scope is cold', async () => {
    mockApiFetch.mockResolvedValue({ secret: 's', location_id: 'loc_b' });
    const id = await ensureTerminalLocationId({ accessToken: 'tok', ownerVenueId: 'venue-3' });

    expect(id).toBe('loc_b');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT reuse another scope’s location', async () => {
    mockApiFetch.mockResolvedValueOnce({ secret: 's', location_id: 'loc_own' });
    await fetchConnectionToken({ accessToken: 'tok', ownerVenueId: null });

    mockApiFetch.mockResolvedValueOnce({ secret: 's', location_id: 'loc_linked' });
    const id = await ensureTerminalLocationId({ accessToken: 'tok', ownerVenueId: 'venue-2' });

    expect(id).toBe('loc_linked');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('raises a readable error when the venue has no Terminal Location', async () => {
    mockApiFetch.mockResolvedValue({ secret: 's', location_id: '' });
    await expect(
      ensureTerminalLocationId({ accessToken: 'tok', ownerVenueId: null }),
    ).rejects.toThrow(/not set up for in-person payments/i);
  });

  it('propagates a failed token request rather than connecting blind', async () => {
    mockApiFetch.mockRejectedValue(new Error('In-person payments are not enabled.'));
    await expect(
      ensureTerminalLocationId({ accessToken: 'tok', ownerVenueId: null }),
    ).rejects.toThrow('In-person payments are not enabled.');
  });
});
