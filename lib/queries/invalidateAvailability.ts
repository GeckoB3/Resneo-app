import type { QueryClient } from '@tanstack/react-query';

import { isSlotTakenError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';

/**
 * Mark appointment availability stale after a booking is written.
 *
 * Taking, moving, resizing or cancelling a booking changes which slots are free,
 * but none of the booking mutations used to say so: `appointments.*` was
 * invalidated only by availability-blocks, leave, services, venue settings and
 * the calendar service toggle. Under the client's global `staleTime` of 30s that
 * left a real window — book 10:00, tap "Book another" (which deliberately keeps
 * the wizard mounted), and the slot picker served 10:00 from cache as still
 * bookable. Staff would collect a second client's details and then hit a 409, or
 * on the walk-in path double-book outright. The mirror case is as bad: a slot
 * freed by a cancellation stayed unbookable for the same 30s.
 *
 * Deliberately narrower than `appointments.all()`: that prefix also covers the
 * service CATALOGUE, which changes when services or practitioners change and
 * never when a slot is filled. Refetching it per booking would be pure traffic.
 */
export function invalidateAppointmentAvailability(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.appointments.availabilityAll(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.appointments.monthAvailabilityAll(),
  });
}

/**
 * The same, for a booking write that FAILED because the slot had gone (R16-3).
 *
 * Web's C3 fix re-checks the slot immediately before every appointment insert
 * and returns `SLOT_NO_LONGER_AVAILABLE` when it has been taken in between. That
 * 409 is positive information: the cached availability which offered the slot is
 * now known to be stale, and it is the only thing standing between staff and
 * tapping the same dead slot again.
 *
 * Deliberately narrow. Any other failure — a compliance block, a validation
 * error, a dropped connection — says nothing about occupancy, and refetching
 * every picker on every error would be traffic without information.
 */
export function invalidateAvailabilityIfSlotTaken(
  queryClient: QueryClient,
  error: unknown,
): void {
  if (isSlotTakenError(error)) {
    invalidateAppointmentAvailability(queryClient);
  }
}
