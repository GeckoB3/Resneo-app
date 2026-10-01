/**
 * Deleting a host's service that is on the collective page (web QA D-9, R44-1).
 *
 * Such a service has to come off the page before it can be deleted. The app
 * used to take it off first and delete second, so a delete the server then
 * refused (the service has upcoming bookings) had already parked a live
 * service: guests and staff could no longer book it, and the member venues'
 * copies were retired, by a delete that "did nothing".
 *
 * The order is now: ask, take off, delete.
 *
 *  1. `DELETE /api/venue/appointment-services?dry_run=true` runs the real
 *     delete's own checks and removes nothing. A refusal stops here with the
 *     server's sentence and NOTHING has changed.
 *  2. Only then does the service come off the page.
 *  3. Then the real delete. If that still fails, the service is off the page
 *     and not deleted, and the caller is told exactly that. It is never put
 *     back automatically: taking off and putting on are collective engine
 *     operations with effects at the member venues.
 *
 * A web release before 2026-10-01 ignores `dry_run` and runs a real delete.
 * Two answers give that away, and both are safe to act on:
 *  - 409 `COLLECTIVE_OFFERED_SERVICE`: the engine refused to delete a service
 *    still on the page. That refusal sits behind the route's own checks, so
 *    they passed, which is all the dry run asks: carry on as before.
 *  - 200 without `dry_run: true`: the service was really deleted (it was not
 *    on the page after all). Nothing is left to do.
 *
 * @see C:\Resneo\src\app\dashboard\appointment-services\AppointmentServicesView.tsx (confirmDeleteService)
 */
import { ApiError, apiErrorCode } from '@/lib/api/client';

/** The engine's refusal to delete a host's service that is still on the page (RN002). */
const OFFERED_SERVICE_CODE = 'COLLECTIVE_OFFERED_SERVICE';

/** The three requests, in the order they are made. Each rejects with an `ApiError` on refusal. */
export interface CollectiveServiceDeleteSteps {
  /** `DELETE /api/venue/appointment-services?dry_run=true` */
  checkDelete: () => Promise<unknown>;
  /** `DELETE /api/venue/collectives/[id]/offerings/[itemId]` */
  takeOffPage: () => Promise<unknown>;
  /** `DELETE /api/venue/appointment-services` */
  deleteService: () => Promise<unknown>;
}

export type CollectiveServiceDeleteOutcome =
  /** Gone. */
  | { status: 'deleted' }
  /**
   * The server would refuse the delete, or the service could not come off the
   * page. Nothing changed. `error` is what was thrown, for a caller with its
   * own wording.
   */
  | { status: 'refused'; message: string; error: unknown }
  /** Off the page, and the delete then failed: `reason` is why, as a sentence. */
  | { status: 'parked_not_deleted'; reason: string; error: unknown };

const CHECK_FAILED = 'We could not check whether this service can be deleted. Please try again.';
const OFF_PAGE_FAILED = 'Could not take the service off the page. Please try again.';
const DELETE_FAILED = 'Please try again.';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message.trim() !== '' ? error.message : fallback;
}

/** True when the dry run answered as the real route does: `{ dry_run: true, ... }`. */
function isDryRunAnswer(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { dry_run?: unknown }).dry_run === true;
}

/** Ask, take off the page, delete. See the file header for each step's failure. */
export async function deleteServiceOnCollectivePage(
  steps: CollectiveServiceDeleteSteps,
): Promise<CollectiveServiceDeleteOutcome> {
  try {
    const answer = await steps.checkDelete();
    // An older server ignored `dry_run` and deleted it for real.
    if (!isDryRunAnswer(answer)) return { status: 'deleted' };
  } catch (error) {
    // An older server ran the real delete; its own checks passed (see header).
    if (apiErrorCode(error) !== OFFERED_SERVICE_CODE) {
      return { status: 'refused', message: messageOf(error, CHECK_FAILED), error };
    }
  }

  try {
    await steps.takeOffPage();
  } catch (error) {
    return { status: 'refused', message: messageOf(error, OFF_PAGE_FAILED), error };
  }

  try {
    await steps.deleteService();
  } catch (error) {
    return { status: 'parked_not_deleted', reason: messageOf(error, DELETE_FAILED), error };
  }
  return { status: 'deleted' };
}

/** A delete that failed after the service had already come off the collective page. */
export function deletedHalfwayMessage(
  serviceName: string,
  collectiveName: string | null | undefined,
  reason: string,
): string {
  const why = reason.trim();
  const sentence = why === '' || /[.!?]$/.test(why) ? why : `${why}.`;
  return `${serviceName} has been taken off the ${collectiveName?.trim() || 'collective'} page, but it was not deleted. ${sentence} It is still in your list as a parked service. To keep taking bookings for it, put it back on the page.`
    .replace(/\s{2,}/g, ' ');
}
