/**
 * apiFetch checks answers against the web's response schemas (web codebase standards plan P4.5):
 * in development and tests only, never in a store build. A mismatch warns, naming the route and
 * each field, and never throws, so the screen gets the answer exactly as it would in production.
 */
import { ApiError, apiFetch, responseChecksEnabled } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test', getWebUrl: () => 'https://web.test' }));

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const ROW = {
  id: 'b1',
  booking_date: '2026-12-15',
  booking_time: '10:00:00',
  party_size: 1,
  status: 'Booked',
  guest_name: 'Ada Lovelace',
  deposit_status: null,
};

describe('apiFetch: response schemas', () => {
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('is on under jest', () => {
    expect(responseChecksEnabled()).toBe(true);
  });

  it('says nothing when the answer matches, extra fields included', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { bookings: [{ ...ROW, added_by_a_newer_web: true }] }));

    const data = await apiFetch<{ bookings: unknown[] }>('/api/venue/bookings/list?date=2026-12-15', { accessToken: 't' });

    expect(data.bookings).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns about a mismatch, naming the route and each field, and still returns the answer', async () => {
    const body = { bookings: [{ ...ROW, guest_name: undefined, party_size: '1' }] };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    const data = await apiFetch<{ bookings: unknown[] }>('/api/venue/bookings/list?date=2026-12-15', { accessToken: 't' });

    expect(data).toEqual(JSON.parse(JSON.stringify(body)));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain('GET /api/venue/bookings/list answered 200');
    expect(message).toContain('bookings.0.guest_name');
    expect(message).toContain('bookings.0.party_size');
  });

  it('picks the schema by method and path: a POST to the booking path is not the detail GET', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { booking_id: 'b1' }));
    await apiFetch('/api/venue/bookings', { method: 'POST', body: '{}', accessToken: 't' });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { booking_id: 'b1' }));
    await apiFetch('/api/venue/bookings/b1', { accessToken: 't' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('GET /api/venue/bookings/[id] answered 200');
  });

  it('checks a refusal against the refusal schema, and still throws the ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { oops: true }));

    const err = await apiFetch('/api/venue', { accessToken: 't' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('GET /api/venue answered 500');
  });

  it('leaves routes with no schema alone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, 'anything'));
    await apiFetch('/api/venue/guests', { accessToken: 't' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  describe('in a store build', () => {
    const g = globalThis as unknown as { __DEV__?: boolean };
    // Typed loosely: the app's env typing makes NODE_ENV a fixed union.
    const env = process.env as Record<string, string | undefined>;
    let dev: boolean | undefined;
    let nodeEnv: string | undefined;

    beforeEach(() => {
      dev = g.__DEV__;
      nodeEnv = env.NODE_ENV;
      g.__DEV__ = false;
      env.NODE_ENV = 'production';
    });

    afterEach(() => {
      g.__DEV__ = dev;
      env.NODE_ENV = nodeEnv;
    });

    it('skips the check', async () => {
      expect(responseChecksEnabled()).toBe(false);
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { bookings: [{ id: 'b1' }] }));

      const data = await apiFetch<{ bookings: unknown[] }>('/api/venue/bookings/list?date=2026-12-15', { accessToken: 't' });

      expect(data.bookings).toHaveLength(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
