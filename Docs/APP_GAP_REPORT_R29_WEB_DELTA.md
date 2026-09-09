# App gap report R29: the web delta `19d31463..d8a9f6a8` (2026-09-09)

The read-only reference clone (`_reference/Resneo`) was refreshed from web `main`, which had
moved two squashes on from web #185: **#186** (the calendar and the modify form always send the
outside-hours override; the validator reports whether it was needed) and **#187** (the five-plan
batch: services in a visit move and complete independently, the staff "override availability"
tick box, per-calendar amended hours, collective service sync, and the combined page opening by
default under Settings → Booking Page). 141 files, +11,256 / -3,275. `origin/staging` (`336ddb29`)
is the pre-squash form of #187, tree-identical to `main`.

This report is the audit of that delta from the app's side, against the web team's own summary of
the push. Nothing in it has been built yet; each finding says what the web changed, what the app
does today, and what the port is. Per [[plan-docs-vs-shipped-code]] every claim was checked against
the implementation in the clone (the visit schedule route, `visit-status-scope.ts`,
`staff-availability-override.ts`, `calendar-amended-hours/route.ts`, `processing-time.ts`,
`linked-accounts/catalogue.ts`, the create routes) rather than against the plan documents, and the
web summary was corrected where the code disagrees with it (§2).

## 1. Summary

| # | Finding | Severity | Verdict |
|---|---|---|---|
| R29-1 | The visit schedule endpoint's body is now `shift` OR `services`; the app still sends the deleted flat fields, so every visit move, resize, reschedule, Modify open/check/save and undo answers 400. A multi-service visit cannot be moved or modified from the app | **Breaks live flow** | **Built** 2026-09-09 (§3, §16) |
| R29-2 | Start and Complete are per service now; the app's bar quick actions fan Seated/Completed out to every row of a visit (re-imposing the old cascade), the bar takes its colour and actions from the lead row, and the detail panel has no per-row Start/Complete and no derived visit status | Wrong behaviour | **Built** 2026-09-09 (§4, §17) |
| R29-3 | The app's visit model assumes one day and one calendar; the web now lets a visit's services sit on different days and calendars, so chain/gap maths and the Bookings-tab collapse are wrong for such a visit | Wrong data | **Built** 2026-09-09 (§5, §18) |
| R29-4 | Calendar: the app merges a visit into one bar; the web now draws one bar per service with a visit chip, shared palette and spine, and per-row drag/resize | Parity, a decision | **Built** 2026-09-09, option 2 (§6, §19) |
| R29-5 | Linked venues: the siblings query never sends `owner_venue_id`, so a visit opened from a partner column shows one service; the linked-calendar feed's new `groupBookingId` / `personLabel` are ignored | Parity | §7 |
| R29-6 | Hours: the app already meets the whole written-down contract (409 → confirm → acknowledge, ISO `days_off` never sent). The "crashed and did not save" report matches a pre-existing APP defect: the "Save anyway?" ConfirmSheet is a second modal opened over the hours Sheet, which iOS drops silently | **Breaks live flow (iOS), app-side** | Build (§8) |
| R29-7 | Per-calendar amended hours, read side: closure bands and the Working-today chip already honour `availability_exceptions`; the web deploy alone lights them up. The schedule-preview month grid ignores overrides | Wrong data (small) | Build (§9) |
| R29-8 | Per-calendar amended hours, write side: no editor in the app (`PUT/DELETE /api/venue/calendar-amended-hours`) | Parity | §9 |
| R29-9 | Staff "Override availability": additive; the app has no tick box. Walk-in keeps its own silent bypass | Parity, a feature | §10 |
| R29-10 | Card holds: the server default flipped to no hold; the app always sends the toggle explicitly for a card-hold entity, so nothing changes on the wire. The app's toggle still DEFAULTS ON and its copy is the old one; seven comments state the wrong server default | Parity (UX drift) | Build (§11) |
| R29-11 | Canonical processing shape: the calendar, wizard chain, Modify sheet and detail already agree with it. But lengthening a service in the app's form without touching its periods silently reverts the length on save (the server re-fits the stored blocks and canonicalises) | Wrong data, both sides; local fix | Build (§12) |
| R29-12 | Collective service sync: additive; the app's catalogue builder keeps working but shows no sync state and lacks the three new actions. Booking-page settings: the combined page URL has no Copy in the app | Parity | §13 |
| R29-13 | #186: the app already sends the outside-hours override on every calendar move, reschedule and Modify save. The dry runs now echo `outside_hours`; the app could show the web's amber note | Parity (minor) | §14 |
| R29-14 | Modify sheet: the web edits each service of a visit on its own (date, time, calendar, length, `services` mode); the app moves the visit as one shift and changes only the last service's length | Parity, added 2026-09-09 after R29-3 | **Built** 2026-09-09 (§20) |

Everything else in the delta is server-side or web-only and inherited: the post-visit thank-you
sending once after every live service is Completed (cron); `availability_override_warnings`,
`assigned`, `sync`, `originVenue*`, `availability_exceptions`, `end_date`, `outside_hours` and the
per-service `calendar_id` are all additive keys the app's structural types ignore (there is no
strict decoder anywhere; `apiFetch` is a bare `JSON.parse`); the drag drop-outline and per-row
hover on the web diary; the Settings → Booking Page scope switch; the help-article rewrites; the
`Docs/*` plans; and, server-side, the engine's collect mode, the amended-hours mirror into
`calendar_date_overrides`, and both migrations (`20270208120000` is data-only and does not touch
bookings; `20270209120000` adds nullable/defaulted columns).

