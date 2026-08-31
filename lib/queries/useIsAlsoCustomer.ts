import { useCustomerVenueRelationships } from '@/lib/queries/useCustomerVenues';
import { useRole } from '@/lib/queries/useRole';

/**
 * Whether this staff member is ALSO somebody's customer.
 *
 * The web decides where to send a person from two facts, `hasStaff` and
 * `hasGuest`, and shows a chooser when both are true and no preference is set.
 * This app has only had the first: a 401 from `staff/me` says somebody is not
 * staff, and nothing said whether a staff member also books things elsewhere.
 * `GET /api/v1/me/venues` returns one row per venue the caller is known at,
 * which is exactly the missing fact.
 *
 * **This deliberately does NOT feed the routing decision.** `useAppMode` keeps
 * the two inputs it has. Adding a third asynchronous input to the guard
 * sequence is what produced the bug where a customer's first frame said
 * "staff", mounted the venue navigator and 401'd; the cost of getting it wrong
 * there is a mounted navigator, and the cost of getting it wrong here is a
 * prompt that does not appear. So the question is asked AFTER the person has
 * landed, and its answer only ever offers them a door.
 *
 * Only asked of staff. A confirmed customer has no other side to be offered,
 * and an unresolved role has no landing to prompt over yet.
 */
export function useIsAlsoCustomer() {
  const role = useRole();
  // Shares the profile screen's request rather than issuing a second one; the
  // two ask the same question of the same endpoint.
  const query = useCustomerVenueRelationships(role === 'staff');

  return {
    /**
     * True only on a positive answer.
     *
     * A failed or pending read is NOT "no". It is "we do not know", and the
     * prompt simply stays away: offering nothing is the safe direction, whereas
     * offering a door to an account somebody does not have is a dead end.
     */
    isAlsoCustomer: (query.data?.venues?.length ?? 0) > 0,
    isResolved: query.isSuccess,
  };
}
