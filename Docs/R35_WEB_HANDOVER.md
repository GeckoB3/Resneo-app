# R35 web handover: a booking left behind by #194 can never be rescheduled again (2026-09-12)

From the app repo (`C:\Resneo-app`), for the web repo (`C:\Resneo`, `main` at
`79111976` = #194). This is a web-side gate, so it hits the web dashboard exactly as it hits the
app — nothing in the app can lift it.

The app has built its half of #194 the same day: both service-link writers now read the
`requires_confirmation` body, show the affected bookings, offer the same per-group move, and retry
with `?acknowledge_affected_bookings=true` (details at the end, in case anything there reads
differently from how you intended it).

## What #194 promises

"Stopping a calendar offering a service keeps its existing bookings." The dialog says it twice,
and the help articles say it again:

> **Leave them on this calendar.** They stay exactly as they are and go ahead as normal. Only new
> bookings stop.

## What actually happens to a booking that stays

It can never be moved again — not to another calendar, not to a different time, not even by five
minutes on the column it is already sitting on.

`validateAppointmentModificationInterval`
(`src/lib/booking/validate-appointment-modification.ts`) resolves the target calendar's offered
services through `getOfferedAppointmentServicesForPractitioner`
(`src/lib/availability/appointment-engine.ts:493`) and refuses when the booking's service is not
among them:

```ts
const offered = getOfferedAppointmentServicesForPractitioner(
  practitioner, apptInput.services, apptInput.practitionerServices,
);
const svc = offered.find((s) => s.id === svcId);
if (!svc) {
  return { ok: false, reason: 'Service not available with this staff member' };  // :203
}
```

Three things make this bite after a removal rather than before:

1. **A link is required.** `getOfferedAppointmentServicesForPractitioner` returns `null` for any
   service with no `practitioner_services` row for that calendar (`:509-510`) — there is no "no
   links means everything" fallback. Removing the link removes the service from that calendar's
   offered set for every purpose, including validating a booking that already exists.
2. **No override relaxes it.** `allowOutsideHours`, `allowDuringBreaks` and `allowManualOverlap`
   cover hours, breaks and overlap. The offered-services check sits outside all three.
3. **Every edit runs it.** `PATCH /api/venue/bookings/[id]` treats the request as a schedule move
   whenever the body carries `booking_date`, `booking_time`, `booking_end_time`,
   `duration_minutes`, `practitioner_id`, `appointment_service_id`, `service_item_id` or
   `service_variant_id` (`src/app/api/venue/bookings/[id]/route.ts:2281`) — which is every drag,
   every resize and every Modify save, including ones that do not touch the calendar at all. The
   same validator backs `POST /api/venue/bookings/[id]/validate-appointment-modification` and the
   two `visits/[groupBookingId]` routes, so the dry-run refuses first and the modify form shows
   the failure before the staff member can even try.

The dialog's own moves escape this because they run BEFORE the link is removed. It is only the
aftermath that is trapped.

### To reproduce

1. A calendar with two services, one of them (say "Cut and finish") with a booking next week.
2. Services → untick that calendar → the new dialog lists the booking → "Save and leave these
   bookings here".
3. Open the diary and drag that booking ten minutes later, or open Modify and change the time.
4. "Service not available with this staff member".

## The ask: let a booking keep the service it already has on the column it is already on

The rule we would suggest: the offered-services check is about what may be BOOKED on a calendar,
so it should apply to the pair being chosen, not to a pair that is merely being carried. When the
edit leaves both the calendar and the service exactly as the booking already has them, the check
has nothing to decide.

Concretely, in `validateAppointmentModificationInterval`: the booking row is already in hand at
every call site, so the target pair can be compared with the stored one
(`calendar_id ?? practitioner_id`, and `service_item_id` / `appointment_service_id`), and the
`offered.find` refusal skipped when they match. Two details we would not want to guess at from
here:

- **Sizing.** `svc` is what the rest of the function measures the booking with
  (`resolveAppointmentModifyEndCoreHHmm` takes `svc.duration_minutes`). With no link there is no
  merged row, so an exemption needs a fallback — the base `service_items` / `appointment_services`
  row without the per-calendar override merge looks right, but that is your call.
- **Variants.** `applyVariantToAppointmentInput` returns the same refusal a few lines earlier
  (`:181`) for a variant on an unlinked service, so whatever shape the exemption takes should
  cover that path too.

We have deliberately not tried to work around this app-side: any workaround would be the app
telling a staff member to re-tick a service to move a booking, which is the opposite of what #194
set out to do.

**Interim question:** until the validator changes, would you want the removal dialog to say that
bookings left behind cannot be rescheduled while the calendar does not offer the service? We have
held that copy back in the app rather than ship a warning that contradicts your dialog. If you do
add it, we will match it word for word.

## What the app now sends (for your reference)

- `PUT /api/venue/practitioner-services` and `PATCH /api/venue/appointment-services` are sent
  plainly first; on a 409 whose body carries `requires_confirmation: true` and
  `affected_bookings`, the app shows them grouped by service × calendar and re-sends the SAME
  payload with `?acknowledge_affected_bookings=true`. Any other 409 is still surfaced as a plain
  refusal. (`lib/services/service-removal.ts`, `lib/services/useServiceRemovalFlow.ts`.)
- Destinations are filtered exactly as the web dialog filters them: active calendars that already
  offer the service, the current calendar excluded.
- A move is one `PATCH /api/venue/bookings/[id]` per booking, sequential, carrying
  `practitioner_id`, the same `booking_date` and `booking_time`, an explicit `booking_end_time`,
  `allow_outside_hours: true`, `allow_during_breaks: true`,
  `skip_booking_modification_guest_notification: true`, and `allow_manual_overlap: false` so a
  real clash is still reported. Failures are listed per booking and the acknowledged save is
  withheld until every chosen move has gone through.
- The `affected_truncated` / `affected_total` pair is honoured: the app says how many are not
  shown and that only the listed ones can be moved from that screen.

Nothing above needs a web change; it is written down so that if any of it is not what the 409
meant, you can say so.

## Replies

As usual, a reply as `C:\Resneo\Docs\R35_WEB_RESPONSE.md` (and a note back through the desktop
session) reaches us. Earlier rounds: `Docs/R32_WEB_HANDOVER.md`, `Docs/R27_WEB_HANDOVER.md`,
`Docs/R26_WEB_HANDOVER.md`.
