# App gap report R35: the web delta `9ebfc03e..79111976` (2026-09-12)

The read-only reference clone (`_reference/Resneo`) was refreshed from `origin/main` at the
owner's request and parked on a detached HEAD at `79111976 "Stopping a calendar offering a
service keeps its existing bookings (#194)"` (2026-09-12). `origin/staging` was force-updated to
`34fc0905` and is tree-identical to main, so nothing is unreleased on the web side.

The delta since the last audited commit (`9ebfc03e`, R33) is 34 files, +1,862 / -219 across three
squashes, and `Docs/MOBILE_API.md` is untouched:

- **#192 `b55c8756`** is the R33 staging batch reaching main. Its tree is byte-identical to
  `9ebfc03e` (`git diff b55c8756 9ebfc03e` is empty), so it is exactly what
  [[web-delta-audit-r33]] audited and built. Nothing new to assess.
- **#193 `99396960`** (22 files): the three custom-message senders selected a `venues` column that
  does not exist, so every custom send failed; "Book again" links now derive from `venues.slug`
  and point a collective member at the combined page; a shared email footer, a raised type scale,
  and a post-visit thank-you stripped of its booking chrome.
- **#194 `79111976`** (12 files): taking a service off a calendar that already has bookings for it
  is no longer refused. Both service-link routes answer 409 with the affected bookings listed and
  honour `?acknowledge_affected_bookings=true` on the retry; the dashboard shows them in a dialog
  that can move each group to another calendar or leave it where it is.

Per [[plan-docs-vs-shipped-code]] every claim below was read in the clone's implementation, not in
a plan document, and every app claim was read in the app's own files.

## 1. Summary

| # | Finding | Severity | Verdict |
|---|---|---|---|
| R35-1 | Unticking a calendar from a service is now a confirmation on the web, not a refusal. All three app surfaces that write these links (the service form's "Offered by", the Services screen's per-calendar toggle, the Calendars tab's assignments sheet) surface the new 409 as a flat error with no way to proceed — and the new copy tells the operator the bookings will be kept, so the app now promises something it will not do | Live break (dead end + contradictory copy) | **Built** 2026-09-12 (§3, §9) |
| R35-2 | The web dialog also offers to MOVE each group of affected bookings to another calendar that already offers the service, keeping date, time and length, and reports per-booking failures. The app has no equivalent | Parity, a feature | **Built** 2026-09-12 (§4, §9) |
| R35-3 | A booking deliberately left behind on a calendar that no longer offers its service can no longer be rescheduled: the modification validator requires a live service→calendar link, so any drag, resize or Modify save returns "Service not available with this staff member", and the app's Modify picker (built from the catalogue's per-calendar services) no longer lists the booking's own service. Root cause is web-side and hits the web dashboard equally | Trap introduced by #194 (moderate) | **Handed to web** + app half **built** 2026-09-12 (§5, §10; `Docs/R35_WEB_HANDOVER.md`) |
| R35-4 | #193 fixes a live break the app shares: `POST /api/venue/bookings/[id]/message` and `POST /api/venue/guests/[guestId]/message` both failed with "Venue lookup failed" while #192 was on main without #193, which is every custom guest message the app sends | Closed server-side | Nothing to build — §6 |
| R35-5 | The email footer, type scale, post-visit changes and collective-aware "Book again" links are all rendered server-side; the app carries no email templates and its preview sheet opens the server's own HTML | No gap, inherited | Nothing to build — §7 |

## 2. What is NOT a gap in this delta

`ServiceRemovalBookingsDialog`, `AppointmentServicesView` and `AppointmentAvailabilitySettings`
are web dashboard components; only their behaviour is portable, not their code. The two help
articles (`calendar-setup`, `services`) live in the web help centre that Ask ResNeo reads
server-side, so the app inherits the new copy with no release ([[ask-resneo-in-app]]).
`src/lib/venue/service-removal-bookings.ts` is deliberately client-safe and is the wire contract to
mirror. The marketing sender (`sendMarketingContactMessage`) is fixed too, but the app's bulk send
goes through the per-guest message route in `lib/queries/useContactsBulk.ts:85`, so that third
sender is not on an app path.

## 3. R35-1 — the app cannot take a service off a calendar any more

**What the web does now.** Both routes compute the affected bookings instead of refusing:
`src/app/api/venue/appointment-services/route.ts:1168` reads
`?acknowledge_affected_bookings=true`, and the unified and legacy branches call
`findBookingsAffectedByRemovingServices*` only when the flag is absent;
`src/app/api/venue/practitioner-services/route.ts:49` does the same for the PUT. The 409 body is
`serviceRemovalConfirmationPayload` (`src/lib/venue/service-calendar-removal.ts:242`):

```
{ requires_confirmation: true, message, error: message,
  affected_bookings: [...], affected_total: n, affected_truncated: bool }
```

`message` reads, for example, "2 upcoming bookings are already booked for Cut and finish on Chair
1. Removing the service keeps those bookings exactly as they are and only stops new bookings."
`error` deliberately carries the same text so an untaught caller still says something useful. The
sample is capped at 200 rows (`SERVICE_REMOVAL_BOOKING_SAMPLE_LIMIT`) with `affected_total` exact
beyond it. The old `SERVICE_REMOVAL_BLOCKED_BY_BOOKINGS` constant ("…cancel or reschedule those
appointments before removing it here") is gone.

**What the app does.** Three surfaces write these links, and all three treat any 409 as final:

| Surface | Call | Failure path |
|---|---|---|
| Service form "Offered by" (admin) | `PATCH /api/venue/appointment-services` with `practitioner_ids` — `app/(app)/manage/services.tsx:1276`, hook at `lib/queries/useServicesManage.ts:87` | `setError(e.message)` at `app/(app)/manage/services.tsx:1291` |
| Services screen per-calendar toggle | `PUT /api/venue/practitioner-services` — `app/(app)/manage/services.tsx:1311`, hook at `lib/queries/useToggleCalendarService.ts:34` | `toast.error(e.message)` at `app/(app)/manage/services.tsx:1330` |
| Calendars tab → Assignments sheet | the same PUT — `components/availability/CalendarAssignmentsSheet.tsx:151` | `step()` rethrows `e.message` (`:306`) into the sheet's error line |

So the operator is shown a sentence that says the bookings will be kept and only new bookings
stop — and then the save does not happen, with no control that would let it happen. On the service
form it is worse than a refused tickbox: the 409 is returned before anything is written, so the
whole edit (name, price, variants, everything in that save) is refused because of one unticked
calendar.

**Fix.** The app already owns this pattern for hours: `isRequiresConfirmationBody`
(`lib/api/client.ts:46`) and the `acknowledge`-threading mutations at
`lib/queries/useVenueSettings.ts:189` and `lib/queries/useAvailabilityManage.ts:242`. The service-link
routes join that family, with a richer body:

1. Teach `useToggleCalendarService` and `useUpdateService` an `acknowledge?: boolean` input that
   appends `?acknowledge_affected_bookings=true`.
2. Mirror `parseServiceRemovalConfirmation` (`src/lib/venue/service-removal-bookings.ts:69`) and the
   `ServiceRemovalAffectedBooking` shape in an app module so all three surfaces read one parser.
3. On a parsed confirmation, open one shared Sheet listing the bookings grouped by service ×
   calendar (date, time, guest, status; the "showing the first N of M" line when
   `affected_truncated`), with the web's second paragraph — nothing is cancelled, saving only stops
   new bookings — then re-send acknowledged.
4. Keep the ordinary error path for any other 409 (`parse` returning null), as the web does at
   `AppointmentAvailabilitySettings.tsx:835`.

Per [[ios-no-stacked-modals]] the confirm must not be a second Sheet stacked on the open service
form: fold it into that Sheet as a mode step, or route the form's case through the same sheet the
Calendars tab uses after closing the editor.

## 4. R35-2 — no way to move the bookings that are left behind

The web dialog (`src/components/scheduling/ServiceRemovalBookingsDialog.tsx`) offers, per
service × calendar group, "Leave them on {calendar}" or "Move to {calendar}", and the destination
list is filtered — not merely labelled — to ACTIVE calendars that already offer that service,
because `/api/venue/bookings/[id]` refuses a move onto a paused calendar ("Staff not available") or
one that does not offer the service. With no destination it says so and explains that the service
must be added to another calendar first.

`moveAffectedBookings` (`src/lib/venue/service-removal-bookings.ts:96`) is the contract to copy:
one PATCH per booking, sequential so one clash cannot take the rest down, sending
`practitioner_id`, the SAME `booking_date` / `booking_time`, an explicit `booking_end_time` (without
it the route re-derives the end from the service default and silently resets a custom length),
`allow_outside_hours: true` and `allow_during_breaks: true` (the booking already exists at that
time), `skip_booking_modification_guest_notification: true`, and deliberately NOT
`allow_manual_overlap`, so a real clash is still reported. The web then drops the bookings that did
move, lists the failures with a reason each, and only saves once every chosen move succeeded
(`AppointmentAvailabilitySettings.tsx:847`).

The app can build this against routes it already calls. It is the second half of R35-1 rather than
a separate feature, but it can ship after the ack flow if the sheet is scoped to "leave them" on a
first pass — the app is then no worse than the web's old behaviour for anyone who wants a move, and
strictly better for everyone else.

## 5. R35-3 — a booking left behind cannot be rescheduled afterwards

Not in the web's release notes, and it hits the web dashboard too.

`validateAppointmentModificationInterval` (`src/lib/booking/validate-appointment-modification.ts`)
resolves the target calendar's offered services through
`getOfferedAppointmentServicesForPractitioner` (`src/lib/availability/appointment-engine.ts:493`)
and refuses with "Service not available with this staff member" when the booking's service is not
among them (`:203`). There is no "no links means everything" fallback, and none of
`allowOutsideHours`, `allowDuringBreaks` or `allowManualOverlap` relaxes that gate — they cover
hours, breaks and overlap only. The PATCH route runs this whenever the body carries
`booking_date`, `booking_time`, `booking_end_time`, `duration_minutes`, `practitioner_id`,
`appointment_service_id`, `service_item_id` or `service_variant_id`
(`src/app/api/venue/bookings/[id]/route.ts:2281`), which is every drag, every resize and every
Modify save — including one that does not change the calendar at all.

So the sequence the new feature invites — untick the service, choose "leave them here", save — puts
those bookings in a state where the diary can no longer move them by five minutes. The web's own
dialog escapes this because its moves run BEFORE the link is removed; it is the aftermath that is
trapped. The app has a second symptom, and it is narrower than "the service disappears":
`ModifyBookingSheet` builds its pickers from the catalogue's `practitioners[].services`
(`components/bookings/ModifyBookingSheet.tsx:415`). The service stays listed as long as ANY calendar
offers it, but `eligibleStaff` narrows the Staff row to the calendars that offer the SELECTED
service — so the booking's own calendar drops out of that row, it renders with nothing selected, and
every chip in it reads as a reassign.

Nothing app-side can lift a server gate. Two halves:

- **Web handover** ([[web-handover-channel]]): exempt the booking's own current (service, calendar)
  pair when the edit does not change either — an existing booking should keep its service on the
  column it is already on, exactly as #194 promises. The natural place is
  `validateAppointmentModificationInterval`, given the booking row it already loads.
- **App-side, built 2026-09-12** (§10): the refusal is explained rather than repeated, and the Staff
  row keeps the booking's own calendar. Neither pretends the edit is possible — they say which
  calendar stopped offering what, and what would make it possible.

## 6. R35-4 — the custom-message break the app shared (closed)

`send-custom-booking-message.ts`, `send-custom-guest-message.ts` and
`send-marketing-contact-message.ts` selected `venues.booking_page_url`, a column that does not
exist, so every send returned "Venue lookup failed" (or "Venue not found"). The column entered with
the R33 batch — `git show 9ebfc03e:src/lib/communications/send-custom-guest-message.ts` has it,
`d2038097` has no such file — so the window is #192 on main without #193, roughly an hour on the
night of 2026-09-11. #193 drops it and derives the booking page from `venues.slug` instead.

Both app custom-message surfaces sit on those senders: `MessageGuestSection` through
`POST /api/venue/bookings/[id]/message` (`lib/queries/useBookingMutations.ts:535`) and the contacts
composer and bulk loop through `POST /api/venue/guests/[guestId]/message`
(`lib/queries/useGuestMutations.ts:100`, `lib/queries/useContactsBulk.ts:85`). Nothing to build: the
app surfaces the API's message as-is. Worth one send in the owed R33/R34 device pass, since that is
the first time the app's composer work meets a working sender.

## 7. R35-5 — the email work, inherited

The app holds no email templates (no `lib/emails`, no `renderTransactionalEmailHtml` anywhere in
the app tree), and `components/manage/CommunicationPreviewSheet.tsx` renders SMS inline and opens
the EMAIL preview as the server-rendered HTML from `POST /api/venue/communication-preview`. So the
shared footer (venue name, then address as a Maps link, phone and website in the accent colour,
address omitted for client-address and online services), the raised type scale, the post-visit
thank-you without its date chip, detail rows and location, and the collective-aware "Book again"
target all appear in the app's own preview with no release.

One observation, not a finding: the customer app's "Book again"
(`components/customer/VenueHistorySection.tsx:60`) follows `rebook_href` from the web
(`src/lib/account/venue-history.ts`), which is still the solo `/book/{venueSlug}/{calendarSlug}`
deep link carrying `service_id` and `start`. That is defensible — `/book/[venue-slug]/page.tsx:17`
redirects a live collective member's solo page anyway, and the deep link's calendar and service
context only means something on the venue's own page — so it is recorded here rather than raised.

## 8. Verdict

Two things need building, one needs handing back:

1. **R35-1** first — it is a live dead end on three screens, made worse by copy that promises the
   opposite. One parser, one confirm sheet, `acknowledge` on two mutations.
2. **R35-2** with it, or straight after — the move is what makes "retire this service on one chair"
   a complete gesture.
3. **R35-3** to the web as a handover, with the app-side wording change alongside it.

R35-4 and R35-5 need no code. The R33/R34 device pass and the OTA are still owed; nothing in this
delta changes what is already built, so this work can join that release rather than forcing its
own.

## 9. What was built (2026-09-12)

R35-1 and R35-2 together, as one flow shared by all three surfaces. R35-3 went to the web as
`Docs/R35_WEB_HANDOVER.md`; its app-side half (better wording when a reschedule is refused because
the calendar no longer offers the service) is deliberately held back until web answers, so the app
does not ship a warning that contradicts the web's own dialog.

**New**

- `lib/services/service-removal.ts` — the wire shapes and the pure maths: `parseServiceRemovalConfirmation`
  (null for any body that is not the confirmation, so an ordinary 409 still reads as a refusal),
  grouping by calendar × service, the list key that resets the choices when bookings drop out,
  `serviceRemovalMoveInput` (the PATCH input, with the explicit end time), `runServiceRemovalMoves`
  (sequential, one clash cannot take the rest down), `withoutMovedBookings`, and the copy helpers.
  Mirrors `C:\Resneo\src\lib\venue\service-removal-bookings.ts`.
- `lib/services/useServiceRemovalFlow.ts` — `start(save)` / `confirm(moves)` / `cancel()`. The
  refused save is held in a ref so the acknowledged retry is the save that was refused, not
  whatever the form holds by the time the operator answers.
- `components/services/ServiceRemovalBookingsPanel.tsx` — the list, grouped, with a per-group
  destination chip row, the failure block, the "first N of M" note and the primary button that says
  what it will do. A PANEL, not a Sheet, because two of the three surfaces ask from inside an open
  Sheet ([[ios-no-stacked-modals]]).

**Changed**

- `lib/queries/useToggleCalendarService.ts` and `lib/queries/useServicesManage.ts` (`useUpdateService`)
  take `acknowledge?: boolean` and thread `?acknowledge_affected_bookings=true`, joining the
  hours/closures family in `useVenueSettings` and `useAvailabilityManage`.
- `app/(app)/manage/services.tsx` — both writers go through the flow. The form asks INSIDE its own
  sheet (the panel replaces the form body, so Cancel returns to the edit exactly as it stood, and
  swiping the sheet away abandons the pending save); the row toggle asks in a sheet of its own and
  keeps the row busy while it asks.
- `components/availability/CalendarAssignmentsSheet.tsx` — the sheet turns into the panel until the
  operator has answered; the tick state stays behind it.

**Tests** — `lib/services/service-removal.test.ts` (15), `lib/services/useServiceRemovalFlow.test.tsx`
(7, including the failed-move path that must NOT save), `components/services/ServiceRemovalBookingsPanel.test.tsx`
(7, including the destination filter), and a new end-to-end case in
`components/availability/BookableCalendarsManager.test.tsx` that unticks a service, sees the list in
the same sheet and re-saves acknowledged. Full suite: 298 files, 2,932 tests, green; `tsc --noEmit`
clean.

**Not covered by a test**: the services screen's own two entry points (that screen has no test
harness — it mocks a dozen hooks to render at all). The shared flow, the panel and one full surface
are covered; the two service-screen paths use the same three modules and are owed a device pass with
the rest of R33/R34.

## 10. R35-3, the app half (2026-09-12)

The handover went to the web the same day and is being worked on there; the gate itself can only
be lifted server-side. What the app can do is stop the refusal reading as the staff member's
mistake, and stop the form falling over for a booking that is left behind.

- `lib/booking/modification-refusal.ts` — `explainModificationRefusal(reason, { sameCalendar,
  calendarName, serviceName })`. It matches ONLY the engine's exact "Service not available with this
  staff member" and answers null for everything else, so every other refusal keeps the server's own
  words. Two sentences, depending on whether the calendar is the booking's own ("Chair 1 no longer
  offers Cut and finish, so this booking cannot be moved while it stays there. Add Cut and finish
  back to Chair 1, or move the booking to a calendar that offers it.") or one being moved onto. It
  stays correct after web fixes the gate — that second case is what the refusal is really for.
- Wired into the three places a staff member meets it: the Modify form's dry-run line and both of
  its save paths (`components/bookings/ModifyBookingSheet.tsx`), and the calendar's drag/resize
  toast (`app/(app)/(tabs)/index.tsx`), where `input.practitionerId` being unset is exactly
  "the column did not change".
- `eligibleStaff` in the Modify form now keeps the booking's OWN calendar in the Staff row even when
  it no longer offers the service, the way the role-narrowing path already intended to. Without it
  the row rendered with no chip selected and every chip read as a reassign.

Deliberately NOT built: a warning inside the removal panel that bookings left behind cannot be
rescheduled. That would contradict the web's own dialog and the help articles while the fix is in
flight; the handover asks whether they want such a line, and if they add one the app will match its
wording.

**Tests** — `lib/booking/modification-refusal.test.ts` (4) and two cases in
`components/bookings/ModifyBookingSheet.test.tsx`: the Staff row keeps a calendar that offers
nothing, and a refused save shows the explanation rather than the engine's sentence. The catalogue
mock there gained a swappable extra-calendar roster to make the first case expressible.

## 11. The web's answer, and what came of it (2026-09-12)

The handover was sent the same day and answered the same day (their reply will land as
`C:\Resneo\Docs\R35_WEB_RESPONSE.md`; it is not committed or deployed yet). Every point was
confirmed and fixed, and they found a second half the handover had not reached.

**What they built.** `validateAppointmentModificationInterval` now applies the offered-services
check to the pair being CHOSEN, not one being CARRIED: when the calendar does not currently offer
the service, the validator reads the booking row itself
(`calendar_id ?? practitioner_id`, `service_item_id ?? appointment_service_id`) and exempts the edit
only when both match the target — read from the row rather than trusted from the caller, so none of
the six call sites had to change. Our two open questions were answered as asked: sizing falls back
to the base `service_items` / `appointment_services` row through the engine's existing
`allowUnassignedService` flag, and the variant path is covered because that base row is in front of
the engine before `applyVariantToAppointmentInput` runs. They extended it twice on purpose — a
PARKED (`is_active = false`) service is exempt on the same terms, and the visit routes inherit it
through the same function. Their own verification table shows a carried pair allowed and every
genuine case still refused, including a different booking switching TO the unlinked service.

**What they found that we had not.** A left-behind booking kept its start and end but stopped
holding its BUFFER, because `fetchCalendarAppointmentInput` measures existing bookings through the
same link-derived service map and fell back to `buffer_minutes: 0`. The calendar then offered that
buffer to the next guest, on the public booking page too. Fixed by loading any service a day's
bookings reference but the catalogue lacks, for MEASUREMENT only.

**Does that second half reach the app?** No. The calendar-grid feed carries no buffer at all — its
row select is ids, times, status and the processing snapshot (`getCalendarGrid` in
`src/lib/unified-availability.ts`) — and the app draws buffers from
`patternLookupFromManagedServices`, built from the venue-wide `GET /api/venue/appointment-services`
(`lib/calendar/processing-gaps.ts:347`), which lists the service whether or not any calendar links
it. So the app's bars were never mis-measured; what was wrong was the server's own answer, which is
theirs and is fixed.

**Their instruction on the interim copy: do not ship it.** We had not, and still have not — no
warning in the removal panel. §10's refusal wording is a different thing and stays: it fires only
when the server actually refuses, so their fix simply stops it appearing for a carried pair, while
it goes on explaining the case the refusal is really for.

**The one thing they sent back for us: cancel staleness.** On the web, cancelling the confirmation
left the service form showing the calendar as unticked, so the owner believed a removal had happened
when the 409 had written nothing. The app had the same hole in two of its three surfaces (the row
toggle never did: its switch reads the saved links). Fixed 2026-09-12:

- `affectedCalendarIds` / `affectedServiceIds` in `lib/services/service-removal.ts` name exactly what
  the question was about — a calendar unticked with no bookings on it was never in question and
  stays unticked.
- The service form re-ticks those calendars on cancel; the assignments sheet re-ticks those
  services. Every other edit in either form is left alone.
- While fixing it: the assignments sheet used to write the class, resource and event moves BEFORE
  the service links, so a cancelled question left those already applied under a tick list the
  operator had just backed out of. The service save now goes first — the only step that can stop and
  ask — and the column moves follow it, on the plain path and on the confirmed one alike.

**Tests** — the two id helpers, and a case in `BookableCalendarsManager.test.tsx` that unticks a
service, cancels the question and asserts the tick is back and nothing was saved.

## 12. Device pass (2026-09-12, Samsung SM-S918B, Android 16, staging)

Driven over adb against `reserve-ni.vercel.app` as **Plus 1 Staging (admin)**, on the working tree
through Expo Go. Everything below was seen on the phone, not inferred.

**Read-only checks**

- The panel appears as a STEP of the service form, never a second sheet: the server's own sentence
  ("5 upcoming bookings are already booked for Cut & Blow Dry on Andrew…"), the reassurance line,
  the group header, five rows with day, time, guest and status, the chooser, and the two buttons.
- Destinations were "Move to Staff 1" / "Move to David" — the calendars that offer the service —
  with "Leave them on Andrew" selected by default.
- Cancel returned to the form with the rest of the edit intact and **Andrew ticked again**; the
  first save had written nothing.

**Write checks (both reversed afterwards)**

- *Acknowledged save.* "Save and leave these bookings here" on Cut & Blow Dry: the sheet closed, a
  re-opened form read Andrew unticked from the server, and the five bookings were still in the diary
  on Andrew — the promise the copy makes, kept.
- *Move.* Beard Trim's five upcoming bookings moved to David: the primary button read "Move 5
  bookings and save", and Tue 15 Sep showed the 10:00–10:15 booking on David's column, same date,
  time and length. No failures, and no guest was emailed.
- *Move, the other way.* Restoring exercised the same path in reverse: with Andrew re-ticked first,
  unticking David offered "Move to Andrew" (the destination list follows the SAVED links, so it only
  appeared once Andrew offered the service again), and the five went back. Andrew's chip on Tue 15
  Sep is 2 again.

**End state: identical to the start** — both services offered by Staff 1, Andrew and David, and all
ten bookings on the calendars they began on. No JS errors in logcat throughout.

**One observation, not a defect.** Five moves took roughly half a minute — each is a full
availability validation, run one at a time on purpose so a clash cannot take the others down. The
button holds its loading state and Cancel is disabled, so nothing is ambiguous, but at the 200-row
cap that wait would be long and silent. If we ever see a group that large, the panel should count
its way through ("Moving 3 of 5…").

**Also fixed while on the device**: `@stripe/stripe-terminal-react-native` red-boxed the app on
launch in Expo Go ("Cannot read property 'getConstants' of null", uncaught and fatal) because the
lazy loader's try/catch cannot hold that throw. `getTerminalSdk()` now checks
`NativeModules.StripeTerminalReactNative` — the very thing the SDK reads — before requiring the
package at all. Verified by a cold start: no red box, nothing in logcat. Unaffected in a real build,
where the module is present.
