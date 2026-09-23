import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { queryKeys } from '@/lib/queries/keys';
import type { ServicesSetupAvailability } from '@/lib/services-setup/types';

/**
 * Is "Set up with AI" offered to this admin? (web: `page.tsx` works it out on the server with
 * `servicesSetupAiEnabled()`; the app asks `GET /api/venue/services-setup`, web 2026-09-23.)
 *
 * - `offered: null` while the answer is on its way, so the button does not flash.
 * - A server from before that route (or a failed check) is taken as offered for an admin: the
 *   read route itself refuses with "not available right now" when the AI is switched off, so the
 *   worst case is that message rather than a missing feature.
 */
export function useServicesSetupAvailability(isAdmin: boolean): { offered: boolean | null } {
  const accessToken = useAccessToken();
  const enabled = isAdmin && isBackendConfigured() && Boolean(accessToken);
  const query = useQuery({
    queryKey: queryKeys.servicesSetup.availability(accessToken),
    queryFn: () => apiFetch<ServicesSetupAvailability>('/api/venue/services-setup', { accessToken }),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!isAdmin) return { offered: false };
  if (query.isError) return { offered: true };
  if (query.data) return { offered: query.data.enabled === true };
  return { offered: null };
}