## 2. Corrections to the web summary

Three details in the push summary differ from the code and matter for the port:

- **The bookings list is `GET` with query parameters**, not `POST`: `?group_booking_id=<uuid>&owner_venue_id=<uuid>`
  (`src/app/api/venue/bookings/list/route.ts:71,104-125,186`), rows filtered to the grant's
  calendars (`:236-245`). The app already uses the GET form.
- **The linked-calendar route emits camelCase** `groupBookingId` / `personLabel`
  (`linked-calendar/route.ts:466-467`), not `group_booking_id` / `person_label`.
- **Amended hours is `GET / PUT / DELETE`**, not POST (`calendar-amended-hours/route.ts:44-69`).

And one correction to a web test comment: `route.card-hold.test.ts:127-138` says "the app relies on
this default"; it does not (§11).

## 3. R29-1: the visit schedule endpoint (breaks live flow)

**Web.** `PATCH /api/venue/visits/[groupBookingId]/schedule` (`route.ts:47-116`) now takes

```
shift?: { booking_date?, booking_time?, practitioner_id? }          // {} allowed: "describe the visit as it stands"
services?: [{ booking_id, booking_date?, booking_time?, practitioner_id?, duration_minutes? 5..840 }]  // 1..12
known_booking_ids?: uuid[]   allow_manual_overlap?  allow_outside_hours?  allow_during_breaks?
dry_run?  defer_modification_guest_notification?  skip_booking_modification_guest_notification?
.refine(exactly one of shift | services)   →  400 "Send either a shift for the whole visit or a list of services to change."
```

The old top-level `booking_date` / `booking_time` / `practitioner_id` / `total_duration_minutes`
are gone; shortening one service no longer pulls the next forward. The response keeps its shape and
gains `end_date`, `outside_hours` and per-service `calendar_id` + `changed`. New errors: 412
`{ code: 'stale_visit' }` when `known_booking_ids` does not match (`:269`), 409 `{ service_id,
reason }` per refused service (`:397-407, 508-515`).

**App.** `lib/queries/useVisitMutations.ts:20-51` (`VisitSchedulePatchInput`) still models the
removed flat fields and every caller sends them, never `shift` or `services`:

| Caller | Lines | What happens now |
|---|---|---|
| Calendar drag / resize of a visit bar | `app/(app)/(tabs)/index.tsx:1387-1405` | 400; the refine sentence shows as a refusal, the bar reverts |
| Calendar Undo of a visit move | `index.tsx:506-521` | 400 |
| RescheduleSheet, visit path | `components/calendar/RescheduleSheet.tsx:134-144` | 400 |
| ModifyBookingSheet opening plan (`dry_run` + flat date/time) | `components/bookings/ModifyBookingSheet.tsx:1246-1251` | 400 swallowed at `:1283-1286`; `visitPlannedMinutes` / `serviceLines` / `knownBookingIds` never set, so add/remove/swap service is switched off (`canEditVisitServices`, `:973`) |
| ModifyBookingSheet live check | `:1145-1153` | the 400 reads as "this time is refused" (`:1162-1163`) |
| ModifyBookingSheet save / undo | `:1360-1375`, `:1475-1489` | 400 |

Net: a multi-service visit cannot be moved, resized, rescheduled, modified or re-serviced from the
app today. Single-service bookings are unaffected (they use `PATCH /api/venue/bookings/[id]`).

**Port.** Replace the input type with a `shift` | `services` union. Whole-bar drag, RescheduleSheet
and the Modify sheet's "Visit start" become `shift: { booking_date, booking_time, practitioner_id }`;
a resize becomes `services: [{ booking_id, duration_minutes }]` for the row being stretched (the
"total span" concept is gone, see §5); the Modify sheet opens with `{ dry_run: true, shift: {} }`
to learn the layout; send `known_booking_ids` on every `services` write; handle 412 `stale_visit`
by re-fetching the visit and re-opening; read `end_date`, `outside_hours` and per-service
`calendar_id`. The `services` endpoint (add/remove/swap) did not change beyond the additive
`outside_hours`.

## 4. R29-2: Start and Complete are per service

**Web.** `bookings/[id]/route.ts:1387-1393` enters the cascade only when
`statusChangeCascadesAcrossVisit(prev, next)` (`src/lib/booking/visit-status-scope.ts`) is true,
which is false whenever either side is `Seated` or `Completed`. So Start, Complete and their undos
write one row; Confirm and its undo, `client_arrived`, `staff_attendance_confirmed`, Cancel and
No-Show still cascade. A Confirm cascade skips a sibling already Seated/Completed
(`group-booking-status-sync.ts:192-201`). The visit's state is derived (`visitLifecycleStatus`):
Completed when every live row is, Seated when any is, otherwise the earliest stage. The web detail
panel shows per-row Start/Complete under "Services in this visit" and a derived visit pill; the
bookings lists collapse on group id AND date and label a lone row on another day "Part of a visit".

**App.**

