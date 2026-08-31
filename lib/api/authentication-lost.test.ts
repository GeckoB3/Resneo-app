/**
 * What happens when the server says our credentials are dead.
 *
 * A session revoked server-side, by signing out everywhere or by requesting
 * account deletion, leaves a JWT here that is not yet EXPIRED. Supabase keeps
 * returning it from storage, never refreshes it, and never emits SIGNED_OUT.
 * Nothing in the app noticed, so it sat on the revoked session showing "Could
 * not load your account, check your connection" on every screen.
 *
 * The dangerous half of the fix is the discriminator. `GET /api/venue/staff/me`
 * answers a perfectly healthy customer session with a 401, and that 401 is how
 * this app IDENTIFIES a customer. Reacting to it would sign out every customer
 * in the app the moment they opened it.
 */
import {
  apiFetch,
  setAccessTokenRefresher,
  setAuthenticationLostHandler,
} from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://example.test' }));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

let lost: number;

function respond(status: number, body: unknown) {
  mockFetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  lost = 0;
  mockFetch.mockReset();
  setAccessTokenRefresher(null);
  setAuthenticationLostHandler(() => {
    lost += 1;
  });
});

afterAll(() => {
  setAuthenticationLostHandler(null);
});

describe('a 401 that means the session is dead', () => {
  it('reports the loss when the body says UNAUTHENTICATED', async () => {
    respond(401, { error: 'Unauthorised', code: 'UNAUTHENTICATED' });
    await expect(apiFetch('/api/v1/me/home', { accessToken: 'dead' })).rejects.toThrow();
    expect(lost).toBe(1);
  });

  it('still throws, so the caller is not left waiting on a request that failed', async () => {
    // The handler ends the session; it does not turn a failure into a success.
    respond(401, { error: 'Unauthorised', code: 'UNAUTHENTICATED' });
    await expect(apiFetch('/api/v1/me/home', { accessToken: 'dead' })).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('the 401 that must NOT end anything', () => {
  it('ignores the staff gate’s bare 401, which is how a customer is identified', async () => {
    /*
      `useRole` reads exactly this 401 and returns `customer`. If this counted
      as a lost session, every customer would be signed out the moment the app
      asked whether they were staff, which it does on every launch.
    */
    respond(401, { error: 'Unauthorised' });
    await expect(apiFetch('/api/venue/staff/me', { accessToken: 'good' })).rejects.toThrow();
    expect(lost).toBe(0);
  });

  it('ignores a 401 carrying some other code', async () => {
    respond(401, { error: 'Nope', code: 'VENUE_PAST_DUE' });
    await expect(apiFetch('/api/whatever', { accessToken: 'good' })).rejects.toThrow();
    expect(lost).toBe(0);
  });

  it('ignores an ANONYMOUS 401, where there was no session to lose', async () => {
    // No token was sent, so nothing of ours was rejected.
    respond(401, { error: 'Unauthorised', code: 'UNAUTHENTICATED' });
    await expect(apiFetch('/api/v1/me/home')).rejects.toThrow();
    expect(lost).toBe(0);
  });

  it('ignores a 403, a 500 and a network failure', async () => {
    for (const status of [403, 500]) {
      respond(status, { error: 'x', code: 'UNAUTHENTICATED' });
      await expect(apiFetch('/api/x', { accessToken: 'good' })).rejects.toThrow();
    }
    mockFetch.mockRejectedValue(new Error('offline'));
    await expect(apiFetch('/api/x', { accessToken: 'good' })).rejects.toThrow();
    expect(lost).toBe(0);
  });
});

describe('a merely stale token is not a dead one', () => {
  it('says nothing when the refresh works and the retry succeeds', async () => {
    /*
      The ordinary resume-from-background case. The first request goes out with
      a token that expired while the app was asleep; a refresh fixes it. Ending
      the session here would sign people out for backgrounding the app.
    */
    setAccessTokenRefresher(async () => 'fresh');
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'Unauthorised', code: 'UNAUTHENTICATED' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ ok: 1 }) });

    await expect(apiFetch('/api/v1/me/home', { accessToken: 'stale' })).resolves.toEqual({ ok: 1 });
    expect(lost).toBe(0);
  });

  it('reports the loss when the refresh produced a token the server ALSO rejects', async () => {
    // Refreshing succeeded but the new token is rejected too: the session is
    // revoked rather than stale, and this is the retry landing on the same wall.
    setAccessTokenRefresher(async () => 'fresh');
    respond(401, { error: 'Unauthorised', code: 'UNAUTHENTICATED' });
    await expect(apiFetch('/api/v1/me/home', { accessToken: 'stale' })).rejects.toThrow();
    expect(lost).toBe(1);
  });

  it('reports the loss when there is no refresher at all', async () => {
    // Nothing can be recovered, so the 401 is final.
    setAccessTokenRefresher(null);
    respond(401, { error: 'Unauthorised', code: 'UNAUTHENTICATED' });
    await expect(apiFetch('/api/v1/me/home', { accessToken: 'dead' })).rejects.toThrow();
    expect(lost).toBe(1);
  });
});
