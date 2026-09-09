import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { OverrideDryRunBody } from '@/lib/booking/availability-override';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * What the dry run answers. Engine refusals come back as `200 { ok: false,
 * error }`, never as a 4xx (only the actor check does that), so a caller
 * branches on `ok`, not on status.
 */
export type ValidateAppointmentSlotResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; error?: string };

/**
 * POST /api/booking/validate-appointment-slot — the override's dry run (web
 * #187): the same engine as the create, in collect mode, so the review step
 * can show the server's own reasons ("Outside working hours", "Conflicts with
 * another booking", "Ann does not usually offer Colour") before anything is
 * written. Sent with the Bearer: the route needs a staff session for the flag.
 */
export function useValidateAppointmentSlot() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (body: OverrideDryRunBody): Promise<ValidateAppointmentSlotResult> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<ValidateAppointmentSlotResult>('/api/booking/validate-appointment-slot', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  });
}
