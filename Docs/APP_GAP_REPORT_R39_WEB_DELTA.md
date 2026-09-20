# R39: web delta since R38, the owner-flow sweep (2026-09-20)

From the web repo (`C:\Resneo`, `staging` at `8bb76297`), for the app. The window is the one web
commit after `db6311f4` (the tip R38 was audited against): `8bb76297` "Owner-flow sweep: 22 fixes
across services, booking, compliance and the collective staff form", 36 files. The app's last OTA
is still "ResNeo R37 Collectives on Shared Services" on runtime 1.1.1 (app commit `0f003be`); R38
(`17596e4`) is committed and not yet shipped, so R38 and R39 go out together.

Most of the sweep is server-side or web-only. Where the app calls the same route it gains the fix
with no change; the client-side rules the web changed are mirrored below.

---

## What changed on the web

| Area (web finding) | Change | App impact |
|---|---|---|
| Cancelled bookings (N9) | `Cancelled -> Booked` is a legal transition, offered as **Reinstate**; the server re-checks the slot first and answers 409 "That time has since been taken. Rebook the client at another time instead." A cancelled or no-show booking shows no "Outstanding" line. | Built: `BOOKING_REVERT_ACTIONS.Cancelled`, the confirm step, `buildPriceSummary`. |
| Compliance on a booking (N13, N12, F-series) | Requirement pills read **Too recent** (a record inside the lead time) and **Awaiting result** (a client-submitted pass/fail form with no staff result yet, `awaiting_result` on each resolved requirement); a pending form link shows "Link sent by email/SMS on <date>, awaiting the client" with **Resend link** instead of a second Send; a visit's requirements merge across its segments; the collapsed header counts what is outstanding. | Built in `ComplianceCard`; the visit-wide merge and `awaiting_result` arrive from `GET /api/venue/bookings/[id]/compliance`. |
| Add-on groups (F-series) | Switching a group from "Pick one" to "Pick multiple" drops the single-mode maximum of 1, which would otherwise let the client pick just one anyway. | Built in `AddonGroupEditorSheet`. |
| Services (F2, N18) | A host deleting a collective master takes it off the page first ("Take off the page and delete", the copy says what happens at the other venues); hiding or showing a service says what it did. | Built: `useTakeServiceOffPage`, the delete dialog and button, a toast after an edit that flips "visible to guests". |
| Bookings list (N10) | A multi-service visit's row names every service: "A + B", or "A + N more". | Built in `collapseMultiServiceVisits` and `BookingRow`. |
| Staff booking form in a collective (F7 and the staff-audience catalogue) | Staff-only services appear in the staff catalogue of a collective; "Override availability" offers every calendar of every venue with a live copy of the service, whether or not a calendar there lists it; `exclude_booking_id` when editing so the booking's own slot stays available. | None: `/api/booking/availability` and `/api/booking/appointment-calendar` resolve the staff audience from the Bearer token when `staff=1`; the app's wizard sends both already. |
| Service removal from a calendar (N16) | The collective 409 lists the affected bookings with names; the dialog says "No other calendar at this venue offers X". | None: the app's removal dialog renders the server's rows. |
| Online booking (F-series) | The compliance gate runs before a guest row is created. | None: staff sources are not gated. |
| Emails, calendar links, confirmation DTO, settings copy | "Comments or requests" label, no "Party size" line for appointments, add-ons carried into an edit, the own-page note while a collective is live. | None. |
| Patch-test library forms (F16) | "Date of patch test" sets the record's captured date (`sets_record_date`). | None: the app's form renderer sends the answers; the server dates the record. |

## Done in the app

