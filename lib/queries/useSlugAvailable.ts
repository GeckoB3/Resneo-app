import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

interface SlugAvailableResponse {
  slug: string;
  available: boolean;
}

/**
 * GET /api/venue/slug-available?slug=<value>
 * Admin only. Checks whether a booking-page slug is free for this venue.
 * Pass null/undefined slug to skip (enabled=false).
 */
export function useSlugAvailable(slug: string | null | undefined) {
  const accessToken = useAccessToken();
  const norm = slug?.trim().toLowerCase() ?? '';
  const enabled = Boolean(norm && /^[a-z0-9-]{1,100}$/.test(norm) && accessToken);

  return useQuery({
    queryKey: [...queryKeys.venue.all(), 'slugAvailable', norm, keyScope(accessToken)] as const,
    enabled,
    queryFn: async (): Promise<SlugAvailableResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<SlugAvailableResponse>(
        `/api/venue/slug-available?slug=${encodeURIComponent(norm)}`,
        { accessToken },
      );
    },
    // Stale immediately — slug availability is highly time-sensitive
    staleTime: 0,
    gcTime: 30_000,
  });
}
