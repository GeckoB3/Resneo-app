import { ApiError, apiErrorCode, apiFetch, isApiErrorBody } from '@/lib/api/client';
import type {
  DismissiblePromptKey,
  PosFeatureSwitchesResponse,
  PosFeatureSwitchRequest,
  PosFeatureSwitchResult,
  PosSwitchBlockingItem,
  PosSwitchUnavailableReason,
} from '@/types/pos-switches';

/**
 * The switch routes over Bearer (contract: the web's `src/lib/pos/switches/types.ts`). They sit
 * outside `/api/venue/pos/`, because every route there refuses while Checkout is off, so they go
 * through the plain `apiFetch` and carry no POS headers.
 */
export const switchPaths = {
  /** GET the state (admins only) and POST a change. */
  switches: '/api/venue/feature-switches',
  /** The gift vouchers and credit with money left, for the off sheet's "Download the list". */
  vouchersCsv: '/api/venue/feature-switches/vouchers.csv',
  /** Hide a prompt for this staff member (`DISMISS_PROMPT_PATH` on the web). */
  dismiss: '/api/venue/prompts/dismiss',
} as const;

export function fetchFeatureSwitches(accessToken: string): Promise<PosFeatureSwitchesResponse> {
  return apiFetch<PosFeatureSwitchesResponse>(switchPaths.switches, { accessToken });
}

export function postFeatureSwitch(accessToken: string, body: PosFeatureSwitchRequest): Promise<PosFeatureSwitchResult> {
  return apiFetch<PosFeatureSwitchResult>(switchPaths.switches, {
    accessToken,
    method: 'POST',
    body: JSON.stringify(body),
    // Switching on writes four keys and a history row in one transaction; give it room.
    timeoutMs: 30_000,
  });
}

export function postDismissPrompt(accessToken: string, key: DismissiblePromptKey): Promise<unknown> {
  return apiFetch<unknown>(switchPaths.dismiss, { accessToken, method: 'POST', body: JSON.stringify({ key }) });
}

/** What a refused POST means, read from its code (never from the sentence). */
export type SwitchRefusal =
  | { kind: 'not_admin' }
  | { kind: 'not_available'; reason: PosSwitchUnavailableReason | null; publicReason: string | null }
  | { kind: 'in_use'; blocking: PosSwitchBlockingItem[] }
  | { kind: 'needs_ack'; needs: ('terms' | 'stored_value_outstanding')[] }
  | { kind: 'stale'; switches: PosFeatureSwitchesResponse | null }
  /** No answer came back (offline, timed out): the same request may be sent again. */
  | { kind: 'network' }
  /** Anything else: the server's own sentence when it sent one. */
  | { kind: 'other'; message: string | null; status: number | null };

/**
 * Whether a retry sends the same `client_request_id` (the web keeps it only across a network
 * failure): no answer, or a server error that may have been recorded, replays the first result.
 * Any refusal took nothing, so the next try is a new request.
 */
export function switchKeepsRequestId(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 0 || error.status === 408) return true;
  return error.status >= 500 && error.status !== 502;
}

const UNAVAILABLE_REASONS: readonly PosSwitchUnavailableReason[] = [
  'not_offered',
  'blocked',
  'environment',
  'plan',
  'currency',
  'billing',
  'onboarding',
  'needs_checkout',
];

function asReason(value: unknown): PosSwitchUnavailableReason | null {
  return typeof value === 'string' && (UNAVAILABLE_REASONS as readonly string[]).includes(value)
    ? (value as PosSwitchUnavailableReason)
    : null;
}

function asBlocking(value: unknown): PosSwitchBlockingItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is PosSwitchBlockingItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as PosSwitchBlockingItem).sale_id === 'string' &&
      ((item as PosSwitchBlockingItem).kind === 'card_payment_in_progress' ||
        (item as PosSwitchBlockingItem).kind === 'sale_waiting_on_phone'),
  );
}

/** Reads a failed POST into what the sheet does next. */
export function readSwitchRefusal(error: unknown): SwitchRefusal {
  if (!(error instanceof ApiError)) return { kind: 'other', message: null, status: null };
  if (error.status === 0 || error.status === 408) return { kind: 'network' };
  const body = (error.body ?? {}) as Record<string, unknown>;
  const code = apiErrorCode(error);
  if (error.status === 403 && (code === 'not_admin' || body.error === 'not_admin')) return { kind: 'not_admin' };
  if (code === 'SWITCH_NOT_AVAILABLE') {
    return {
      kind: 'not_available',
      reason: asReason(body.reason),
      publicReason: typeof body.public_reason === 'string' && body.public_reason.trim() ? body.public_reason : null,
    };
  }
  if (code === 'SWITCH_IN_USE') return { kind: 'in_use', blocking: asBlocking(body.blocking) };
  if (code === 'SWITCH_NEEDS_ACKNOWLEDGEMENT') {
    const needs = Array.isArray(body.needs)
      ? body.needs.filter((n): n is 'terms' | 'stored_value_outstanding' => n === 'terms' || n === 'stored_value_outstanding')
      : [];
    return { kind: 'needs_ack', needs };
  }
  if (code === 'SWITCH_STALE') {
    const fresh = body.switches;
    return {
      kind: 'stale',
      switches: typeof fresh === 'object' && fresh !== null && 'switches' in fresh ? (fresh as PosFeatureSwitchesResponse) : null,
    };
  }
  // A bare 403 is the admin check; a coded one (a billing lapse) keeps its own sentence.
  if (error.status === 403 && code === null) return { kind: 'not_admin' };
  // A server error's words ("Internal server error") help nobody: the caller says it plainly.
  const message = error.status >= 500 ? null : error.message.trim() ? error.message : isApiErrorBody(error.body) ? error.body.error : null;
  return { kind: 'other', message, status: error.status };
}
