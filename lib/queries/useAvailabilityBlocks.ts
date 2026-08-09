import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

// ---------------------------------------------------------------------------
// Types — mirrors the availability_blocks table schema exposed by the API.
// ---------------------------------------------------------------------------

export type BlockType = 'closed' | 'amended_hours' | 'reduced_capacity' | 'special_event';

export interface OverridePeriod {
  open: string;  // HH:mm
  close: string; // HH:mm
}

export interface YieldOverrides {
  max_bookings_per_slot?: number;
  slot_interval_minutes?: number;
  buffer_minutes?: number;
  duration_minutes?: number;
}

export interface AvailabilityBlock {
  id: string;
  venue_id: string;
  service_id: string | null;
  block_type: BlockType;
  date_start: string; // YYYY-MM-DD
  date_end: string;   // YYYY-MM-DD
  time_start: string | null;
  time_end: string | null;
  override_max_covers: number | null;
  reason: string | null;
  yield_overrides: YieldOverrides | null;
  override_periods: OverridePeriod[] | null;
}

export interface CreateBlockInput {
  service_id?: string | null;
  block_type: BlockType;
  date_start: string;
  date_end: string;
  time_start?: string | null;
  time_end?: string | null;
  override_max_covers?: number | null;
  reason?: string | null;
  yield_overrides?: YieldOverrides | null;
  override_periods?: OverridePeriod[] | null;
}

export interface PatchBlockInput {
  id: string;
  service_id?: string | null;
  block_type?: BlockType;
  date_start?: string;
  date_end?: string;
  time_start?: string | null;
  time_end?: string | null;
  override_max_covers?: number | null;
  reason?: string | null;
  yield_overrides?: YieldOverrides | null;
  override_periods?: OverridePeriod[] | null;
}

interface BlocksResponse {
  blocks: AvailabilityBlock[];
}

interface BlockResponse {
  block: AvailabilityBlock;
}

// ---------------------------------------------------------------------------
// Query-key additions (venue-scoped, access-token scoped).
// ---------------------------------------------------------------------------

/** Stable query key for the venue availability-blocks list. */
function availabilityBlocksKey(accessToken?: string | null) {
  return [...queryKeys.venue.all(), 'availabilityBlocks', keyScope(accessToken)] as const;
}

function invalidateBlocks(queryClient: ReturnType<typeof useQueryClient>, accessToken?: string | null) {
  void queryClient.invalidateQueries({ queryKey: availabilityBlocksKey(accessToken) });
  // Blocks affect the booking availability engine.
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /api/venue/availability-blocks — returns all blocks for the venue. */
export function useAvailabilityBlocks() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: availabilityBlocksKey(accessToken),
    enabled,
    queryFn: async (): Promise<AvailabilityBlock[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const res = await apiFetch<BlocksResponse>('/api/venue/availability-blocks', { accessToken });
      return res.blocks ?? [];
    },
  });
}

/**
 * Closures that cover existing bookings come back 409 with
 * `{ requires_confirmation, affected_count, message }` and NO `error` key, so
 * `getApiErrorMessage` cannot read it and the admin saw "Request failed (409)".
 * Re-send with this set once they have confirmed — same shape as the working-hours
 * editor, which has had the flow all along.
 */
/** POST /api/venue/availability-blocks — create a new block (admin only). */
export function useCreateBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CreateBlockInput & { acknowledge?: boolean },
    ): Promise<AvailabilityBlock> => {
      if (!accessToken) throw new Error('Missing access token');
      const { acknowledge, ...body } = input;
      const query = acknowledge ? '?acknowledge_affected_bookings=true' : '';
      const res = await apiFetch<BlockResponse>(`/api/venue/availability-blocks${query}`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(body),
      });
      return res.block;
    },
    onSuccess: () => invalidateBlocks(queryClient, accessToken),
  });
}

/** PATCH /api/venue/availability-blocks — update an existing block (admin only). */
export function usePatchBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: PatchBlockInput & { acknowledge?: boolean },
    ): Promise<AvailabilityBlock> => {
      if (!accessToken) throw new Error('Missing access token');
      const { acknowledge, ...body } = input;
      const query = acknowledge ? '?acknowledge_affected_bookings=true' : '';
      const res = await apiFetch<BlockResponse>(`/api/venue/availability-blocks${query}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return res.block;
    },
    onSuccess: () => invalidateBlocks(queryClient, accessToken),
  });
}

/** DELETE /api/venue/availability-blocks — remove a block by id (admin only). */
export function useDeleteBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!accessToken) throw new Error('Missing access token');
      await apiFetch<unknown>('/api/venue/availability-blocks', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => invalidateBlocks(queryClient, accessToken),
  });
}
