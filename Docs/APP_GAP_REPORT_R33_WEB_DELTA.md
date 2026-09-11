# App gap report R33: the web delta `d2038097..9ebfc03e` (2026-09-11)

The read-only reference clone (`_reference/Resneo`) was refreshed from `origin/staging` at the
owner's request and parked on a detached HEAD at `9ebfc03e "Custom message template, marketing
permission, calendar hours stripes and quick edit, multi-service SMS, contact search box"`
(2026-09-11). `origin/main` sits one commit behind at `f6505ef5 "Staging (#191)"` (2026-09-10).
The delta since the last audited commit (`d2038097`, R31) is two strands, 46 files, +3,263 / -214.
`Docs/MOBILE_API.md` is untouched.

- **#191, merged to main** (13 files): the web's answer to the app's R32 handover (the staff
  change-password route serves Bearer callers), a Revenue tab on Reports backed by a new
  `GET /api/venue/reports/booked-revenue`, and the booking summary route returning per-service
  price lines so the web panel stops flicking to "Price not set".
- **`9ebfc03e`, staging only, unreleased** (33 files): the calendar's hours stripes and the
  diary's clock button, hours-mismatch advice on every hours save, a custom message template
  (email + SMS), marketing permission as one rule, multi-service SMS wording, and a contact
  search box on the web's staff guest fields.

Every finding that needed code was built the same day (§13 onward). Per
[[plan-docs-vs-shipped-code]] every claim below was checked against the implementation in the
clone, and every app claim was read in the app's own files. The owner's brief named five things
in particular: the revenue report, the clock button where the calendar-name row meets the time
column, the grid always showing the widest of calendar and venue hours with the web's colours,
each calendar's working hours under its name, and "Add closure or amended hours" in Business
hours. All five are in the summary.

## 1. Summary

| # | Finding | Severity | Verdict |
|---|---|---|---|
| R33-1 | The web's diary stripes give every closed minute exactly one cause: rose "Venue closed", sky "<calendar> unavailable", slate "<calendar> closed" when both apply, violet leave, amber breaks, each labelled with its minutes. The app drew one grey "Closed" wash for the venue and a second grey band for the calendar, clipped to the venue window, so a minute could carry two greys and never said which side was shut | Parity (moderate) | **Built** 2026-09-11 (§3, §13) |
| R33-2 | The web grid always spans the widest of the venue's hours and any visible calendar's own. The app measured the day from the calendar's resolved hours and its content only, so a venue open past a calendar's day was cut off, and a calendar working past the venue's close was drawn but not explained | Wrong display | **Built** 2026-09-11 (§4, §13) |
| R33-3 | The web toolbar's clock button opens "Amend calendar hours" (everyone) or "Amend business hours" (admins), as the real settings editors seeded with the diary's day; the closures panels open on that day with it picked. The app had no such entry point | Parity, a feature | **Built** 2026-09-11 (§5, §14) |
| R33-4 | Each calendar's working hours under its name in the column header (the owner's ask; the web's header names the column only) | Owner request | **Built** 2026-09-11 (§6, §13) |
| R33-5 | Every hours save that leaves calendar hours outside business hours (or the reverse) now says so on the web: the weekly editor, the schedule timeline, the venue's weekly card, and a closure or amended-hours save, each with a button to the other screen. The app said nothing | Parity (moderate) | **Built** 2026-09-11 (§7, §15) |
| R33-6 | Business hours: the closures card's chooser is one button per kind with a hint, the labels are sentence case, and the owner wants "Add closure or amended hours" on the button | Copy / owner request | **Built** 2026-09-11 (§8, §15) |
| R33-7 | Reports gains a Revenue tab: booked revenue per day/week/month and per calendar, linked calendars on a full-detail create/edit/cancel grant, no-shows deducted by default with a tick to add them back, five presets or a custom range, a stacked chart, a table and a CSV export. The app had no revenue report | Parity, a feature | **Built** 2026-09-11 (§9, §16) |
| R33-8 | Custom messages: a hint under every composer (paragraphs, character count, texts and the cut-short warning), 2,000-character cap, taller boxes; marketing permission is one rule (consent AND no opt-out), the two toggles exclude each other, the section copy explains which sends are gated, and bulk sends from the contacts list skip contacts without permission | Parity (small, several surfaces) | **Built** 2026-09-11 (§10, §17) |
| R33-9 | The booking summary route returns `visit_payment.lines`, and the web merge keeps lines on screen. The app never merges the summary over the detail key (the summary is `placeholderData` on its own key), so the "Price not set" flick was web-only; the app simply gets prices on the first paint now | No gap | §11, nothing to build |
| R33-10 | The staff change-password route serves Bearer callers (the R32 answer). The app moved to `POST /api/account/password` in `f243ff1` and needs nothing further; the web keeps the staff route for its own two callers | Closed | §12, nothing to build |