- Bar quick actions: `lib/calendar/bar-actions.ts:20-25` (`statusChangeTargets`) returns every
  segment not already at the target status; `CalendarDayGrid.tsx:594` / `AllCalendarsDayGrid.tsx:899`
  hand that to `index.tsx:1755-1790` (`runBatchAction`), which PATCHes each id. A tray "Start" on a
  visit bar still Seats every service, N single-row PATCHes, re-imposing the cascade the web just
  removed. The bar's colour, actions and arrival state come from the lead row only
  (`CalendarDayGrid.tsx:921,929,940-942`): a visit whose colour is Completed and whose cut is
  Seated draws as Completed and offers Reopen.
- Detail panel: `BookingDetailContent.tsx` derives `canModify`, attendance gating and the revert
  actions from the tapped row's `booking.status` (`:719, :775, :924-934`). `GroupVisitCards.tsx:97,137`
  already shows a `StatusPill` per row, so per-service status is visible, but there is no derived
  visit pill and no per-row Start/Complete. Header Start/Complete PATCH one row, which is right under
  the new rule, but staff have no way to start the second service without opening it.
- Lists: `lib/booking/collapseMultiServiceVisits.ts:50-79` collapses on group id alone and shows
  the earliest row's status.

**Port.** `visitLifecycleStatus` in `lib/booking/appointment-visit.ts`; per-row Start/Complete
buttons in `GroupVisitCards` and a derived pill in the header; `statusChangeTargets` fans out only
for Arrived, Confirm, Cancel and No-Show (the web's `quickPatchBookingCluster` keeps Arrived
visit-wide) and targets the pressed row for Seated/Completed; the bar's status from the derived
visit state (or per-row bars, §6); `collapseMultiServiceVisits` on group id + date with the derived
status and the "Part of a visit" label.

## 5. R29-3: a visit may span days and calendars

`lib/booking/appointment-visit.ts:44-86` (`VisitServiceRow` / `AppointmentVisit`) carries only
`booking_time` / `booking_end_time`, no `booking_date` or `calendar_id`. With `services` mode a
visit's rows may sit on different days and calendars, so `startHm` / `endHm` / `totalMinutes` and
the gap maths are computed from clock times alone (a Monday 10:00 + Tuesday 10:00 visit reports a
zero-minute chain). `collapseMultiServiceVisits.ts` and the Bookings tab
(`app/(app)/(tabs)/bookings.tsx`) inherit it. Port with R29-1: carry date and calendar on the row,
compute spans per day, and treat cross-day rows as separate list lines.

## 6. R29-4: one bar per visit, or one per service

`lib/calendar/cluster-bookings.ts:136-161` merges by `group_booking_id` (max-end span, `:118`),
used by `CalendarDayGrid.tsx:303`, `AllCalendarsDayGrid.tsx:290`, `WeekGrid.tsx:126`. The web's
cluster now returns singles and adds a `VisitChip` ("Visit · 2 of 3"), a shared palette, hover
highlight and a spine between touching same-column siblings (`src/lib/calendar/visit-siblings.ts`),
with per-row drag/resize and an optional "move the rest of the visit" follow-up (shift mode). The
app's drag path gates on `cluster.isVisit` (`:121`) to send a whole-visit move.

Two ways to close R29-1 here, in order of size:

1. **Keep the merged bar** and send `shift` for a drag and `services` for a resize of the last
   row. Smallest change; it hides a visit whose rows overlap each other (now permitted and warned
   on the web) and cannot show per-row status (§4).
2. **Port per-row bars** with `visit-siblings.ts` (chip, palette, spine), per-row drag/resize, and
   the "move the rest" follow-up. Full parity; it also removes the special cases in
   `clusterCalendarBookings` that [[multi-service-calendar-bars]] recorded.

Recommendation: option 2, because §4 needs per-row status on the bar anyway and option 1 leaves
the calendar contradicting the detail panel.

## 7. R29-5: linked visits