| # | Change | Where |
|---|---|---|
| 1 | **Reinstate** on a cancelled booking: a ghost button that arms ("Tap to confirm") then PATCHes `status: 'Booked'`; a 409 shows the server's sentence. | `lib/booking/booking-status-actions.ts` (+test), `components/bookings/BookingDetailContent.tsx` (`revertIsInstant`) |
| 2 | No "Outstanding" row on a Cancelled or No-Show booking; the total and anything paid still show. | `lib/payments/payment-display.ts` |
| 3 | Compliance card: **Too recent** and **Awaiting result** pills (warning tone), "Link sent by ... on ..., awaiting the client." with **Resend link** when a link is pending, header badge "N outstanding". | `components/bookings/ComplianceCard.tsx`, `types/booking-compliance.ts` (`awaiting_result`) |
| 4 | Add-on editor: choosing "Pick multiple" clears a maximum of 1. | `components/manage/AddonGroupEditorSheet.tsx` |
| 5 | Services: deleting a host's master on the collective page takes it off the page first (DELETE `/api/venue/collectives/[id]/offerings/[itemId]`), with the web's dialog copy and "Take off the page and delete"; a save that hides or shows a service toasts what it did. | `lib/queries/useServicesManage.ts` (`useTakeServiceOffPage`), `app/(app)/manage/services.tsx` |
| 6 | Bookings list: a visit's representative row carries `visit_service_names` (non-cancelled, start order) and reads "Service 1 + Service 2" or "A + 2 more". | `lib/booking/collapseMultiServiceVisits.ts`, `types/booking-list.ts`, `components/bookings/BookingRow.tsx` |

## Device pass (2026-09-20, Android, staging API, sept21@resneo.com as admin, Expo Go)

Passed:

- Appointments list: a Service 1 + Service 2 walk-in visit (seeded through
  `POST /api/booking/create-multi-service` with the venue's Bearer token) reads
  "Service 1 + Service 2 · Andrew" on its row.
- Booking sheet: Cancel booking (arm, confirm) turned the visit Cancelled with no Outstanding row
  and a **Reinstate** button; Reinstate (arm, confirm) returned it to Booked; both segments of the
  visit were Booked again in the database, so the server's cascade covers the visit both ways. The
  sheet showed the stale visit block for a second before its query refreshed.
- Services: Delete on "Service 3" (a master on the live Sept Collective) showed the take-off-page
  copy and the "Take off the page and delete" button; running it archived the offering, retired the
  copy at Sept 22 Hair and deleted the master ("Service 3" deleted). Service 3 is gone from the test
  venue.
- Add-ons: a new group switched to "Pick multiple" shows a blank Maximum.
- The "Parity Visit" bookings (Monday 21 September 10:00, Booked) and the guest contact remain on
  Sept 21 Hair.

Not exercised on a device:

1. **Compliance pills and Resend link**: compliance is off on Sept 21 Hair (no types, no
   requirements). The pill mapping mirrors the web's `requirementStatePill` and the resend uses the
   existing `useResendFormLink`; a venue with a requirement and a pending link would show them.
2. The R38 flows listed in `APP_GAP_REPORT_R38_WEB_DELTA.md` (member-side review and join, adoption
   answers, Continue setup, iOS) are still untested.

## Second pass: full review and device sweep (2026-09-20, afternoon)

The owner asked for a further review of the app against the web and a device pass, looking for
anything short of parity and any bug. The web's dashboard surfaces were listed against the app's
screens (every sidebar area and settings tab has an app page; the web day sheet redirects
appointment venues to the calendar; Delete venue, Refer & Earn and Export are present), the
app's status tables, price summary, phone validation, add-on handling and catalogue requests were
read against the web's, and every More page plus the main flows were driven on the phone.

Fixed:

| # | Finding | Where |
|---|---|---|
| 1 | **The price agreed at booking time was ignored.** The web reads `service_price_snapshot_pence` (migration 20270212120000, 2026-09-12) before the option's live price on every price row, so a later catalogue edit does not rewrite what the client was quoted; the app read the live price only, so a booking made at 25.00 read "Service 30.00 / Total 25.00" after a price rise. Never handed to the app. | `types/booking-detail.ts`, `lib/payments/payment-display.ts` (`agreedServicePricePence`), `components/bookings/VisitSummary.tsx`, test |
| 2 | **A partner venue's booking read "Service"** when opened on its own (from the confirmation's View booking, a notification or a deep link): the name came from the list row or OUR catalogue, and a partner's service is in neither. The row's own `service_name_snapshot` now comes first. | `components/bookings/BookingDetailContent.tsx` |
| 3 | **The name stayed stale after a Modify** that changed the service (the list row's name was preferred to the row's own). Same fix as 2: the row's refetched snapshot wins. | as 2 |
| 4 | **Contacts: "All 0 clients loaded" under two contacts.** The list asked for page 1 at first paint (before page 0 had been merged, `hasMore` compared an empty accumulator with the total); the route answers 500 for a page past the end; the failed page's undefined data dropped the total to 0. A page now exists only when the last one came back full, and a failed page keeps the last total. | `app/(app)/(tabs)/clients.tsx` |
| 5 | **Client detail: "LAST VISIT: Tomorrow".** The tile fell back to `stats.last_visit_date`, the latest booking DATE, for a guest whose first visit is tomorrow. The web reads the guest row's `last_visit_date` only. | `app/(app)/client/[id].tsx` |
| 7 | **Android haptics ignored the phone's vibration settings** (owner report). `lib/haptics.ts` called expo-haptics' impact / selection / notification, which on Android use the raw `Vibrator` API: the system logged them as `usage: MEDIA` (`dumpsys vibrator_manager`), governed only by the "Media vibration" intensity, so they played with "Touch interactions" off. They now use `performAndroidHapticsAsync` (`View.performHapticFeedback`), logged as `usage: TOUCH` and suppressed by the touch-feedback setting and the "Vibration & haptics" master switch; API < 30 falls back to constants that exist there. iOS `UIFeedbackGenerator` already follows System Haptics and the Accessibility Vibration switch. Expo's docs recommend the same. | `lib/haptics.ts` (+test), `jest.setup.js` mock |
| 6 | Web side: `GET /api/venue/guests` answers an empty page instead of 500 for a page past the end (PostgREST `PGRST103`). | `C:\Resneo` `src/app/api/venue/guests/route.ts` (uncommitted) |

