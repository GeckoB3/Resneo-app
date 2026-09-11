/**
 * The marketing flags a PATCH is about to write, applied to the cached contact
 * so the two toggles move the moment they are tapped.
 *
 * Without it the Switches are driven straight from the server copy: the tap
 * flips the control, React re-renders it from unchanged data, and it visibly
 * snaps back until the refetch lands. `useUpdateGuest` patches the cache here
 * and rolls back if the PATCH fails.
 *
 * The consent timestamp follows the route (`api/venue/guests/[guestId]`
 * PATCH ~560-590): a fresh consent is stamped now, a standing one keeps its
 * date, and withdrawing consent clears it.
 */
import type { GuestDetailResponse } from '@/types/guest-detail';

export interface MarketingPatchInput {
  marketing_consent?: boolean;
  marketing_opt_out?: boolean;
}

/** Does this update touch either marketing flag? */
export function touchesMarketing(input: MarketingPatchInput): boolean {
  return input.marketing_consent !== undefined || input.marketing_opt_out !== undefined;
}

export function applyGuestMarketingPatch(
  detail: GuestDetailResponse,
  input: MarketingPatchInput,
  now: string = new Date().toISOString(),
): GuestDetailResponse {
  if (!detail?.guest || !touchesMarketing(input)) return detail;

  const guest = detail.guest;
  let optOut = guest.marketing_opt_out;
  let consent = guest.marketing_consent;
  let consentAt = guest.marketing_consent_at;

  // The pair is one preference seen from two sides, so each side clears the
  // other unless the caller set both explicitly (web PATCH, same order).
  if (input.marketing_opt_out !== undefined) {
    optOut = input.marketing_opt_out;
    if (optOut && input.marketing_consent === undefined && consent) {
      consent = false;
      consentAt = null;
    }
  }
  if (input.marketing_consent !== undefined) {
    consent = input.marketing_consent;
    if (consent) {
      consentAt = guest.marketing_consent ? guest.marketing_consent_at ?? now : now;
      if (optOut && input.marketing_opt_out === undefined) optOut = false;
    } else {
      consentAt = null;
    }
  }

  return {
    ...detail,
    guest: {
      ...guest,
      marketing_consent: consent,
      marketing_opt_out: optOut,
      marketing_consent_at: consentAt,
    },
  };
}
