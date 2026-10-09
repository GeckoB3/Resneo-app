import { useCallback } from 'react';

import { apiFetch } from '@/lib/api/client';
import { posHeaders } from '@/lib/pos/api';
import { settingsMorePaths } from '@/lib/pos/settings-more/api';
import { SM_COPY } from '@/lib/pos/settings-more/copy';
import type { LoyaltyProgrammeResponse } from '@/lib/pos/settings-more/types';
import { usePosGate } from '@/lib/queries/usePos';

/**
 * `PUT /api/venue/pos/loyalty/programme` with the POS headers and the Bearer token. The route takes
 * PUT, which `posFetch`'s method list leaves out, so this sends it through `apiFetch` with the same
 * headers `posFetch` adds. Refusals throw the same `ApiError`.
 */
export function useLoyaltyPut() {
  const { accessToken } = usePosGate();
  return useCallback(
    (body: Record<string, unknown>): Promise<LoyaltyProgrammeResponse> => {
      if (!accessToken) return Promise.reject(new Error(SM_COPY['common.networkError']));
      return apiFetch<LoyaltyProgrammeResponse>(settingsMorePaths.loyaltyProgramme, {
        accessToken,
        method: 'PUT',
        headers: posHeaders(),
        body: JSON.stringify(body),
      });
    },
    [accessToken],
  );
}
