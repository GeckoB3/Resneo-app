/**
 * apiFetch never puts technical text on screen (web codebase standards plan P4.8).
 *
 * An HTML page (a platform error, Vercel Deployment Protection, a login redirect), broken JSON,
 * a dropped connection, a timeout and a 5xx each become one of the plain sentences shared with
 * the web (`lib/api/friendly-errors.ts`). The technical detail stays on `ApiError.detail`, and an
 * unreadable answer is reported to Sentry. A 4xx keeps the server's own words.
 */
import { ApiError, apiFetch } from '@/lib/api/client';
import {
  FRIENDLY_OFFLINE_ERROR,
  FRIENDLY_REQUEST_FAILED,
  FRIENDLY_SERVER_ERROR,
  FRIENDLY_TIMEOUT_ERROR,
} from '@/lib/api/friendly-errors';
import { captureException } from '@/lib/observability';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test', getWebUrl: () => 'https://web.test' }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));

const mockCapture = captureException as jest.MockedFunction<typeof captureException>;

function textResponse(status: number, text: string) {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(text) };
}

function jsonResponse(status: number, body: unknown) {
  return textResponse(status, JSON.stringify(body));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('expected apiFetch to fail');
}

describe('apiFetch: plain-English errors', () => {
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    mockCapture.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // The response-schema check may warn about these deliberately odd answers.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('turns an HTML page into the server sentence, keeping the hint for Sentry', async () => {
    fetchMock.mockResolvedValueOnce(textResponse(404, '<!DOCTYPE html><html><body>Authentication Required</body></html>'));
    const err = await failure(apiFetch('/api/venue/bookings/list?date=2026-12-01'));

    expect(err.message).toBe(FRIENDLY_SERVER_ERROR);
    expect(err.status).toBe(502);
    expect(err.detail).toContain('received HTML');
    expect(err.detail).toContain('EXPO_PUBLIC_API_URL');
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [reported, context] = mockCapture.mock.calls[0]!;
    expect((reported as Error).message).toContain('received HTML');
    expect(context).toMatchObject({ scope: 'api.unreadable-answer', path: 'https://api.test/api/venue/bookings/list', status: 404 });
  });

  it('turns broken JSON into the server sentence', async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, '{"bookings": ['));
    const err = await failure(apiFetch('/api/venue/bookings/list'));

    expect(err.message).toBe(FRIENDLY_SERVER_ERROR);
    expect(err.status).toBe(502);
    expect(err.detail).toContain('Invalid JSON');
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('turns a 5xx into the server sentence, keeping the server text in the detail', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'Internal server error', code: 'INTERNAL_ERROR' }));
    const err = await failure(apiFetch('/api/venue/bookings/b1', { method: 'PATCH', body: '{}' }));

    expect(err.message).toBe(FRIENDLY_SERVER_ERROR);
    expect(err.status).toBe(500);
    expect(err.body).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    expect(err.detail).toBe('PATCH /api/venue/bookings/b1 500: Internal server error');
    // The server logged its own 500; only unreadable answers are reported from here.
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("keeps a 4xx's own message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: 'That time has just been taken.', code: 'SLOT_NO_LONGER_AVAILABLE' }),
    );
    const err = await failure(apiFetch('/api/venue/bookings', { method: 'POST', body: '{}' }));

    expect(err.message).toBe('That time has just been taken.');
    expect(err.status).toBe(409);
  });

  it('gives a 4xx with nothing to say a plain sentence, not "Request failed (404)"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    const err = await failure(apiFetch('/api/venue/thing'));

    expect(err.message).toBe(FRIENDLY_REQUEST_FAILED);
    expect(err.status).toBe(404);
  });

  it('turns a dropped connection into the offline sentence (status 0, as before)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const err = await failure(apiFetch('/api/venue/thing?email=a@b.test'));

    expect(err.message).toBe(FRIENDLY_OFFLINE_ERROR);
    expect(err.status).toBe(0);
    expect(err.detail).toBe('GET /api/venue/thing: Network request failed');
  });

  it('turns a timeout into the timeout sentence (status 408, as before)', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const pending = failure(apiFetch('/api/venue/thing', { timeoutMs: 1_000 }));
    await jest.advanceTimersByTimeAsync(1_000);
    const err = await pending;

    expect(err.message).toBe(FRIENDLY_TIMEOUT_ERROR);
    expect(err.status).toBe(408);
    expect(err.detail).toContain('no answer within 1000 ms');
  });
});

describe('the sentences', () => {
  it('match the web word for word and use plain words', () => {
    expect(FRIENDLY_SERVER_ERROR).toBe('Something went wrong on our side. Please try again in a moment.');
    expect(FRIENDLY_OFFLINE_ERROR).toBe('You seem to be offline. Check your connection and try again.');
    expect(FRIENDLY_TIMEOUT_ERROR).toBe('This is taking longer than it should. Check your connection and try again.');
    expect(FRIENDLY_REQUEST_FAILED).toBe('We could not do that just now. Please try again.');
    for (const s of [FRIENDLY_SERVER_ERROR, FRIENDLY_OFFLINE_ERROR, FRIENDLY_TIMEOUT_ERROR, FRIENDLY_REQUEST_FAILED]) {
      expect(s).not.toMatch(/—/);
      expect(s).not.toMatch(/\d|json|server|network|http|fetch/i);
    }
  });
});
