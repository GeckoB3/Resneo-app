/**
 * GET /api/venue/cards/reader-save?guest_id= (web card-on-file-plan §4.12, §6.7): whether this
 * business can save a card on its reader for the client, and the reach words for each option.
 * Null on an older server without the route, so the reader options stay hidden.
 * `READER_SAVE_OTHER_BUSINESS` for a client this business does not keep (a partner's), so the
 * sheet can say why the reader is not offered.
 */
import { useQuery } from '@tanstack/react-query';

import { readerSaveApi, type READER_SAVE_OTHER_BUSINESS, type ReaderSaveOptions } from '@/lib/cards/reader-save';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export function useReaderSaveOptions(guestId: string | null | undefined, enabled: boolean) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...queryKeys.guests.all(), 'reader-save-options', keyScope(accessToken), guestId ?? null] as const,
    enabled: enabled && isBackendConfigured() && accessToken !== null && Boolean(guestId),
    queryFn: async (): Promise<ReaderSaveOptions | typeof READER_SAVE_OTHER_BUSINESS | null> => {
      try {
        return await readerSaveApi(accessToken!).options(guestId!);
      } catch {
        // The screen, code and message still work without the reader options.
        return null;
      }
    },
    staleTime: 30_000,
  });
}
