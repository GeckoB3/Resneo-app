# Handover: R24-6, the calendar-grid feed needs the processing snapshot before the app can nest bookings

**For:** an agent working in the ResNeo **web** repo (`C:\Resneo`, branch `staging`).
**Found by:** the ResNeo mobile app's R24 delta audit (`Docs/APP_GAP_REPORT_R24_WEB_DELTA.md`,
Part 6), auditing `09a7174a..100bc729`.
**Size:** four additive fields on one route's booking rows. No migration, no new logic.

---

## 1. What web shipped

`227c78bd` (#175) and `100bc729` (#176): a booking taken inside another booking's processing gap
is drawn INSIDE the host bar, indented 5 px, with the host's text and action tray laid out around
it (`src/lib/calendar/booking-cluster-layout.ts`). The diary computes each booking's gaps from its
stored `processing_time_blocks` snapshot, falling back to the service's (and variant's) pattern
(`bookingProcessingBlocksForLayout` in `PractitionerCalendarView.tsx`).

## 2. Why the app cannot follow yet

The app's diary reads `GET /api/venue/calendar-grid`. Its booking rows carry `id`, `guestName`,
`serviceName`, `startTime`, `endTime`, `status`, the attendance timestamps, `payment_state`,
`group_booking_id` and `person_label`, and nothing that identifies the service, the variant or
the processing snapshot. So the app cannot compute a booking's gaps, paints no processing band at
all today, and lays a booking taken in a gap out as an ordinary side-by-side overlap. That is
correct, just less informative than the web.

## 3. What to add

On each booking row of `GET /api/venue/calendar-grid`, additive and optional:

| Field | Source | Notes |
| --- | --- | --- |
| `appointment_service_id` | `bookings.appointment_service_id` | legacy services |
| `service_item_id` | `bookings.service_item_id` | unified catalogue services |
| `service_variant_id` | `bookings.service_variant_id` | so a variant's own pattern can apply |
| `processing_time_blocks` | `bookings.processing_time_blocks` | the snapshot taken at create, when present; null otherwise |

The app will derive the gaps the way the web diary does: snapshot first, else the pattern from
its managed-services list (which already carries `processing_time_blocks` on services and
variants), then paint the hatched band and port the nesting layout. Nothing else changes for the
web; older app builds ignore unknown fields.

## 4. When

Whenever convenient; nothing on the app side is waiting on a deadline. Say which commit carries
it and the app will pick it up in its next delta audit.
