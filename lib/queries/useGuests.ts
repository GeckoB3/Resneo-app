import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  ContactCustomFieldsResponse,
  GuestListParams,
  GuestListResponse,
} from '@/types/guest-list';

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

  // Identity scope filter (identified/all/anonymous)
  if (params.filter?.trim()) {
    searchParams.set('filter', params.filter.trim());
  }

  // Handle all segment options
  if (params.segment && params.segment !== 'all') {
    searchParams.set('segment', params.segment);

    // Tag segment
    if (params.segment === 'tag' && params.segmentTag?.trim()) {
      searchParams.set('segment_tag', params.segmentTag.trim());
    }

    // Date range (new, upcoming, visit, marketing, last_staff, last_service)
    if (params.date_from?.trim()) {
      searchParams.set('date_from', params.date_from.trim());
    }
    if (params.date_to?.trim()) {
      searchParams.set('date_to', params.date_to.trim());
    }

    // Marketing consent filter
    if (params.segment === 'marketing' && params.marketing?.trim()) {
      searchParams.set('marketing', params.marketing.trim());
    }

    // Last staff member
    if (params.segment === 'last_staff' && params.last_staff_id?.trim()) {
      searchParams.set('last_staff_id', params.last_staff_id.trim());
    }

    // Last service — the RPC returns zero rows when last_service_id is sent
    // without last_service_kind, so always pair them (web parity).
    if (params.segment === 'last_service' && params.last_service_id?.trim()) {
      searchParams.set('last_service_id', params.last_service_id.trim());
      if (params.last_service_kind) {
        searchParams.set('last_service_kind', params.last_service_kind);
      }
    }
  } else if (!params.segment && params.segmentTag?.trim()) {
    // Legacy support: segmentTag without segment
    searchParams.set('segment', 'tag');
    searchParams.set('segment_tag', params.segmentTag.trim());
  }

  // Opt-in: have rows carry per-contact custom_fields (used by the CSV export).
  if (params.include_custom_fields) {
    searchParams.set('include_custom_fields', '1');
  }

  return `/api/venue/guests?${searchParams.toString()}`;
}

/**
 * Paginated guest directory. Pass debounced search from the screen component.
 * Supports all segment types, identity scope filters, and date ranges.
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
      segmentTag: params.segmentTag ?? null,
      segment: params.segment ?? null,
      filter: params.filter ?? null,
      date_from: params.date_from ?? null,
      date_to: params.date_to ?? null,
      marketing: params.marketing ?? null,
      last_staff_id: params.last_staff_id ?? null,
      last_service_id: params.last_service_id ?? null,
      last_service_kind: params.last_service_kind ?? null,
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

/**
 * Venue custom client field definitions (GET /api/venue/contacts/custom-fields).
 * Used by the contacts CSV export to label and extract per-contact custom values.
 * Cached for a while — definitions change rarely.
 */
export function useGuestCustomFields() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.guests.all(), 'customFields', accessToken ?? null],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ContactCustomFieldsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ContactCustomFieldsResponse>('/api/venue/contacts/custom-fields', {
        accessToken,
      });
    },
  });
}