Everything else in the delta is server-side or web-only and inherited: the custom-message email
template and its plain-text formatting (`custom-message-email.ts`, `renderer.ts`); the
multi-service SMS wording (`smsBookingLabel`, the earliest line's start time, the staff name
only when one person takes the whole visit); the `guests/[guestId]` PATCH keeping the consent and
opt-out flags consistent and refusing both at once; the "subscribed" directory segment now
meaning consent AND no opt-out (the app's clients filter calls the same route); the
`guests/[guestId]/message` route's `respect_marketing_permission` flag (the app's bulk send uses
the consent-gated `contacts/bulk` broadcast, which already skips the same contacts, §10); the
Bearer-safe sweep over `/api/venue`; and the web's `StaffGuestContactFields` search box, which the
web ported FROM the app's guest step ("as in the mobile app"), so the app already has it.

## 2. Corrections to the web summary

- **The stripes are a partition, not a relabel.** `partitionScheduleClosureBlocks`
  (`schedule-closure-blocks.ts`) takes the venue-closed and calendar-closed stripes the two
  builders emit over the grid bounds and splits them so no minute carries two: venue-only stays
  `venue_closed`, calendar-only stays `practitioner_closed`, both becomes the new
  `venue_and_calendar_closed`. Leave and linked-venue stripes pass through. The app's builder
  clipped the calendar's bands to the venue's open window, so a "both" band never existed; the
  port had to widen the builder to the whole day and partition in the grids (§13).
- **`linked_venue_closed` stays a wall.** The web's `occupying-blocks.ts` added only
  `venue_and_calendar_closed` to the non-occupying set; a partner's closed hours still refuse a
  drop. The app's test pinned the same rule (`occupying-blocks.test.ts`), and the port keeps it.
- **The grid bounds rule is min/max, not union.** `calendarWorkingBoundsForDates` gives the
  earliest start and latest end any active non-resource calendar works over the dates, and the
  view takes `min(venue start, calendar start)` and `max(venue end, calendar end)`, capped at 24.
  The app's `computeGridBounds` already takes the min/max of every range it is given, so the
  port is to feed it the venue's open periods as well as the column's hours (§13).
- **The web's column header does not show hours.** The owner asked for the working hours
  under each calendar's name; that is an app addition (R33-4), not a web port.
