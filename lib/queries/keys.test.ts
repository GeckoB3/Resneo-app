/**
 * Cache-key scoping (W1.6). The whole point of the refactor: auth-scoped keys
 * must stay STABLE across access-token rotation (hourly refresh) for the same
 * user, while still isolating different users. These are pure assertions on the
 * key factory + setQueryAuthScope.
 */
import { queryKeys, setQueryAuthScope } from './keys';

const TOKEN_A1 = 'eyJ.user-a.token-issued-at-0900';
const TOKEN_A2 = 'eyJ.user-a.token-issued-at-1000'; // same user, refreshed token
const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

afterEach(() => {
  // Reset module scope so tests don't leak into each other.
  setQueryAuthScope(null);
});

describe('queryKeys auth scoping (W1.6)', () => {
  it('keeps keys STABLE across token rotation for the same user', () => {
    setQueryAuthScope(USER_A);
    const k1 = queryKeys.bookings.list(TOKEN_A1, '2026-06-14');
    const k2 = queryKeys.bookings.list(TOKEN_A2, '2026-06-14');
    // Different raw tokens, same user → identical cache key (no orphaned cache).
    expect(k2).toEqual(k1);
  });

  it('isolates different users even with the same token value', () => {
    setQueryAuthScope(USER_A);
    const a = queryKeys.guests.detail(TOKEN_A1, 'guest-1');
    setQueryAuthScope(USER_B);
    const b = queryKeys.guests.detail(TOKEN_A1, 'guest-1');
    expect(b).not.toEqual(a);
  });

  it('embeds the stable user id (not the token) in the key', () => {
    setQueryAuthScope(USER_A);
    const key = queryKeys.dashboard.home(TOKEN_A1);
    expect(key).toContain(USER_A);
    expect(key).not.toContain(TOKEN_A1);
  });

  it('falls back to the token before a scope is set (cold start)', () => {
    setQueryAuthScope(null);
    const key = queryKeys.staff.me(TOKEN_A1);
    expect(key).toContain(TOKEN_A1);
  });

  it('falls back to null when neither scope nor token is present', () => {
    setQueryAuthScope(null);
    expect(queryKeys.services.list(null)).toEqual([...queryKeys.services.all(), null]);
  });

  it('still varies keys by their non-auth params', () => {
    setQueryAuthScope(USER_A);
    const monday = queryKeys.bookings.list(TOKEN_A1, '2026-06-15');
    const tuesday = queryKeys.bookings.list(TOKEN_A1, '2026-06-16');
    expect(tuesday).not.toEqual(monday);
  });
});
