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

## Not asked

- No other route in the linked-column flow needs anything: the detail, summary, PATCH, delete,
  message, resend-confirmation, deposit, charge and validate-appointment-modification routes
  all go through `loadStaffAccessibleBooking` already, and the linked feed and the read-audit
  ping are unchanged.
- The bookings list route's `owner_venue_id` (the web's guest history for a linked booking)
  is not used by the app yet; when the app builds that history it will read the route as the
  web does, with no change on the web side.
