import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingNextCharge {
  amount_pence: number | null;
  currency: string | null;
  formatted: string | null;
}

export interface BillingDiscountSummary {
  description: string;
  amount_pence: number | null;
  currency: string | null;
  formatted: string | null;
}

export interface BillingQuotePayload {
  next_charge: BillingNextCharge | null;
  invoice_subtotal: BillingNextCharge | null;
  invoice_discount_total: BillingNextCharge | null;
  discount_summaries: BillingDiscountSummary[];
  coupon_titles: string[];
}

export type PlanStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelling'
  | 'cancelled'
  | 'incomplete'
  | null;

/**
 * How the venue's access is paid for. Mirrors the web
 * `lib/billing/billing-access-source.ts`: `'stripe'` (normal subscription) or
 * `'superuser_free'` (comped by a platform superuser — no ResNeo charges).
 *
 * NOTE: the live `GET /api/venue/billing/status` route does NOT currently return
 * this field — on the web it is read from the DB in the SSR Settings page and
 * passed as a prop, not surfaced through this Bearer endpoint. It is declared
 * here (optional) so the Plan screen can render the complimentary-access branch
 * the moment the backend starts including it; until then it stays `undefined`.
 */
export type BillingAccessSource = 'stripe' | 'superuser_free';

/** True when the venue's access is a platform superuser comp (no charges). */
export function isSuperuserFreeBillingAccess(source: string | null | undefined): boolean {
  return (source ?? '').toLowerCase().trim() === 'superuser_free';
}

export interface BillingStatus {
  venue_id: string;
  pricing_tier: string;
  plan_status: PlanStatus;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  subscription_current_period_start: string | null;
  subscription_current_period_end: string | null;
  calendar_count: number | null;
  billing_quote: BillingQuotePayload;
  has_default_payment_method: boolean;
  /**
   * Optional — see {@link BillingAccessSource}. Not returned by the current
   * status route; present defensively for the complimentary-access copy.
   */
  billing_access_source?: BillingAccessSource | string | null;
}

export interface StripeConnectStatus {
  connected: true;
  charges_enabled: boolean;
  details_submitted: boolean;
}

export interface AppointmentsPlanPreview {
  current_tier: string;
  target_tier: string;
  is_upgrade: boolean;
  proration_behavior: string;
  amount_due: { amount_pence: number; currency: string; formatted: string };
  proration_total: { amount_pence: number; currency: string; formatted: string };
  total: { amount_pence: number; currency: string; formatted: string };
  subtotal: { amount_pence: number; currency: string; formatted: string };
  proration_lines: {
    description: string | null;
    amount_pence: number;
    currency: string;
    formatted: string;
  }[];
}

// ---------------------------------------------------------------------------
// Query keys (local — not shared with keys.ts to keep this domain independent)
// ---------------------------------------------------------------------------

export const billingKeys = {
  all: ['billing'] as const,
  status: (accessToken?: string | null) =>
    [...billingKeys.all, 'status', accessToken ?? null] as const,
  stripeConnect: (accessToken?: string | null) =>
    [...billingKeys.all, 'stripeConnect', accessToken ?? null] as const,
};

// ---------------------------------------------------------------------------
// GET /api/venue/billing/status
// ---------------------------------------------------------------------------

/**
 * Live billing status from Stripe. staleTime: 0 ensures a fresh hit every
 * time the Plan screen mounts (or re-focusses after Stripe portal return).
 * Admin-only on the server — will 403 for non-admins.
 */
export function useBillingStatus(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: billingKeys.status(accessToken),
    enabled: queryEnabled,
    staleTime: 0,
    gcTime: 30_000,
    queryFn: async (): Promise<BillingStatus> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<BillingStatus>('/api/venue/billing/status', { accessToken });
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/venue/stripe-connect
// ---------------------------------------------------------------------------

export function useStripeConnect(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: billingKeys.stripeConnect(accessToken),
    enabled: queryEnabled,
    staleTime: 0,
    gcTime: 30_000,
    queryFn: async (): Promise<StripeConnectStatus | null> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        return await apiFetch<StripeConnectStatus>('/api/venue/stripe-connect', { accessToken });
      } catch (err: unknown) {
        // 404 means no Stripe account linked — treat as null (not_connected)
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
          return null;
        }
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/billing/portal-session
// ---------------------------------------------------------------------------

export interface PortalSessionResponse {
  url: string;
}

export function useBillingPortalSession() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (): Promise<PortalSessionResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<PortalSessionResponse>('/api/billing/portal-session', {
        accessToken,
        method: 'POST',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/venue/stripe-connect
// ---------------------------------------------------------------------------

export interface StripeConnectLinkResponse {
  url: string;
}

export function useStripeConnectLink() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (): Promise<StripeConnectLinkResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<StripeConnectLinkResponse>('/api/venue/stripe-connect', {
        accessToken,
        method: 'POST',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/venue/change-plan  { action: 'resume_subscription' | 'resubscribe' }
// ---------------------------------------------------------------------------

export interface ChangePlanResponse {
  ok?: boolean;
  redirect_url?: string;
  message?: string;
}

export function useChangePlan() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: 'resume_subscription' | 'resubscribe'): Promise<ChangePlanResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<ChangePlanResponse>('/api/venue/change-plan', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.status(accessToken) });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/venue/appointments-plan/preview
// ---------------------------------------------------------------------------

export function useAppointmentsPlanPreview() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (target_tier: string): Promise<AppointmentsPlanPreview> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<AppointmentsPlanPreview>('/api/venue/appointments-plan/preview', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ target_tier }),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/venue/appointments-plan/change
// ---------------------------------------------------------------------------

export interface AppointmentsPlanChangeResponse {
  ok: boolean;
  plan_status: string;
  pricing_tier: string;
  message: string;
}

export function useAppointmentsPlanChange() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target_tier: string): Promise<AppointmentsPlanChangeResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<AppointmentsPlanChangeResponse>('/api/venue/appointments-plan/change', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ target_tier }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.status(accessToken) });
      // Also invalidate the venue bootstrap so the tier shows correctly elsewhere
      void queryClient.invalidateQueries({ queryKey: ['reserveNI', 'venue'] });
    },
  });
}
