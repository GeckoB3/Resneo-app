/**
 * `X-ResNeo-Venue` on every request to the API (web roles plan §6.2c): through `apiFetch`, through
 * `apiRawFetch` and on files downloaded straight to disk; an answer that set off before a switch is
 * dropped; and a 403 SITE_NOT_AVAILABLE goes back to the home site and asks once more.
 */
jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test' }));

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import {
  ApiError,
  apiFetch,
  apiRawFetch,
  isSiteSwitchedError,
  setAccessTokenRefresher,
  withApiSiteHeader,
} from '@/lib/api/client';
import {
  __resetActiveSiteForTests,
  getChosenSiteId,
  isSiteLost,
  onSiteChange,
  setChosenSite,
  syncChosenSiteUser,
} from '@/lib/sites/active-site';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

type FetchResult = { ok: boolean; status: number; text: () => Promise<string> };

function jsonResponse(status: number, body: unknown): FetchResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body == null ? '' : JSON.stringify(body)),
  };
}

const fetchMock = jest.fn();

function sentHeaders(callIndex: number): Record<string, string> {
  return (fetchMock.mock.calls[callIndex][1] as { headers: Record<string, string> }).headers;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setAccessTokenRefresher(null);
  mockStore.clear();
  __resetActiveSiteForTests();
  syncChosenSiteUser('user-1');
});

describe('apiFetch and the chosen site', () => {
  it('sends no site header when none is chosen, exactly as before', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiFetch('/api/venue', { accessToken: 't' });
    expect(sentHeaders(0)['X-ResNeo-Venue']).toBeUndefined();
  });

  it('names the chosen site on the request', async () => {
    await setChosenSite(SITE_A);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiFetch('/api/venue', { accessToken: 't' });
    expect(sentHeaders(0)['X-ResNeo-Venue']).toBe(SITE_A);
    expect(sentHeaders(0).Authorization).toBe('Bearer t');
  });

  it('drops an answer that set off before a switch', async () => {
    await setChosenSite(SITE_A);
    let resolveFetch: (value: FetchResult) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<FetchResult>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const pending = apiFetch('/api/venue/bookings', { accessToken: 't' });
    // Let the request go out under site A.
    await Promise.resolve();
    await Promise.resolve();
    await setChosenSite(SITE_B);
    resolveFetch(jsonResponse(200, { bookings: ['from site A'] }));

    const error = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(isSiteSwitchedError(error)).toBe(true);
  });

  it('on 403 SITE_NOT_AVAILABLE, goes back to the home site, lets go of the old one and asks once more', async () => {
    await setChosenSite(SITE_A);
    const cleared = jest.fn();
    onSiteChange(cleared);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(403, { error: 'You no longer have access to that site.', code: 'SITE_NOT_AVAILABLE' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { staff: { id: 's1' } }));

    const result = await apiFetch<{ staff: { id: string } }>('/api/venue/staff/me', { accessToken: 't' });

    expect(result).toEqual({ staff: { id: 's1' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentHeaders(0)['X-ResNeo-Venue']).toBe(SITE_A);
    expect(sentHeaders(1)['X-ResNeo-Venue']).toBeUndefined();
    expect(getChosenSiteId()).toBeNull();
    expect(cleared).toHaveBeenCalledWith({ from: SITE_A, to: null });
    // The person is told once (SiteChoiceOffer shows it).
    expect(isSiteLost()).toBe(true);
  });

  it('does not retry a 403 SITE_NOT_AVAILABLE for a request that named no site', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'No', code: 'SITE_NOT_AVAILABLE' }));
    await expect(apiFetch('/api/v1/me/sites', { accessToken: 't' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves any other 403 alone', async () => {
    await setChosenSite(SITE_A);
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Only admins', code: 'OWNER_ONLY' }));
    await expect(apiFetch('/api/venue/plan', { accessToken: 't' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getChosenSiteId()).toBe(SITE_A);
  });
});

describe('requests that cannot go through apiFetch', () => {
  it('apiRawFetch adds the site header and keeps the caller’s own', async () => {
    await setChosenSite(SITE_A);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    await apiRawFetch('/api/venue/export?format=csv', { headers: { Authorization: 'Bearer t', Accept: 'text/csv' } });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/api/venue/export?format=csv');
    expect(sentHeaders(0)).toEqual({ Authorization: 'Bearer t', Accept: 'text/csv', 'X-ResNeo-Venue': SITE_A });
  });

  it('apiRawFetch hands the request to a streaming fetch when given one', async () => {
    await setChosenSite(SITE_A);
    const streaming = jest.fn(async () => 'stream');
    const result = await apiRawFetch('/api/venue/assistant', { method: 'POST' }, streaming);
    expect(result).toBe('stream');
    expect(streaming).toHaveBeenCalledWith('https://api.test/api/venue/assistant', {
      method: 'POST',
      headers: { 'X-ResNeo-Venue': SITE_A },
    });
  });

  it('withApiSiteHeader adds the site only for the API, never for another host', async () => {
    await setChosenSite(SITE_A);
    expect(withApiSiteHeader('https://api.test/api/venue/x.pdf', { Authorization: 'Bearer t' })).toEqual({
      Authorization: 'Bearer t',
      'X-ResNeo-Venue': SITE_A,
    });
    expect(withApiSiteHeader('https://storage.example/signed', { Authorization: 'Bearer t' })).toEqual({
      Authorization: 'Bearer t',
    });
  });
});