- **The dialog is a push.** On the web `CalendarHoursQuickEdit` opens the real settings
  components in a dialog over the diary. The app pushes the real screens with route params
  instead, because a second Sheet over the calendar's own sheets is the stacked-modal pattern
  iOS drops ([[ios-no-stacked-modals]]). Every save on those screens invalidates what the diary
  reads (the calendars, the leave feed, the venue's blocks and its hours), so the diary is already
  right when the user comes back; nothing refetches on focus.
- **Booked revenue is priced server-side.** `loadRowTotalResolver` (extracted from
  `payment-summary.ts`) prices each row with the booking panel's precedence; the app reads the
  aggregated answer and never re-prices a row.

## 3. R33-1: one cause per minute, in the web's colours

**Web.** `schedule-closure-blocks.ts` (`9ebfc03e`): the `ScheduleClosureBlockType` union gains
`venue_and_calendar_closed`; `scheduleClosureBlockLabel(type, { columnName, startTime, endTime })`
says "Venue closed 18:00 to 20:00", "Hannah unavailable 08:00 to 09:00", "Hannah closed 08:00
to 09:00" (both), "On leave 09:00 to 17:00", "Linked venue closed …"; `partitionScheduleClosureBlocks`
splits the venue and calendar stripes per column and date. `PractitionerCalendarView.tsx`:
`calendarBlockShellClass` tints `venue_closed` rose-50/200, `practitioner_closed` sky-50/200,
`practitioner_leave` violet-50/200, `venue_and_calendar_closed` and `linked_venue_closed`
slate-200/300; `calendarBlockAccentColor` gives rose-600 `#e11d48`, sky-600 `#0284c7`, violet
`#7c3aed`, slate `#94a3b8`; `calendarBlockHeadingTextClass` the matching 950 text; a hand-made
block's heading is now "Time blocked". Breaks keep amber. `occupying-blocks.ts` adds
`venue_and_calendar_closed` to the non-occupying set.

**App before.** `components/calendar/closure-band.ts` gave `practitioner_closed`, `venue_closed`
and `closed` one grey wash (`text` at 6%) and leave amber; the grids drew the venue's closed
minutes as a separate grey "Closed" band (`closedRanges` in `CalendarDayGrid.tsx:657`,
`AllCalendarsDayGrid.tsx:779`, `WeekGrid.tsx:408`) and the calendar's bands, clipped to the
venue window by `buildCalendarClosureOverlays` (`schedule-closures.ts:191`), on top. A closed
minute therefore read "Closed" with no side named, and a linked column's own hours were the same
grey as ours.

**Port.** §13.

## 4. R33-2: the widest of venue and calendar hours

**Web.** `PractitionerCalendarView.tsx:3681-3701`: `venueBase = getCalendarGridBounds(...)`
(the venue's resolved hours for the day, closures and amended hours applied, 7–21 without
opening hours), `calendarBounds = calendarWorkingBoundsForDates(active non-resource
practitioners, from, to)`, then `startHour = min(venueBase.startHour, floor(calendarBounds.start/60))`
and `endHour = min(24, max(venueBase.endHour, ceil(calendarBounds.end/60)))`. The comment: "A
calendar working 08:00–20:00 in a venue open 09:00–18:00 draws 08:00–20:00, with the stripes
saying which side is closed in each hour."

**App before.** `CalendarDayGrid.tsx:346-352` measured `workingHours` (the column's resolved
hours since R30) plus bookings, blocks, sessions and schedule blocks; `AllCalendarsDayGrid.tsx:568-591`
the same per column; `WeekGrid.tsx:171-197` the same per day. The venue's open periods were
never an input, so a venue open 08:00–20:00 with a calendar working 10:00–16:00 drew 10:00–16:00
and the venue's other hours could not be booked into from the grid.

**Port.** §13.

## 5. R33-3: the clock button

**Web.** `PractitionerCalendarToolbar.tsx`: an `onAmendHours` button (a clock glyph, "Amend
hours") ahead of the view-mode switcher. `CalendarHoursQuickEdit.tsx`: admins choose "Amend
calendar hours" ("Weekly availability, breaks, and closures or amended hours for one calendar")
or "Amend business hours" ("Weekly opening hours, and closures or amended hours for the whole
venue"); staff go straight to calendar hours. The calendar editor is
`AppointmentAvailabilitySettings` with `embedded: { initialTab: 'daysoff', initialDate }` (no
Calendars tab, no heading, the closures panel opens with the day picked and the draft seeded);
the business editor is a two-tab dialog over `OpeningHoursSection` (`hideClosures`) and
`BusinessClosuresSection` (`initialDate`, the day picked and the draft seeded). Closing the
dialog refetches the diary with the catalogue.

**App before.** No entry point from the diary to either editor; the Availability screen took only
`?tab=`, the Business hours screen took no params.

**Port.** §14.

## 6. R33-4: hours under each calendar's name

The owner's ask. The web's column header shows the calendar's name (and, on a linked column,
the venue). The app's `AllCalendarsDayGrid` header was one line (name, a Linked pill, an
optional venue caption); the single-calendar `CalendarDayGrid` had no header row at all, the
calendar being named by the toolbar chip. **Port** in §13: a hours line under the name in both
grids, from the column's resolved `workingHours` ("09:00–17:00", "09:00–12:00, 13:00–17:00",
or "Not working"), via `lib/calendar/column-hours-label.ts`.

## 7. R33-5: advice when calendar and business hours disagree

