/**
 * apiFetch — 401 refresh-and-retry-once (background-resume token recovery).
 *
 * When the app resumes from the background the in-memory access token can be
 * momentarily expired, so the first calendar/bookings request goes out with a
 * stale Bearer and the API answers 401 "unauthorised access". apiFetch must
 * transparently refresh the token (via the refresher AuthProvider registers) and
 * retry ONCE — but only when the refresh produced a genuinely different token.
 *
 * A 401 whose token is unchanged is a real permission failure (e.g. "valid
 * session but not venue staff") and must surface unretried so the staff gate can
 * redirect — this guards that the recovery never turns a permission 401 into a
 * retry loop.
 */
import { ApiError, apiFetch, setAccessTokenRefresher } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test' }));

type FetchResult = { ok: boolean; status: number; text: () => Promise<string> };

function jsonResponse(status: number, body: unknown): FetchResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body == null ? '' : JSON.stringify(body)),
  };
}

describe('apiFetch — 401 refresh-and-retry-once', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setAccessTokenRefresher(null);
  });

  afterEach(() => {
    setAccessTokenRefresher(null);
  });

  /** Authorization header sent on the Nth fetch call. */
  function authHeader(callIndex: number): string | undefined {
    const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
    return (init.headers as Record<string, string>).Authorization;
  }

  it('refreshes and retries once, succeeding with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    setAccessTokenRefresher(async () => 'new-token');

    const result = await apiFetch<{ ok: boolean }>('/api/venue/calendar-grid', {
      accessToken: 'stale-token',
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(0)).toBe('Bearer stale-token');
    expect(authHeader(1)).toBe('Bearer new-token');
  });

  it('does NOT retry when the refresher returns the same token (still valid → real permission 401)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Not venue staff' }));
    setAccessTokenRefresher(async (token) => token); // unchanged

    await expect(
      apiFetch('/api/venue/staff/me', { accessToken: 'valid-token' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry when the refresher returns null (session gone)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }));
    setAccessTokenRefresher(async () => null);

    await expect(
      apiFetch('/api/venue/bookings/list', { accessToken: 'stale-token' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry when no token was sent (anonymous 401)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }));
    setAccessTokenRefresher(async () => 'new-token');

    await expect(apiFetch('/api/venue/calendar-grid')).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry non-401 errors (e.g. 403)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden' }));
    setAccessTokenRefresher(async () => 'new-token');

    await expect(
      apiFetch('/api/venue/calendar-grid', { accessToken: 'tok' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the original single-attempt behaviour when no refresher is registered', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }));
    // No refresher registered (null from beforeEach) — e.g. before AuthProvider mounts.

    await expect(
      apiFetch('/api/venue/calendar-grid', { accessToken: 'stale-token' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error when the retry also 401s (no infinite retry)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Still unauthorized' }));
    setAccessTokenRefresher(async () => 'new-token');

    await expect(
      apiFetch('/api/venue/calendar-grid', { accessToken: 'stale-token' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
