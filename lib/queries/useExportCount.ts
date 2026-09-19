import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export type ExportKind = 'bookings' | 'contacts' | 'services';

/** The query string for `GET /api/venue/export`, without the format. */
export function exportQuery(kind: ExportKind, range: { from: string; to: string } | null): string {
  const p = new URLSearchParams({ type: kind });
  if (range) {
    p.set('from', range.from);
    p.set('to', range.to);
  }
  return p.toString();
}

/**
 * GET /api/venue/export?...&count=1 (web 2026-09-19): how many rows the choice covers, so the
 * button can say "Download 142 appointments" and a range with nothing in it is not downloaded.
 */
export function useExportCount(kind: ExportKind, range: { from: string; to: string } | null, enabled = true) {
  const accessToken = useAccessToken();
  const query = exportQuery(kind, range);
  return useQuery({
    queryKey: queryKeys.reports.exportCount(accessToken, query),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    staleTime: 15_000,
    queryFn: async (): Promise<number> => {
      if (!accessToken) throw new Error('Missing access token');
      const res = await apiFetch<{ count?: number }>(`/api/venue/export?${query}&count=1`, { accessToken });
      return typeof res.count === 'number' ? res.count : 0;
    },
  });
}
