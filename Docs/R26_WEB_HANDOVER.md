# R26 web handover: releasing a deferred guest email for a linked booking (2026-09-06)

The app's diary now gives a partner's columns the same behaviour as the web's native grid
(`linkedColumnUsesNativeGrid`): the full booking panel, the quick-action tray, hold-drag move
and resize, all through `PATCH /api/venue/bookings/[id]`, which derives the owner venue from
the booking and applies the link grant. One route in that flow does not.

## The ask

`src/app/api/venue/bookings/[id]/guest-modification-notify/route.ts` looks the booking up with
`.eq('venue_id', staff.venue_id)` and answers 404 for any booking that is not the caller's
own. The diary's move sends `defer_modification_guest_notification: true` for a linked booking
exactly as for an own one, and then:

- the web's `ScheduleEditFollowUpBar` Notify button and its countdown call this route and get
  404, so a linked move never emails the guest;
- the app cannot offer Notify for a linked move for the same reason, so it sends
  `skip_booking_modification_guest_notification: true` instead and offers Undo only.

Please scope the route the way the PATCH route is scoped: `loadStaffAccessibleBooking(staff,
id)`, refuse with the existing 403 unless `linkedGrantAllowsMutation(linkedGrant, isOwnVenue)`,
and pass the OWNER venue id (the booking's `venue_id`) to
`executeBookingModificationGuestNotification`, since the email is the owner venue's. That is
the same shape as `resend-confirmation/route.ts`.

## What the app does meanwhile

A partner's move skips the guest email outright and the move notice offers Undo only, with no
Notify. Once the route accepts a linked booking, the app can defer and offer Notify as it does
for its own bookings; that is an app change (one flag), not a release-blocking one.

## Second ask (2026-09-06, later the same day): a partner's guest's Records

The owner wants a linked booking's panel to match an own booking's, Records included. The
web's panel hides Records in a linked context because the guest documents routes are all
scoped to the caller's own venue (`.eq('venue_id', staff.venue_id)` on the guest lookup and
on `guest_documents`), so a partner's guest answers 404:

- `GET /api/venue/guests/[guestId]/documents`
- `GET /api/venue/guests/[guestId]/documents/[documentId]/download`
- `POST /api/venue/guests/[guestId]/documents/sign`
- `POST /api/venue/guests/[guestId]/documents/[documentId]/complete`
- `DELETE /api/venue/guests/[guestId]/documents/[documentId]`

Please accept `owner_venue_id=<uuid>` on all five, the way `bookings/list` does for a
partner's guest history (`resolveCallerGrantOverVenue`, 403 unless the grant is
`full_details`; the guest resolved under the owner venue with the admin client), with:

- list and download for a `full_details` link that shares PII (`grant.pii`; a document is the
  person's), 403 otherwise;
- sign, complete and delete only when `linkedGrantAllowsMutation` (an edit grant), 403
  otherwise; the storage path and the `guest_documents.venue_id` are the OWNER venue's, so
  the partner's dashboard sees the file as its own;
- the contact audit event recorded against the owner venue, with the acting venue in the
  metadata, as `recordBookingWriteAudit` does for bookings.

The app already sends `owner_venue_id` on every one of these calls for a linked booking and
reads a 403/404 as "held by {venue} and not shared through this link yet" inside the
collapsed Records card, so the card fills in with no app release once the routes accept the
scope. If the web would rather keep Records off linked bookings, say so and the app will drop
the card for them.

Not asked, for the record: customer notes and tags on a partner's guest stay read only in the
app (they write through `PATCH /api/venue/guests/[guestId]`, our own venue's), and a
partner's multi-service visit shows no "other services" cards (the list route ignores
`owner_venue_id` with `group_booking_id`). Both are minor; raise them only if you touch those
routes anyway.

## Not asked

- No other route in the linked-column flow needs anything: the detail, summary, PATCH, delete,
  message, resend-confirmation, deposit, charge and validate-appointment-modification routes
  all go through `loadStaffAccessibleBooking` already, and the linked feed and the read-audit
  ping are unchanged.
- The bookings list route's `owner_venue_id` with `guest_history=1` is what the app now reads
  for a partner's guest history, exactly as the web's accordion does; no change on the web side.
