/**
 * Regression guard for the new-booking "bounce back to the Calendar tab" bug.
 *
 * The app-level staff gate (app/(app)/_layout.tsx) renders a blocking loading
 * screen — unmounting the whole navigation <Stack>, including any pushed screen
 * such as the new-booking modal — whenever useStaffMe has no `data`. The query
 * key includes the Supabase access token, which rotates on the client's
 * periodic refresh. Without keepPreviousData, a refresh re-keys the query and
 * empties `data` until the refetch lands, which tore the booking flow down and
 * dropped the user back on the Calendar tab. This test pins the fix: the
 * profile must survive a token rotation.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

let mockToken: string | null = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {},
}));

import { useStaffMe } from '@/lib/queries/useStaffMe';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useStaffMe', () => {
  beforeEach(() => {
    mockToken = 'token-A';
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ staff_id: 'staff-1', first_name: 'A', role: 'owner' });
  });

  it('keeps the profile across an access-token refresh (no data gap)', async () => {
    const { result, rerender } = await renderHook(() => useStaffMe(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    // Supabase rotates the access token → the query re-keys. The profile must
    // remain defined on the very next render (the previous value, held as
    // placeholder) — never undefined, which is what the staff gate reads as
    // "not loaded yet" and uses to unmount the navigation Stack.
    mockToken = 'token-B';
    await rerender({});
    expect(result.current.data).toBeTruthy();

    // The new token does drive a background refetch (confirms the key changed),
    // and the profile stays present throughout.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeTruthy();
  });
});
