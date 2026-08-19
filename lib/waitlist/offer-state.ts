/**
 * Whether a waitlist entry can be offered a slot — the tri-state both repos now
 * depend on.
 *
 * `can_offer` is deliberately three-valued, and the distinction is load-bearing:
 *
 *  - `true`  — a slot resolved; offer freely.
 *  - `false` — the check ran and found nothing; the Offer button is disabled and
 *              `offer_unavailable_reason` explains why.
 *  - unset   — the check did NOT run. Either the entry never qualified for one
 *              (not an appointment, or not `waiting`), or a schedule read failed
 *              and the server reported `offer_check_failed`.
 *
 * **Only an explicit `false` may disable the button.** A failed read used to
 * come back as `false` with "No matching availability.", which told staff
 * something untrue and took away their ability to act on it. The server now
 * leaves the flag unset instead, so this rule is what makes that fix work — on
 * every already-shipped app build, because unset has always failed safe here.
 *
 * Leaving the button enabled on `unchecked` is safe because the offer path
 * re-validates: `offerAppointmentWaitlistEntryManually` resolves a slot and
 * answers **409** when none exists. `can_offer` is advisory in front of a gate
 * that re-checks, which is also why this route degrades per ENTRY rather than
 * returning a 503 for the whole list.
 *
 * @see Docs/R20-1_APP_REPLY_2.md — why per-entry beat fail-closed here.
 */
import type { WaitlistEntry } from '@/types/waitlist';

export type WaitlistOfferState =
  /** A slot resolved, or no check was needed — the Offer button is live. */
  | 'offerable'
  /** The check ran and found nothing — disabled, with a reason to show. */
  | 'blocked'
  /** The check could not run — live, but say so. */
  | 'unchecked';

export function waitlistOfferState(
  entry: Pick<WaitlistEntry, 'can_offer' | 'offer_check_failed'>,
  isWaiting: boolean,
): WaitlistOfferState {
  if (!isWaiting) return 'offerable';
  // Checked FIRST: a server that sets both has failed a read, and the stale
  // `false` must not win. Belt and braces — it should never send both.
  if (entry.offer_check_failed) return 'unchecked';
  return entry.can_offer === false ? 'blocked' : 'offerable';
}
