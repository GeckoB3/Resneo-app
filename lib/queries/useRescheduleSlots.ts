import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';

/** One offered start time, from the public availability engine. */
export interface AppointmentSlot {
  practitioner_id: string;
  practitioner_name: string;
  service_id: string;
  service_name: string;
  /** "HH:mm". */
  start_time: string;
  duration_minutes: number;
  price_pence: number | null;
}

interface AvailabilityResponse {
  date: string;
  venue_id: string;
  practitioners?: {
    id: string;
    name: string;
    slots: AppointmentSlot[];
  }[];
}

/**
 * Free appointment times on one date, for a reschedule.
 *
 * **The one call in the customer surface that is not the customer surface.**
 * `reschedule-options` deliberately returns no slots, and there is no
 * `/api/v1/me/*` route that offers any: availability is a property of the
 * venue, not of the caller, so it lives on the public `/api/booking/*`
 * endpoints that the venue's own public booking page uses. The staff app
 * already reads them the same way, in `useBookableOfferings`.
 *
 * No access token is sent. The route does not require one, and the answer does
 * not vary by who is asking; passing a Bearer token to a public endpoint just
 * widens where it has been.
 *
 * Scoped to ONE practitioner, the booking's own. Rescheduling with a different
 * practitioner is a different appointment as far as the customer is concerned,
 * and offering a stranger's slots under "change my booking" would be a surprise
 * rather than a convenience.
 */
export function useRescheduleSlots(args: {
  venueId: string | null | undefined;
  date: string | null;
  serviceId: string | null | undefined;
  practitionerId: string | null | undefined;
  durationMinutes?: number | null;
}) {
  const { venueId, date, serviceId, practitionerId, durationMinutes } = args;
  const enabled =
    isBackendConfigured() && Boolean(venueId) && Boolean(date) && Boolean(serviceId);

  return useQuery({
    queryKey: queryKeys.customer.slots(
      venueId ?? null,
      date,
      serviceId ?? null,
      practitionerId ?? null,
    ),
    enabled,
    queryFn: async (): Promise<AppointmentSlot[]> => {
      if (!venueId || !date || !serviceId) throw new Error('Missing availability inputs');
      const params = new URLSearchParams({
        venue_id: venueId,
        date,
        booking_model: 'appointment',
        service_id: serviceId,
      });
      if (practitionerId) params.set('practitioner_id', practitionerId);
      if (durationMinutes && durationMinutes > 0) {
        params.set('duration_minutes', String(durationMinutes));
      }

      const response = await apiFetch<AvailabilityResponse>(
        `/api/booking/availability?${params.toString()}`,
      );

      /*
        The engine answers per practitioner, because the same date can offer
        different times depending on who is working. Flattened here, and then
        narrowed to the booking's own practitioner when there is one, so the
        screen shows times this booking could actually move to.
      */
      const slots = (response.practitioners ?? []).flatMap((p) => p.slots ?? []);
      const forThisBooking = practitionerId
        ? slots.filter((s) => s.practitioner_id === practitionerId)
        : slots;

      return dedupeByStart(forThisBooking).sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
  });
}

/**
 * One entry per start time.
 *
 * A service offered under more than one variant can produce several slots at
 * the same minute, and a picker that lists "10:00" three times looks broken.
 */
function dedupeByStart(slots: AppointmentSlot[]): AppointmentSlot[] {
  const seen = new Set<string>();
  const out: AppointmentSlot[] = [];
  for (const slot of slots) {
    if (seen.has(slot.start_time)) continue;
    seen.add(slot.start_time);
    out.push(slot);
  }
  return out;
}
