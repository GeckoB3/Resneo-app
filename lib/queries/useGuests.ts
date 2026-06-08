import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { GuestListParams, GuestListResponse } from '@/types/guest-list';

function buildGuestListPath(params: GuestListParams): string {
  const searchParams = new URLSearchParams();
  const page = params.page ?? 0;
  const limit = params.limit ?? 30;

  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  searchParams.set('sort', params.sort ?? 'last_visit_desc');

  if (params.search?.trim()) {
    searchParams.set('search', params.search.trim());
  }

  return `/api/venue/guests?${searchParams.toString()}`;
}

/**
 * Paginated guest directory. Pass debounced search from the screen component.
 */
export function useGuests(params: GuestListParams) {
  const accessToken = useAccessToken();
  const search = params.search?.trim() ?? '';
  const enabled =
    isBackendConfigured() &&
    accessToken !== null &&
    (search.length === 0 || search.length >= 2);

  return useQuery({
    queryKey: queryKeys.guests.list(accessToken, {
      search,
      page: params.page ?? 0,
      limit: params.limit ?? 30,
      sort: params.sort ?? 'last_visit_desc',
    }),
    enabled,
    // Keep the previous results on screen while a new search term loads, so the
    // list narrows smoothly instead of flashing a spinner on every keystroke.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GuestListResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<GuestListResponse>(buildGuestListPath(params), { accessToken });
    },
  });
}