`lib/queries/useGroupVisit.ts:32-49` calls the list with `group_booking_id` only, and
`BookingDetailContent.tsx:656` passes only `booking.group_booking_id`, so a visit opened from a
partner column returns nothing (or 403) and the panel shows a single service. The web list now
accepts `owner_venue_id` under a `full_details` grant. Separately `types/linked-venues.ts`
(`LinkedBooking`) has no `groupBookingId` / `personLabel` and `lib/linked/linked-calendar-view.ts`
never sets `group_booking_id` on the grid row, so partner columns stay one bar per row (which now
matches the web's own view, so this only matters for the chip and palette of §6). Port: add
`ownerVenueId` to `useGroupVisitBookings`; decode the two camelCase keys from
`/api/venue/linked-calendar`.

## 8. R29-6: the hours "crash" is an app-side stacked modal

**The contract is already met.** Nothing in the hours contract changed in this delta; the
`MOBILE_API.md` section documents what has stood since 2026-06-15 (409) and 2026-08-18 (ISO
`days_off`). The app:

- sends `working_hours` keyed `"0"`..`"6"` with `[{ start, end }]` in `HH:mm`
  (`components/availability/WeeklyHoursFields.tsx:30-38, 114-116`), `break_times` +
  `break_times_by_day` (`BreaksEditor.tsx:224-229`), `schedule_periods` object/null; every field
  matches the route's zod and the staff allowlist (`practitioners/route.ts:785`);
- never sends `days_off` (`types/availability-manage.ts:77-95` has no such member; the only
  creator sends `{ name }`, `BookableCalendarsManager.tsx:620`);
- posts venue hours to `PATCH /api/venue/opening-hours`, never `PATCH /api/venue`
  (`lib/queries/useVenueSettings.ts:180-199`);
- catches 409 `requires_confirmation` and re-sends with `?acknowledge_affected_bookings=true` in
  all three editors: `WorkingHoursEditor.tsx:76-100`, `ScheduleTimelineSheet.tsx:114-131`
  (including the copy-to-N-calendars loop, `:166-190`), `app/(app)/manage/hours.tsx:127-157`;
  threaded by `useAvailabilityManage.ts:238-249`;
- cannot throw on an unexpected 409 body: `apiFetch` (`lib/api/client.ts:341-346`) always builds a
  string message, `affected_bookings` is `unknown` and never mapped, and the ConfirmSheet gets a
  string. The 500 `Could not verify existing bookings…` surfaces verbatim in a toast;
- tolerates the new `availability_exceptions` key on every calendar row (`types/practitioner.ts`
  is a plain interface).

**The likely cause.** The calendar-hours editors are rendered inside a `Sheet`
(`app/(app)/availability.tsx:1236-1250` hours, `:1278-1290` timeline), and their "Save anyway?"
confirm is a `ConfirmSheet`, itself a `Sheet` (`components/ui/ConfirmSheet.tsx:4`), rendered as a
sibling while the outer sheet is visible (`WorkingHoursEditor.tsx:153-164`,
`ScheduleTimelineSheet.tsx:450-451`). [[ios-no-stacked-modals]] records exactly this: the second
modal never presents on iOS, so on precisely the hours edits that orphan a booking the user sees
nothing happen and nothing saved. "Several calendars' hours" matches the timeline sheet's copy
loop, which awaits a confirm per calendar. The venue-hours screen is a full route, so its confirm
works. Port: fold "Save anyway?" into the editor as an in-sheet step (the pattern the memory
prescribes), in both editors.

## 9. R29-7 / R29-8: per-calendar amended hours

**Web.** `src/app/api/venue/calendar-amended-hours/route.ts`:

```
GET  ?from&to[&practitioner_id]  → { entries: [{ kind: 'hours'|'closed', date_start, date_end, periods, reason, calendar_id, calendar_name }] }
PUT  { practitioner_id? | apply_to_all_active?, date_start, date_end, periods: [{start,end}] 1..6, reason?, replace?: { date_start, date_end } }
     → 400 over AMENDED_HOURS_MAX_DATES; 403 apply_to_all_active for non-admin; 409 { error } when full-day leave sits in the range;
       409 { requires_confirmation, affected_count, affected_bookings, message } unless ?acknowledge_affected_bookings=true; 200 { updated, calendar_ids }
DELETE { practitioner_id, date_start, date_end } → { ok: true }
```

Stored as `unified_calendars.availability_exceptions[date] = { periods, reason? }` (closed days
already lived there), mirrored fail-soft into `calendar_date_overrides` `hours` rows. The
practitioners GET now returns the column on every row; until #187 it was dropped by the row mapper.

**App, read side.** `lib/calendar/calendar-hours.ts:115-133` (`calendarHours`) already applies
`availability_exceptions` first, above `days_off` and the schedule period, the same precedence as
the web; it feeds the closure bands (`lib/calendar/schedule-closures.ts:189`, all three grids and
`index.tsx:1005-1030`) and the Working-today chip
(`lib/calendar/calendar-has-hours-on-date.ts:49,69` → `index.tsx:1908`). The app was starved of the
data, not missing the code: once the web deploy serves the column, a calendar amended to work a
day it normally does not, or different hours, draws the right bands and counts as working today
with no app change. Owed: a device check. The one read-side gap is the schedule-preview month
grid: `components/availability/SchedulePreviewCalendar.tsx:131-175` (`summariseScheduleDay`) takes
no overrides and `ScheduleTimelineSheet.tsx:321` passes only `days_off`, so an amended day shows
the weekly hours or "Day off". Port: add `overrides` mirroring the web's `summariseDay`
(`ScheduleCalendarPreview.tsx` diff, reason `'amended'` + `overrideReason`), thread
`calendar.availability_exceptions`, add an "Amended hours" reason line.

**App, write side.** Nothing calls the route. The app's closures picker is venue-wide
`availability_blocks` ([[closures-calendar-2026-06]]) and staff leave goes through
`useCreateLeave` / `useUpdateLeave` (`app/(app)/availability.tsx:310-311`). The web's leave panel
gained a "Closed / Working different hours" choice with up to three periods, a note and
apply-to-all. Port: a mode in the app's leave sheet that PUTs the schema above, handling both 409
shapes, plus an "Upcoming amended hours" list fed by GET with DELETE. Feature parity only; the
plan's own handover says no app change is needed to keep working.

## 10. R29-9: staff "Override availability"

**Web.** `override_availability: z.boolean().optional()` on `POST /api/venue/bookings`
(`route.ts:132-137`; applied at ~1048-1063 past-date refusal, ~1073-1078 unassigned service
allowed, ~1183-1200 `overrideWarningsForInterval` replacing both the grid recheck and the walk-in
branch, ~1541-1548 timeline event, 1773 `availability_override_warnings` on the 201; appointments
only) and `POST /api/booking/create-multi-service` (`:124-130, 184-190`; a non-staff source gets
400 "Override availability is for staff bookings only."; warnings prefixed with the service name).
`POST /api/booking/validate-appointment-slot` takes the flag plus `duration_minutes` and answers
`200 { ok: true, warnings }` or `200 { ok: false, error }` (engine refusals are never 4xx there).
`GET /api/booking/appointment-catalog?override=1` needs a staff session, forces hidden add-ons on,
lists every active calendar with every active service, each with `assigned: boolean`; a collective
id needs member staff. Hard refusals that survive: past date ("Choose today or a later date."),
unknown/inactive calendar or service, length outside limits, an impossible processing pattern.
Actor: own venue, a live-collective member, or a `create_edit_cancel` link.

**Walk-in relation.** `if (staffWalkIn && !staffOverride)` (`route.ts:~1265`): the silent walk-in
bypass is untouched for the app's `?intent=walk-in` flow ([[walk-in-bypasses-availability]]). The
override is a superset with different semantics: walk-in still needs the service assigned to the
calendar and applies the walk-in date rule, and records nothing; override lifts both and records
warnings + a timeline event. `startWalkInNow` (`ServiceBookingFlow.tsx:625-655`) should keep
`source: 'walk-in'`; the override would be an additional tick.

**App.** No tick box; nothing breaks (structural response types). To port:

- Tick box on the first step: `StaffPickerStep.tsx` (staff-first) and `ServicePickerStep.tsx`,
  driven from `ServiceBookingFlow.tsx:53-64, 310-333`. Web copy: label "Override availability",
  help "Book any service with anyone, on any date from today and at any time, even over other
  bookings. Use this to squeeze someone in. You will see what it overrides before you save."
  Toggling clears every choice (`resetWizard`, `ServiceBookingFlow.tsx:~850`).
- Catalogue: `useAppointmentCatalog.ts:31-54` gains an `override` option (`&override=1`, in the
  query key); hide the "Any available" row when on (`StaffPickerStep.tsx:89-92`,
  `ServicePickerStep.tsx:167`); show "Not usually offered by …" when `assigned === false`
  (add the field to `AppointmentCatalogService`). The linked-venue catalogue call currently uses
  `includeHidden: false` (`ServiceBookingFlow.tsx:181-183`); `override=1` implies hidden add-ons.
- Date: `MonthDatePicker.tsx:208-211` already disables past dates and treats
  `availableDates === null` as all-selectable; pass `null` and skip `useMonthAvailability`
  (`ServiceBookingFlow.tsx:907-918`).
- Time: replace the slot list (`TimeSlotStep.tsx:216`) with a typed time in 5-minute steps
  (`components/ui/TimePickerField.tsx`, already used by Modify/Reschedule) and synthesise the slot
  object the way `startWalkInNow` does (`ServiceBookingFlow.tsx:637-645`).
- Dry run: a new hook posting per segment `{ venue_id, service_id, practitioner_id, booking_date,
  start_time, phantoms, staff: true, override_availability: true, duration_minutes? }` to
  `validate-appointment-slot` (the app has never called it), branching on `ok` not status; render
  `warnings` as a "What this overrides" box on `MultiServiceReviewStep` / `ConfirmStep`.
- Create: `override_availability: true` in `buildPayload` (`ConfirmStep.tsx:350-376`) and
  `buildMultiServicePayload` (`lib/booking/multi-service-chain.ts:214-250`); read
  `availability_override_warnings` into `BookingConfirmation` (`ConfirmStep.tsx:83-98`) beside
  `compliance_warnings`. `GroupBookingFlow` did not gain the flag on the web; leave it.

## 11. R29-10: card holds

**Web.** `require_card_hold ?? false` at `bookings/route.ts` lines 525, 534, 543, 1389, 1669 and
`holdCards: input.require_card_hold ?? false` in `staff-visit-charge-discretion.ts:64`
(create-multi-service and create-group). The four web flows now `useState(false)` for the toggle,
and `src/components/booking/staff-card-hold.ts:16-24` carries state-aware copy: ON "On: the guest
gets a link to add their card, charged only if they do not show. The booking is cancelled if no
card is added within 24 hours."; OFF "Off: no card is taken, so a no-show cannot be charged." The
fee line under the toggle was deleted. `CARD_HOLD_LINK_TIMEOUT_HOURS = 24`
(`card-hold-terms.ts:294`).

**App, wire.** The field is sent whenever the entity resolves to `card_hold` with a positive fee
(`resolveStaffEntityCardHold`, `lib/booking/card-hold.ts:405-418`) and omitted otherwise:
`ConfirmStep.tsx:370` (single), `:396` → `staffChargePayloadFields`
(`multi-service-chain.ts:298-307`) (chain), `GroupBookingFlow.tsx:340-343`,
`BookingFlowPrimitives.tsx:255` (classes/events/resources). Tables post to the walk-in route. When
the field is omitted the entity is not card-hold (or has no fee, where a hold is meaningless), so
the server's default is irrelevant: **no booking changes behaviour**, and the web's test comment
that "the app relies on this default" is wrong.

**App, UX.** The toggle still defaults ON (`ConfirmStep.tsx:328`, `BookingFlowPrimitives.tsx:229`,
`GroupBookingFlow.tsx:153`), so app staff keep holding cards by default where web staff no longer
do. The sublabel is the old static "Send a link to the guest to add their card details" plus the
fee line (`card-hold.ts:271-283`, rendered by `StaffChargeControls.tsx:121-145`). Port: flip the
three initial states to `false`; replace the constant with ON/OFF sublabels and a
`CARD_HOLD_LINK_TIMEOUT_HOURS = 24`; drop the fee line from the toggle (the fee still shows on the
confirmation via `card_hold_fee_pence`). Tidy the comments that state the old default:
`StaffChargeControls.tsx:5-9, 113-118`, `BookingFlowPrimitives.tsx:227-229, 253-254`,
`ConfirmStep.tsx:318-327, 391-396`, `GroupBookingFlow.tsx:333-338`, `useCreateBooking.ts:55-60`,
`multi-service-chain.ts:274`, `multi-service-chain.test.ts:419`.

## 12. R29-11: canonical processing shape

**Web.** `canonicalServiceShape` (`processing-time.ts:511-548`) is applied on save
(`appointment-services/route.ts:800, 1459, 1789`; per variant in `service-variants.ts:37,121`), on
copy (`service-duplication.ts`, `service-sync.ts:73`) and on read (`route.ts:393`, the public
catalogue, the engine, the linked feed). A 120-minute service with a block 60..120 is now a
60-minute service with a block 60..120. New bookings get `booking_end_time` = start + 60 and the
snapshot `[60..120]`; bookings made before keep end = start + 120 with the same snapshot. The
migration is data-only and does not touch bookings.

**App, already right.** `lib/calendar/processing-gaps.ts:226-244` (`bookingFreeRegions`) handles
both shapes: canonical → core 60, no hole, tail 60 unpainted, buffer at `end + tail`
(`:299-345`); old shape → core 120 with a free hole 60..120. `processingGapRanges` (`:124-135`) is
not clamped, so another booking may share the lane in the tail. The wizard chain
(`multi-service-chain.ts:96-143`) places the next service at `start + 60 + 60 + buffer`, what the
server enforces. The Modify sheet takes the booked length from `booking_end_time`
(`booking-core-duration.ts:62-82`) and the detail shows "14:00 – 15:00 · 60 min", tail excluded,
as the web does. The web summary's "it still nests today" refers to the app drawing a visit's
services in one bar (§6), not to tails.

**The gap.** The app's service form sends `duration_minutes` on every save
(`app/(app)/manage/services.tsx:1165`) but `processing_time_blocks` only when the drafts changed
(`:1137-1139`), and never re-fits the drafts when the duration is edited
(`ProcessingTimeBlocksEditor.tsx` has no fit; the Modify sheet does, `ModifyBookingSheet.tsx:751,796`).
The server validates the STORED blocks against the NEW duration and canonicalises
(`route.ts:1441-1464`): a canonical 60 + `[60..120]` edited to 90 comes back as 60, the sheet closes
on success and the list shows "60 min" with no message. The web form has the same behaviour, so it
is not app-only, but the fix is local: re-fit `processingDrafts` with `fitProcessingBlocksToDuration`
when `duration` changes, and send the blocks whenever the duration changed. Shortening below a block
is refused by the app's own validator first (`ProcessingTimeBlocksEditor.tsx:85-89`).

**Edge, no change recommended.** A booking with no snapshot from an old-shape service (own
bookings before web #178; every partner-column booking made before the migration, since the linked
feed carries no snapshot, `processing-gaps.ts:369-373`) is re-fitted from the canonical template to
its real span, which shifts the tail to `[120..180]` and paints 120 busy minutes. The web's
`bookingTemplateProcessingBlocks` does the same; it self-heals as those bookings pass.

## 13. R29-12: collective service sync and the combined page

**Web.** Migration `20270209120000` adds `service_items.synced_from_service_id`, `sync_state`
(`independent | linked | customised`, default independent) and `synced_at`. `CatalogueProviderView`
gains `sync: { state: 'none' | 'independent' | 'linked' | 'customised', originVenueName, inStep }`
(`linked-accounts/catalogue.ts:223-232`); `CatalogueItemView` gains `originVenueId` /
`originVenueName` (`:252-257`). Batch actions gain `sync_provider`, `detach_provider`,
`link_provider` and `forceSync?` (`validation.ts:266-274, 320-322`; host-only, 409 on failure,
`catalogue/route.ts:536-588`). Only duration, buffer, processing blocks and variants are synced
(`service-sync.ts:32`); a member PATCH touching them flips `linked` → `customised`
(`appointment-services/route.ts:1490-1497`). The services GET rows carry the three columns too.

**App.** Nothing breaks: all new keys are optional on the wire and `create_items` /
`set_providers` (`components/linked/CollectiveCatalogueBuilder.tsx:89-91,476`) keep working; the
tick now yields a `linked` copy with no app involvement. Missing: `sync` / `originVenue*` on
`types/collectives.ts:114-142`, the three actions on `CatalogueAction` (`:202-211`), and a chip in
`CalendarRow` (`:564-577`) equivalent to the web's `SyncChip` (`CombinedPageManager.tsx:1840-1960`:
"in step with X" / "update available → Update now" / "customised at Y → Re-sync" / "independent
copy → Link to X and update", plus "Stop syncing"), with the rewritten item helper copy
(`:1682-1688` vs the app's `:398-401`). Neither side shows "follows X" on a member's own service
form; not a gap today.

**Combined page.** Web-only per the team (`CombinedPageScopeSwitch`, `?scope=own`). The app's
`CombinedPageNotice` (`components/linked/CombinedPageNotice.tsx:17-56`, used at
`app/(app)/manage/booking-page.tsx:524-529`) already leads to the same manager. The one concrete
gap: the Public URL + Copy on that screen is the venue's own `/book/{slug}` only
(`booking-page.tsx:404-411`); the combined address exists only as "View page" on the collectives
list (`collectives/index.tsx:180` via `lib/linked/collective-page.ts:24-27`) with no Copy. Show the
combined URL + Copy in the notice for host and member.

## 14. R29-13: #186, outside-hours edits

The app already sends `allow_outside_hours: true` on every calendar move and undo
(`useBookingMutations.ts:242,315`, `index.tsx:514,1395`), on RescheduleSheet (`:142`) and on the
Modify sheet's check, save and undo (`ModifyBookingSheet.tsx:1107,1369,1482`), so the capability
matches. New and unread: `validate-appointment-modification` answers `{ ok: true, outside_hours }`
(`route.ts:141`; typed `{ ok: true }` at `useBookingMutations.ts:466-468`), and the visit dry run
answers `outside_hours` too. The web shows an amber "outside working hours" note from it rather
than from its own reading of the stripes. Port: read the flag and show the note in the Modify
sheet; the calendar's amber note can keep using the bands.

## 15. Build order

1. **R29-1** (hard break, one type + six call sites) with **R29-3** (date + calendar on the visit
   row) and the calendar decision of **R29-4**.
2. **R29-2** per-service Start/Complete, derived visit status, list collapse on date.
3. **R29-6** un-nest the two hours confirms (the iOS "did not save").
4. **R29-10** toggle default + copy; **R29-11** service-form re-fit; **R29-7** preview overrides;
   **R29-13** the amber note. Small, independent.
5. **R29-5** linked siblings; **R29-12** sync chip + combined URL.
6. **R29-9** override availability; **R29-8** amended-hours editor. Features.

Then a device pass on: a visit moved and resized from the calendar and the Modify sheet; Start on
the second service of a visit; hours saved for two calendars when a booking is orphaned (iOS);
a calendar amended on the web to work a Sunday, drawn in the app's grid and Working-today chip.

## 16. Built: R29-1 (2026-09-09)

The merged bar stays (R29-4 option 1 for now); every visit schedule write moved to the new
contract through one pure builder, `lib/booking/visit-schedule-request.ts`:

- `visitScheduleRequest` answers `{ shift }` for a move alone, and `{ services, known_booking_ids }`
  when the length changed: every row named with its shifted start (and the chosen calendar), the
  change on the LAST service, floored at 5. `visitRestoreRequest` names every row with the slot and
  length it had, for Undo after a length change; a plain move is undone with a shift back.
- `VisitEditTarget` carries `services[]` (id, start, length) via `toVisitEditTarget`, built in the
  calendar screen and the detail panel; `visitLengthFloorMinutes` and `clusterLengthFloorMinutes`
  replace the old per-service-count floor on the stepper and the drag (a 135-minute visit whose
  last service is 15 minutes floors at 125, because an earlier service is changed from its own
  booking now that shortening one no longer pulls the next forward).
- Calendar drag/undo (`commitVisitDrag`, `undoReschedule`), `RescheduleSheet`, and the Modify
  sheet's open (`{ dry_run: true, shift: {} }`, whose rows become the edit's rows), check, save
  and undo all build from it. The Modify sheet's "re-lay the visit / dead time" notice and its
  `changed`-armed save are gone: services are independent, an empty shift changes nothing.
- `VisitSchedulePlan` gains `end_date`, `outside_hours`, per-service `calendar_id` / `changed`.

Not in this build: R29-3 (cross-day/cross-calendar rows) and R29-4 option 2 (per-row bars).
Device pass owed.

## 17. Built: R29-2 (2026-09-09)

`lib/booking/visit-status.ts` ports `statusChangeCascadesAcrossVisit`, `isServiceLevelStatus`,
`isTerminalVisitStatus` and `visitLifecycleStatus`. Then:

- **Calendar bar.** `CalendarBookingCluster.status` is the visit's derived status (a standalone
  booking's own), and every grid colours, gates the drag and picks the tray from it. On a visit
  bar `statusChangeTargets` targets ONE service for the service-level presses: Start → the next
  service not yet begun, Complete → the service(s) in progress (else the next not done), Undo
  start → the service(s) in progress, Reopen → the last one finished. Confirm, Accept, Arrived,
  Cancel and No-show still fan out (the server cascades them either way).
- **Detail panel.** The header pill and its actions come from the derived status; on a visit the
  header keeps only the visit-wide actions (Accept, No-show, Cancel). "Services in this visit"
  carries per-row Start / Complete / Undo start / Undo complete (`GroupVisitCards`, each row its
  own `useUpdateBookingStatus`), gated on the edit grant and never on a table reservation. Copy
  under the heading says which actions are per service and which are visit-wide.
- **Lists.** `collapseMultiServiceVisits` collapses per group AND day, carries the derived status
  on the representative, and marks a lone day of a visit (`visit_spans_days` /
  `visit_rest_hidden`); `BookingRow` reads "Part of a visit" on it.

Not changed: the merged bar (still one bar per visit, §6), the per-row PATCH fan-out for the
cascading statuses (redundant but harmless), and the linked-venue siblings (R29-5).

## 18. Built: R29-3 (2026-09-09)

The visit model carries each service's day and calendar:

- `VisitServiceRow` reads `booking_date` / `calendar_id` / `practitioner_id`; `VisitService`
  carries `date` and `calendarId`; `resolveAppointmentVisit` orders by day then start, counts
  the span and the gaps across days (`dayOffset`), and reports `startDate`, `endDate`,
  `spansDays`, `spansCalendars`. `VisitEditService` carries `date` / `calendarId` and
  `VisitEditTarget` carries `spansDays`.
- `visitScheduleRequest` takes `fromDate` and, in `services` mode, shifts each row's OWN day by
  the day delta rather than putting every row on the target day; `visitRestoreRequest` puts each
  row back on its own day. New `mode: 'services'` and `guardKnownRows: false` for a caller that
  holds only part of the visit.
- The calendar holds one day, so its drag now names the rows it can see (`services` mode, no
  known-rows guard, which would otherwise 412 on a visit with a service on another day); a
  service on another day stays put. Its undo restores exactly those rows.
- Detail header: a visit over several days reads "Wed 10 Sep – Thu 11 Sep" and
  "14:00 – 10:00 over 2 services"; the Reschedule sheet gets no length control for it. The
  "Services in this visit" card says "over N days", prints each row's day and, when the calendars
  differ, its calendar name, and totals the services rather than the span.
- Modify sheet: the plan's rows carry `booking_date` / `calendar_id`; the visit-length stepper is
  replaced by the read-only panel on a visit that spans days (the services keep their own
  lengths); a move stays a shift, which keeps the cross-day offsets server-side.

Not in this build: a per-service date/time editor in the Modify sheet (the web's `services`
mode editors); the app changes a visit's services' lengths only through the last service.

## 19. Built: R29-4, option 2 (2026-09-09)

One bar per service, as the web draws it since #187:

- `clusterCalendarBookings` no longer merges the rows sharing a `group_booking_id` (visit or
  party): one cluster per booking, keeping the cluster shape so the grids, the tray targets and
  the drag kept their plumbing. Each cluster carries `visit: VisitPosition | null` from the new
  `lib/calendar/visit-siblings.ts` (a port of the web module: `visitSiblingIndex`,
  `visitChipLabel`, `visitTouchingEdges`, `ownSiblingOverlapCount`).
- The bar: a "Visit 1/2" chip ahead of the name, the visit's earliest service's colour on every
  bar (`paletteStatus`; the tray and label still read the row's own status), and a short spine
  in the visit's accent across the seam where two of its bars touch in one column. The
  multi-calendar grid counts the chip over the whole day (a visit split across columns), the
  spine only within a column.
- The drag: each service moves and resizes on its own. `commitVisitDrag` names that row alone
  (`services` mode, no known-rows guard), undo restores that row, the guest email is deferred
  against the moved row, and a bar's conflict check ignores its visit's live siblings so landing
  on one is allowed but toasted ("This now overlaps another service of the same visit."). The
  notice reads "Service moved" / "Service length updated". No "move the rest" follow-up: the web
  has none.
- Quick actions write the pressed bar's row; R29-2's per-service targeting on a merged bar is
  gone with the merged bar (the server still cascades the visit-wide facts).
- Gone: the visit-wide drag floor, the merged bar's per-segment labels and wait holes (the wait
  between two services is grid now), and the drag gate on `isVisit`. `bar-actions.ts` is back
  to its one rule.

Device pass owed: three services of a visit drawn as three bars with chips and spines; one
dragged onto another (allowed, toasted); one resized; Start on the second bar only.

## 20. Built: R29-14, per-service editors in the Modify sheet (2026-09-09)

The Modify sheet now has the web form's second mode. Under "Services in this visit" each row
shows its own day, start and length on one line with an "Edit time" toggle; opened, it offers a
date picker, a time picker, the calendar chips and a length stepper for that service alone
(`serviceEdits` / `baselineServiceEdits`, seeded from the opening `shift: {}` plan's rows).

- **Request.** `visitServiceEditsRequest` (`lib/booking/visit-schedule-request.ts`) names only
  the rows whose edit differs from the baseline, each with exactly the day, start, calendar and
  length asked for, plus `known_booking_ids` for every row the sheet opened on. The live check
  and the save build the same body; the check signature carries the edits.
- **Exclusive modes**, as the web: while a service is being edited, the visit's date control,
  start picker and calendar chips are inert and the length panel reads "Each service keeps its
  own length while you edit services below"; while the visit is moved as one (or its service
  list rewritten), the per-service toggles are disabled. Copy under the list: "Only the
  services you changed move; the rest stay where they are."
- **Notify and undo.** A per-service edit counts as a schedule change for the deferred guest
  email and the Notify / Don't notify / Undo step; Undo names every row with the slot and length
  the sheet opened with (`visitRestoreRequest`).
- The "Visit length" stepper (the last-service rule from R29-1) stays for a visit that is moved
  as one; the web has no such control, but it is the quick path for the common case.

Tests: five new cases in `ModifyBookingSheet.test.tsx` (the named row only, a day + calendar +
length change, the lock in both directions, undo), two for the builder.
