/**
 * C3: reading and changing what the customer already holds.
 *
 * These paths are `/api/account/*` rather than `/api/v1/me/*`, which is D3 and
 * not an oversight: none of the commerce family is aliased, and the web's own
 * C7b rule says a one-line re-export cannot hold a shape stable anyway. Pinning
 * the paths here means a well-meaning tidy-up that "fixes" them to v1 fails
 * loudly instead of 404ing in somebody's hands.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

const {
  useMemberships,
  useCredits,
  useCourses,
  useRecurring,
  useCancelMembership,
  useResumeMembership,
  useCancelCourse,
  useEnrollInCourse,
  useCancelRecurring,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('./useCustomerPasses') as typeof import('./useCustomerPasses');

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

const lastPath = () => String(mockApiFetch.mock.calls.at(-1)?.[0]);
const lastBody = () => JSON.parse((mockApiFetch.mock.calls.at(-1)?.[1] as { body?: string })?.body ?? '{}');

describe('the four reads, on their unaliased paths (D3)', () => {
  // Typed as a bare read, because the four return different payload shapes and
  // this case only cares which path was asked for.
  const reads: [string, () => unknown, string][] = [
    ['memberships', () => useMemberships(), '/api/account/memberships'],
    ['credits', () => useCredits(), '/api/account/credits'],
    ['courses', () => useCourses(), '/api/account/courses'],
    ['recurring', () => useRecurring(), '/api/account/class-recurring'],
  ];

  it.each(reads)('%s reads %s', async (_label, hook, path) => {
    await renderHook(hook, { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(lastPath()).toBe(path);
  });

  it('sends the caller’s token, since these answer only about them', async () => {
    await renderHook(() => useMemberships(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect((mockApiFetch.mock.calls[0][1] as { accessToken?: string }).accessToken).toBe('token-A');
  });

  it('keeps its own cache key per surface, so one read does not serve another', async () => {
    /*
      All four are caller-scoped reads taking no parameters, so a shared key
      would make the credits section render the memberships payload. Asserting
      that two paths were requested does NOT catch that, because both still are;
      a sweep proved it. What catches it is asking each hook what it came back
      with.
    */
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        String(path).includes('credits')
          ? { balances: [{ id: 'b-1' }] }
          : { memberships: [{ id: 'm-1' }] },
      ),
    );

    const { result: memberships } = await renderHook(() => useMemberships(), { wrapper });
    const { result: credits } = await renderHook(() => useCredits(), { wrapper });

    await waitFor(() => expect(memberships.current.data).toBeDefined());
    await waitFor(() => expect(credits.current.data).toBeDefined());

    expect(memberships.current.data?.memberships?.[0]?.id).toBe('m-1');
    expect(credits.current.data?.balances?.[0]?.id).toBe('b-1');
  });
});

describe('the actions send what the routes read', () => {
  it('cancels a membership by id', async () => {
    const { result } = await renderHook(() => useCancelMembership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ membershipId: 'm-1' });
    });
    expect(lastPath()).toBe('/api/account/memberships/cancel');
    expect(lastBody()).toEqual({ membership_id: 'm-1' });
  });

  it('resumes a membership by id, on its own route', async () => {
    /*
      A separate route from cancel, not a flag on it. Resuming clears a pending
      cancellation on a subscription that is still running; it cannot charge
      anybody, and once Stripe reports the subscription cancelled the server
      refuses, because reviving it would be a purchase.
    */
    const { result } = await renderHook(() => useResumeMembership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ membershipId: 'm-1' });
    });
    expect(lastPath()).toBe('/api/account/memberships/resume');
    expect(lastBody()).toEqual({ membership_id: 'm-1' });
  });

  it('leaves a course by enrollment, not by course', async () => {
    // The enrollment is the customer's row; the course is the venue's. Sending
    // the wrong one is the difference between leaving and trying to delete a
    // venue's course.
    const { result } = await renderHook(() => useCancelCourse(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ enrollmentId: 'e-1' });
    });
    expect(lastPath()).toBe('/api/account/courses/cancel');
    expect(lastBody()).toEqual({ enrollment_id: 'e-1' });
  });

  it('enrols with credits already held, which needs no card', async () => {
    const { result } = await renderHook(() => useEnrollInCourse(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ courseId: 'c-1', venueId: 'v-1' });
    });
    expect(lastPath()).toBe('/api/account/courses/enroll');
    expect(lastBody()).toEqual({ course_id: 'c-1', venue_id: 'v-1' });
  });
});

describe('what a change refreshes', () => {
  it('refreshes the customer surface, because a membership shows on the hub too', async () => {
    /*
      The hub carries membership and credit summaries. Refreshing only the
      memberships list would leave the hub saying two active memberships after
      one was cancelled.
    */
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCancelMembership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ membershipId: 'm-1' });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k?.includes('customer'))).toBe(true);
  });

  it('does NOT refresh when the change failed', async () => {
    // Refetching after a failure tells the customer nothing and makes a failed
    // cancellation look as though something happened.
    mockApiFetch.mockRejectedValueOnce(new Error('network'));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCancelMembership(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ membershipId: 'm-1' })).rejects.toThrow();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('stopping a standing weekly reservation (C7)', () => {
  it('DELETEs the rule by id, encoded', async () => {
    const { result } = await renderHook(() => useCancelRecurring(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('r 1/2');
    });
    expect(lastPath()).toBe('/api/account/class-recurring/r%201%2F2');
    expect((mockApiFetch.mock.calls.at(-1)?.[1] as { method: string }).method).toBe('DELETE');
  });

  it('refreshes, because the rule is gone from every list showing it', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCancelRecurring(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('r-1');
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('does NOT refresh when the delete failed', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network'));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCancelRecurring(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('r-1')).rejects.toThrow();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
