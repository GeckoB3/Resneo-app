import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  CreateServiceInput,
  ManagedServicesResponse,
  ProcessingTimeBlock,
  UpdateServiceInput,
} from '@/types/services-manage';

/**
 * Per-service booking-start tuning (web parity, `booking_interval_minutes` +
 * `booking_minute_marks`). Defined here rather than in `types/services-manage.ts`
 * so the write paths can carry the fields; the API accepts them on POST + PATCH
 * (`booking_interval_minutes` 1-60, `booking_minute_marks` ints 0-59 or null).
 * @see _reference/Resneo/src/lib/appointments/booking-interval.ts
 */
export interface BookingStartFields {
  /** Spacing (minutes, 1-60) of bookable start times, anchored to the top of the hour. */
  booking_interval_minutes?: number;
  /** Allowed start-minute offsets within the hour (0-59), or `null` for every interval mark. */
  booking_minute_marks?: number[] | null;
}

/** POST body — the create input plus the optional booking-start tuning. */
export type CreateServiceBody = CreateServiceInput & BookingStartFields;
/** PATCH body — the update input plus the optional booking-start tuning. */
export type UpdateServiceBody = UpdateServiceInput & BookingStartFields;

function invalidateServices(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
  // The public booking catalog mirrors service changes.
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
}

/** GET /api/venue/appointment-services — staff service list with variants + add-ons. */
export function useManagedServices() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.services.list(accessToken),
    enabled,
    queryFn: async (): Promise<ManagedServicesResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ManagedServicesResponse>('/api/venue/appointment-services', { accessToken });
    },
  });
}

/**
 * PATCH /api/venue/appointment-services — partial field update.
 * Never sends `variants`/`addon_group_links` (replace semantics on the API).
 */
export function useUpdateService() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateServiceBody): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/appointment-services', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateServices(queryClient),
  });
}

/** One variant row sent to PATCH — include `id` to preserve an existing option. */
export interface VariantWriteInput {
  id?: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  buffer_minutes?: number | null;
  price_pence?: number | null;
  deposit_pence?: number | null;
  is_active?: boolean;
  sort_order?: number;
  /**
   * Per-variant internal processing gaps. REPLACE semantics — the API resets
   * the column to [] when a variant omits this on save, so callers MUST send
   * the existing value back (the editor doesn't expose it for editing).
   */
  processing_time_blocks?: ProcessingTimeBlock[] | null;
}

/**
 * PATCH /api/venue/appointment-services with the FULL `variants` array.
 * The API replaces the set wholesale (admin only) — callers must always send
 * every variant that should remain, in display order.
 */
export function useReplaceServiceVariants() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; variants: VariantWriteInput[] }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/appointment-services', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({
          id: input.id,
          variants: input.variants.map((variant, index) => ({
            ...variant,
            sort_order: variant.sort_order ?? index,
          })),
        }),
      });
    },
    onSuccess: () => invalidateServices(queryClient),
  });
}

/**
 * PATCH /api/venue/appointment-services with the FULL `addon_group_links` array
 * (replace semantics, admin only) — links the service to add-on groups.
 */
export function useReplaceServiceAddonLinks() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; addonGroupIds: string[] }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/appointment-services', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({
          id: input.id,
          addon_group_links: input.addonGroupIds.map((addon_group_id, index) => ({
            addon_group_id,
            sort_order: index,
          })),
        }),
      });
    },
    onSuccess: () => invalidateServices(queryClient),
  });
}

/**
 * DELETE /api/venue/appointment-services — admin (or creator-staff).
 * The API returns 409 when upcoming bookings block deletion.
 */
export function useDeleteService() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/appointment-services', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => invalidateServices(queryClient),
  });
}

/** POST /api/venue/appointment-services — create a service with the basics. */
export function useCreateService() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateServiceBody): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/appointment-services', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateServices(queryClient),
  });
}
