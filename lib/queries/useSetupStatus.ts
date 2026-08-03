import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** GET /api/venue/setup-status — onboarding checklist progress. */
export interface SetupStatus {
  setup_checklist_dismissed: boolean;
  /**
   * Optional steps this staff member snoozed with "Not now". Server-side rather
   * than on-device (unlike the tap-through nudges in `useClickedSetupSteps`) so
   * a snooze holds across devices and sign-outs. Absent on older deploys.
   */
  setup_checklist_snoozed_keys?: string[];
  onboarding_completed: boolean;
  profile_complete: boolean;
  availability_set: boolean;
  guest_booking_ready: boolean;
  stripe_connected: boolean;
  first_booking_made: boolean;
  is_admin: boolean;
  // Extended fields returned by backend (may be absent on older deploys)
  booking_model?: string;
  pricing_tier?: string | null;
  active_booking_models?: unknown;
  enabled_models?: unknown;
  secondary_event_catalog_ready?: boolean;
  secondary_class_catalog_ready?: boolean;
  secondary_resource_catalog_ready?: boolean;
}

export function useSetupStatus(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.dashboard.all(), 'setupStatus', keyScope(accessToken)],
    enabled: queryEnabled,
    queryFn: async (): Promise<SetupStatus> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<SetupStatus>('/api/venue/setup-status', { accessToken });
    },
  });
}

/**
 * POST /api/venue/setup-checklist-snooze — record "Not now" on an optional step
 * (admin). The server rejects any key that is not genuinely optional, so callers
 * must only pass one of `OPTIONAL_SETUP_STEP_KEYS`.
 */
export function useSnoozeSetupStep() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stepKey: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/setup-checklist-snooze', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ step_key: stepKey }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
    },
  });
}

/** POST /api/venue/setup-checklist-dismiss — hide the checklist (admin). */
export function useDismissSetupChecklist() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/setup-checklist-dismiss', {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
    },
  });
}