Checked and matching the web: status transitions and revert labels; the collective catalogue in the
staff wizard (the FAB offers Service 1 with Andrew and David; a slot tap fixes the calendar as on
the web; with Override availability the service list shows a service no calendar offers, with
"Not usually offered by Andrew"); phone validation per country; add-on minutes in the wizard total;
add-ons seeded on Modify; the SMS overage rate; staff calendar assignment; Delete venue; the
alternate-hour shading on the diary.

Device pass (Sept 21 Hair, Android, Expo Go): every More page; Calendar day, week and month;
Arrived on one bar of a visit set `client_arrived_at` on both rows (server, visit-wide) and the
bars refreshed; a booking made from the FAB on David (Sept 22 Hair) through the collective;
Reschedule (duration stepper) and Modify (service change, dry run "Time available") on that
partner booking; Cancel, Reinstate, Delete permanently; Contacts list and detail; Services edit
(price 26.00 back to 25.00 saved and the Sept 22 copy followed) and the collective delete;
Availability tabs; Reports Overview (a visit counts once). Sept 21 Hair is left with the "Parity
Visit" booking (Mon 21 Sept 10:00, arrived) and Service 3 deleted; the "Cross Venue" booking and
its guest at Sept 22 Hair were deleted through the app.

Not exercised: the Notifications feed (the bell sits under Expo Go's dev-menu overlay and the
route refuses a deep link); Waitlist (off for this venue); compliance (off); the Booking page
editor's save; Team invite (Light plan, one login); iOS.

Noted, not changed:

- Pressing Android Back while the keyboard is up inside an editor sheet closes the whole sheet
  (the web has no equivalent). Expected on Android: the keyboard closes first.
- 124 user-facing strings in the app carry an em-dash; the web repo forbids them, the app has no
  rule on record.
- The Reschedule sheet's duration stepper moves one minute per tap (hold to go faster).
- "Review your services" shows for a single-service booking with the copy "Same visit with David,
  back-to-back" (it is the point where a second service can be added).

## Still open

1. The items above, on a device.
2. `_reference/Resneo` is at `8bb76297`; the next audit window starts there.
3. The diary's "Not scheduled to work this day — tap a slot to book anyway or block time." uses an
   em-dash; the web repo forbids them in user-facing copy, the app has no such rule on record.
