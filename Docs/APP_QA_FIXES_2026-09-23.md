# Device test fixes (2026-09-23)

A full pass of the app on the owner's Galaxy S23 Ultra (Expo Go, dev database) as
sept19@resneo.com, plus three code reviews against web `staging`, found the problems below. All
were fixed the same day. The web half is in `C:\Resneo` (uncommitted when written, beside another
session's unrelated edits).

## Booking data

| Problem | Fix | Where |
|---|---|---|
| Modify counted a booking's add-on minutes twice: saving an 11:00-11:55 booking (45 + a 10-minute add-on) unchanged made it end at 12:05. | The base length drops the seeded add-ons' minutes; the opened length (baseline) stays the whole span, so an untouched form is not an edit. | `components/bookings/ModifyBookingSheet.tsx` (+3 tests) |
| Reschedule sent no end, so the server gave the booking its catalogue length (13:00-14:05 saved as 13:45). | An appointment move sends `booking_end_time`, as the calendar drag already did. Tables still let the server size them. | `components/calendar/RescheduleSheet.tsx`, `useRescheduleBooking` (+2 tests) |
| A create took over 15 s on staging; the app said "Request timed out… try again" while the booking existed. A walk-in retry would have made it twice. | Creates wait 45 s; after a timeout the app looks for the booking on its day (time, calendar, guest) and confirms it if found, else says to check the calendar first. Web: the manage short link and a metrics insert moved into `after()`. | `lib/booking/find-just-created-booking.ts` (+3 tests), `ConfirmStep.tsx`, create hooks; web `src/app/api/venue/bookings/route.ts` |
| The comment typed at New booking (stored in `dietary_notes`, as the web stores it) was invisible in the booking and Notes said "None". | Shown as **Comments when booked** on every model and counted in Notes. | `BookingNotesSection.tsx`, `BookingDetailContent.tsx` |
| Class bookings offered Reschedule, which the server refuses; resource bookings could be moved blind and showed Modify. | **Move** opens a session list for a class (`target_class_instance_id`) and a length, day and free-slot picker for a resource (staff routes with `exclude_booking_id`). Events get neither, as on the web. | `ClassSessionMoveSheet.tsx` (+3 tests), `ResourceMoveSheet.tsx`, `lib/queries/useBookingMoveOptions.ts` |
| A swipe No-show changed the booking immediately. | It asks first. | `BookingSwipeRow.tsx` |

## New booking

- Today was offered after closing (the staff month counted past times), then "No times available".
  Web: the staff month keeps the engine's past filter on today
  (`src/lib/availability/appointment-month-availability.ts`, +3 tests).
- The review step read "55 min · £35.00" against a £45.00 total: each line now includes its
  add-ons' price and names them.

## Smaller fixes

Deposit "Not Required" is no longer printed; "1 events"; "First visit" twice; "£45.00 due" on a
cancelled booking; the sheet heading for class, event and resource bookings; Today's diary party
line; Contacts with filters and no matches; Today's link now opens **New bookings**; the report
range reads "25 Aug to 23 Sep 2026" and the page presets hide on **New bookings**; Today's chips
read the server's `event_ticket` / `class_session`; waitlist status case, "1 guest" and the failed
notify toast; the card-hold request and reminder messages in Communications; the Light SMS banner
follows the Stripe subscription; referral void codes explained (port of the web's
`explainReferralOutcome`); a feature ResNeo forced on says so instead of "Setting saved"; team
members only edit events and resources on their calendars; a UTC venue can save its profile;
"ResNeo" in brand text; Android's unlock label; every em-dash in on-screen wording.

## Web (C:\Resneo)

- Ask ResNeo answered app questions with web navigation. The app help article gained a
  **Services** section, the selector prefers `resneo-app/*` articles for the app, and the answer
  prompt tells the model the app has no sidebar (+2 tests).
- Not done: moving appointment comments to `special_requests` in the web's own flows (it touches
  `src/app/api/booking/create/route.ts`, which another session was editing, and needs a backfill),
  a server idempotency key for creates, and the silent guest-account step in the staff create
  (the slowest remaining step; changing it changes who gets a customer login).

## Tested

Jest 319 suites, 3,126 tests; web vitest 778 files, 8,002 tests; typecheck and lint clean. On the
phone against the local web server: New booking (today not offered after closing, add-on on the
review, created in 4.7 s), the booking's comment, Modify unchanged and moved (55 min kept),
Reschedule (55 min kept), cancel and delete, a class booking moved to another session and back, a
resource booking moved and back, the swipe No-show prompt, Contacts with filters, Today to
Reports, Communications, More labels and Ask ResNeo. Test bookings were deleted and fixtures
restored.
