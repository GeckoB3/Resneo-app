import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { ServiceOverridePatch } from '@/lib/services/service-override';

/**
 * PATCH /api/venue/practitioner-service-overrides — upsert a non-admin staff
 * member's per-calendar field overrides for one service (Bearer via B1). The
 * backend rejects fields whose `staff_may_customize_*` flag is off, so the
 * caller MUST only send permitted fields (see `buildServiceOverridePatch`). When
 * the staff member manages several calendars the body carries `calendar_id`.
 *
 * Body shape (confirmed from the route's zod schema):
 *   { service_id, calendar_id?, custom_name?, custom_description?,
 *     custom_duration_minutes?, custom_buffer_minutes?, custom_price_pence?,
 *     custom_deposit_pence?, custom_colour? }
 * Each `custom_*` is the value, or `null` to clear that override.
 *
 * @see C:\Resneo\src\app\api\venue\practitioner-service-overrides\route.ts (PATCH)
 */
export function useUpdateServiceOverride() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ServiceOverridePatch): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/practitioner-service-overrides', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      // Overrides ride on the practitioner_services links in the service list,
      // and change the public catalog's effective service definition.
      void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
    },
  });
}