**Web.** `src/lib/calendar/hours-mismatch.ts` (`9ebfc03e`): `weeklyCalendarHoursOutsideVenue`
(a calendar's weekly template against the venue's weekly hours, day by day; empty when the venue
has no hours), `describeCalendarWeeklyMismatch(name, …)` ("Hannah's hours on Monday run outside
your business hours (Monday: calendar 08:00 to 20:00, business 09:00 to 17:00). Guests can only
book within business hours, so widen your business hours for that day too."),
`describeVenueWeeklyMismatch(calendars, hours)` ("These business hours are narrower than the
calendar hours of Hannah (Monday 08:00 to 20:00) … Widen the business hours, or adjust those
calendars' hours to match."), `datedCalendarHoursOutsideVenue(calendars, hours, blocks, from,
to)` (what a calendar actually works on each date, via `getWorkingRanges`, against the venue's
resolved hours, via `resolveVenueWideAllowedMinuteRanges`; up to 62 dates) and
`describeDatedMismatch` ("Hannah is still scheduled to work outside these hours (Hannah works
09:00 to 17:00 but the venue is closed on Mon 24 Aug) …"). Shown as an amber card with a button
to the other screen and Dismiss: after a working-hours save and a schedule save
(`AppointmentAvailabilitySettings.tsx:826-836, 884-891`, "Open business hours"), after a weekly
opening-hours save (`OpeningHoursSection.tsx:110`, "Open calendar hours", roster from
`practitioners?roster=1`), and after a closure or amended-hours save
(`BusinessClosuresSection.tsx:428-431`, "Open calendar closures"). Neither save is refused.

**App before.** Nothing on any of the four saves. The app already had the per-day venue context
beside each weekday in the hours editor (`lib/calendar/venue-hours-context.ts`, R19) and the
resolvers the dated check needs (`calendarHours`, `venueDayHours`).

**Port.** §15.

## 8. R33-6: the closures card

**Web.** `BusinessClosuresSection.tsx:464-470, 518-539`: the Type field is a radio group of
buttons, "Closure — All day, or a window each day", "Amended hours — Open on these dates with
these hours", "Reduced capacity — Fewer covers on these dates" (restaurant tier), "the same
chooser as the Closures & amended hours tab on Calendar availability". The owner asked that the
app's Business hours button read "Add closure or amended hours" (the web's resource timeline
uses those words, `ResourceTimelineView.tsx:1763`).

**App before.** `AvailabilityBlocksSection.tsx`: a horizontal pill row labelled "Closure" /
"Amended Hours" / "Reduced Capacity" with no hint; the picker button read "Add closure"; the card
was titled "Closures & Exceptions".

**Port.** §15.

## 9. R33-7: the Revenue tab

**Web.** `src/lib/reports/booked-revenue.ts` + `GET /api/venue/reports/booked-revenue`
(`route.ts`, admin only, `createVenueRouteClient(request)` so a Bearer works; `?preset=today|
this_week|this_month|last_30|next_30` resolved from the venue's own today, or `?from=&to=` up to
400 days; `&grain=day|week|month`). The answer: `columns[]` (own calendars in sort order, a
"No calendar" column when rows have none, then each linked venue's calendars whose grant is
`full_details` + `create_edit_cancel`, scoped to the link's calendars), `periods[]` (one per
period start between from and to, quiet periods included, each with `booked_pence`,
`no_show_pence`, counts, `unpriced_count` and `by_calendar`), `totals`, `today`. Cancelled rows
are excluded, No-Show rows are counted apart, and every row of a visit is its own row so a visit
is never counted twice. `BookedRevenueSection.tsx`: range chips + custom range, Show by, "Include
no-shows", three tiles (booked revenue; no-shows deducted/included; bookings counted with "N
without a price"), an unpriced note, a linked note, a stacked bar chart in ten fixed colours (the
brand navy and teal first), a table with a Today pill and a No-shows column, Export CSV
(`booked-revenue-{from}-{to}-{grain}.csv`). `ReportsView.tsx` adds the Revenue sub-tab and hides
the date-range card on it.

**App before.** `app/(app)/reports.tsx` had Overview and Clients; no revenue figures anywhere.

**Port.** §16.

## 10. R33-8: composers and marketing permission

**Web.** `GuestMessageComposerHint.tsx`: "Press Enter for a new line. Leave a blank line to
start a new paragraph." plus "N characters · about K texts (SMS will be cut short)" when SMS is a
channel (budget 459 = three GSM segments, warning from 419). Mounted under the panel's composer
(`BookingDetailContent.tsx`, rows 2→4, `maxLength 2000`), the contact panel's
(`ContactDetailPanel.tsx`, rows 3→5) and the bulk modal's (`BulkGuestMessageModal.tsx`, rows
5→7). `src/lib/guests/marketing-permission.ts`: `hasMarketingPermission` = consent AND no
opt-out; `marketingSkipReason`. `ContactMarketingSection.tsx`: "Opted out of marketing" /
"Marketing consent given", each toggle clears the other, a line "Receives marketing messages." /
"Does not receive marketing messages.", and the explanation "Booking messages … and one-to-one
messages you send from this panel are always delivered. Messages sent to several contacts at
once from the contacts list only go to contacts with marketing consent who have not opted out."
`ContactsDashboard.tsx`: the bulk fan-out sends `respect_marketing_permission: true` and reports
"N skipped (no marketing permission)"; the modal's description now says who is skipped.

**App before.** The booking composer's box was 3 rows with no cap; the guest sheet had the cap
and no hint; the bulk sheet's note said "marketing consent … matching email on file". The
marketing card (`MarketingPreferencesCard.tsx`) and the edit sheet (`GuestEditSheet.tsx`) had
"Marketing consent" / "Opted out" as independent toggles with an opt-out-wins status line. The
app's bulk send already used `POST /api/venue/contacts/bulk` `marketing_message`, which is
consent-gated server-side (its own `hasMarketingPermission` since this delta), so the skip
semantics were already right; only the words and the toggles' mutual exclusion were behind.

**Port.** §17.

## 11. R33-9: the summary's price lines

`bookings/[id]/summary/route.ts` adds `lines: visit.lines` to `visit_payment`;
`booking-detail-summary-merge.ts` keeps the previous lines when a summary has none. The app's
`useBookingDetail` prefetches the summary under its own key and shows it as `placeholderData`
only (`lib/queries/useBookingDetail.ts:31-49`), never merging it onto the detail key, so the
web's flick had no app counterpart. The app's visit card reads `visit_payment.lines` (R31-6), so
the placeholder paint now carries prices too. Nothing to build.

## 12. R33-10: the R32 answer

`Docs/R32_WEB_RESPONSE.md` in the clone: `POST /api/venue/staff/change-password` updates through
`getCallerAccessToken` + `updateAuthUserAsCaller`, the `same_password` mapping also matches the
error code, the response shape is unchanged, and the Bearer-safe sweep covers `/api/venue`. The
app's `useChangeOwnPassword` posts to `/api/account/password` since `f243ff1`; both routes now do
the same for a Bearer caller. Nothing to build; the handover is closed.

## 13. Built: R33-1, R33-2, R33-4 (2026-09-11)

- `lib/calendar/schedule-closures.ts`: the type union gains `venue_closed`,
  `venue_and_calendar_closed`, `linked_venue_closed`; `buildCalendarClosureOverlays` drops
  `venueOpenRanges` and covers the whole day; `scheduleClosureBlockLabel` is the web's;
  `partitionClosureBands({ venueClosed, entries, columnName, linked, keyPrefix })` is the port
  of `partitionScheduleClosureBlocks`, run by every grid over its `venueClosedRanges` and its
  clamped overlays (leave is clipped to the venue's open minutes; breaks and manual blocks pass
  through); `isScheduleClosureBlockType` recognises the new names.
  `lib/calendar/occupying-blocks.ts` adds `venue_and_calendar_closed` (and only that).
- `components/calendar/closure-band.ts`: the web palette — rose, sky, slate, violet, amber — as
  light looks with the 950 label colours, and dark looks as a translucent tint of the same
  accent; `closureBandLook(blockType, isDark)`.
- `CalendarDayGrid.tsx`, `AllCalendarsDayGrid.tsx`, `WeekGrid.tsx`: the separate grey venue
  band is gone; the partitioned stripes are drawn through `closureBandLook` with their labels;
  the venue's open periods (per column: `cal.venueHours ?? venueHours`) feed the bounds; a
  linked column's closed minutes are `linked_venue_closed`; a hand-made block reads "Time
  blocked". `CalendarDayGrid` gains `calendarName` and a header row (name, hours, the clock
  corner); `AllCalendarsDayGrid` puts the hours under each name (`HEADER_HEIGHT` 32→40) and the
  clock button in the gutter corner; `WeekGrid` takes `calendarName` for its stripes.
- `lib/calendar/column-hours-label.ts`: `workingHoursLabel`.
- Tests: `schedule-closures.test.ts` (whole-day bands, the partition, the labels),
  `CalendarDayGrid.header.test.tsx` (both widening cases, the "both" stripe, the header and the
  clock), `CalendarDayGrid.closures.test.tsx` (labels updated), `occupying-blocks.test.ts`
  (unchanged: `linked_venue_closed` stays a wall).

## 14. Built: R33-3 (2026-09-11)

- `components/calendar/AmendHoursSheet.tsx`: the chooser (admins) with the web's two options
  and copy; staff are pushed straight to calendar hours. `amendCalendarHoursHref` →
  `/availability?tab=daysoff&date=&calendar=`; `amendBusinessHoursHref` → `/manage/hours?date=`.
- `app/(app)/(tabs)/index.tsx`: `onAmendHours` on both day grids (the day and the viewed
  calendar), the sheet, `isAdmin` from `staff/me`.
- `app/(app)/availability.tsx`: `?date=` (+ `?calendar=`) opens the closures tab with a new
  entry seeded to that day for that calendar, consumed once.
- `app/(app)/manage/hours.tsx`: `?date=` seeds the closures card's month and selection, so the
  Add button carries the day.
- Test: `AmendHoursSheet.test.tsx`.

## 15. Built: R33-5, R33-6 (2026-09-11)

- `lib/calendar/hours-mismatch.ts`: the web module on the app's resolvers
  (`venueDayContext`/`calendarHoursOutsideVenue` for weekly, `calendarHours` + `venueDayHours`
  for dated) with the web's sentences; `lib/calendar/hours-mismatch.test.ts`.
- `components/availability/HoursMismatchAdvice.tsx`: the amber card with the action button and
  Dismiss.
- `WorkingHoursEditor.tsx` (inline: the card, "Open business hours"; in a Sheet: a toast),
  `ScheduleTimelineSheet.tsx` (every period's weeks, by toast), `app/(app)/manage/hours.tsx`
  (after a save, roster from `usePractitioners`, "Open calendar hours"),
  `AvailabilityBlocksSection.tsx` (after a closure or amended-hours save, via the form's new
  `onSaved`, "Open calendar closures").
- `AvailabilityBlocksSection.tsx`: the type chooser is one button per kind with the web's
  hints; labels in sentence case; the button reads "Add closure or amended hours" (with the
  picked day); the card is "Closures & amended hours"; `initialDate` seeds the picker.

## 16. Built: R33-7 (2026-09-11)

- `types/reports.ts`: the report types. `lib/queries/keys.ts` + `lib/queries/useBookedRevenue.ts`
  (Bearer, `keepPreviousData`, 30 s stale). `lib/reports/booked-revenue.ts`: presets, grains,
  the ten bar colours, the query string, period and chart labels, net-with-no-shows, the CSV
  rows and filename; `booked-revenue.test.ts`.
- `components/reports/SvgStackedBarChart.tsx`: horizontal stacked bars (a phone reads rows
  better than the web's vertical bars), tap for a per-calendar readout, legend.
- `components/reports/BookedRevenueSection.tsx`: the web section — range chips and custom range
  (native pickers), Show by, Include no-shows, the three tiles, the unpriced and linked notes,
  the chart, the table (horizontal scroll, Today row, No-shows column, linked venue captions),
  Export CSV through `buildAndShareCsv`; `BookedRevenueSection.test.tsx`.
- `app/(app)/reports.tsx`: the Revenue sub-tab; the range toolbar hides on it; the section
  renders outside the overview query's gating.
- **App addition (the owner's ask, same day):** forward/back arrows under "Show by" step the
  range one period by the grain — a day, seven days, or a calendar month — keeping its length
  (`shiftBookedRevenueRange`); the range becomes a custom one and the pickers follow. The web
  has no such stepping.

## 17. Built: R33-8 (2026-09-11)

- `components/messaging/GuestMessageComposerHint.tsx` (+ test): the hint, the counter, the
  segment budget. Mounted in `MessageGuestSection.tsx` (4 rows, cap 2,000),
  `GuestMessageSheet.tsx` (5 rows) and `BulkActionSheets.tsx` (7 rows; the note is the web's
  description; the result toast says "N skipped (no marketing permission or contact details)").
- `lib/guests/marketing-permission.ts` (+ test): `hasMarketingPermission`,
  `marketingSkipReason`, `marketingPermissionSummary`.
- `MarketingPreferencesCard.tsx` and `GuestEditSheet.tsx`: "Opted out of marketing" /
  "Marketing consent given", the web's explanation, the status line; the toggles exclude each
  other (the edit sheet locally, the client screen by sending both flags, which the web route
  does too).

## 18. Verification and what is owed

`npx tsc --noEmit` clean; `npx expo lint` 0 errors (the 244 warnings are pre-existing test-file
import-order notes); the new and touched suites pass. Not done here: a device pass of the clock
button and the stripes on a real diary (own, linked and amended-hours columns), and the Revenue
tab against staging with a linked venue; then an OTA (the R28–R31 batches are also not in one
yet). Both are owed, as after R31.
