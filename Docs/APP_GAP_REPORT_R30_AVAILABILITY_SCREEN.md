# App gap report R30 — the Availability screen, second pass (2026-09-10)

A tab-by-tab audit of the app's Calendar availability screen against the web's
`/dashboard/calendar-availability` page (`AppointmentAvailabilitySettings.tsx`
at web `d8a9f6a8`, #187), followed by the build. The web page has four tabs:

| Web tab | Web component | App before this pass |
|---|---|---|
| Calendars (admin) | `BookableCalendarsPanel` | a separate route behind a header icon |
| Availability | `WorkingHoursEditor` + `ScheduleTimelineEditor` | a "Working hours" list with Edit hours / Edit breaks / Plan hours ahead sheets |
| Breaks | `BreaksScheduleEditor` | the breaks sheet, 15‑minute steppers, a switch to fan out |
| Closures & amended hours | `StaffLeaveCalendarPanel` | a "Closures & amended hours" section plus an app-only Block time list |

Four audits ran in parallel, one per tab. Every gap they listed is below with
what was built. **All of it is built** (commit on `main`, no OTA yet).

## 1. The frame

Built: `app/(app)/availability.tsx` is now a tabbed screen mirroring the web —
`Calendars` (admin only, embedding `BookableCalendarsManager`), `Availability`,
`Breaks`, `Closures & amended hours`. The tab strip accepts the web's `?tab=`
aliases (`lib/availability/availability-tabs.ts`: `availability|hours`,
`calendars|team`, `breaks`, `closures|daysoff|time-off|unavailability`); an
admin lands on Calendars, everyone else on Availability, and a non-admin asking
for Calendars is bounced to Availability. Title "Availability Settings"; the
non-admin intro ("Browse any team member for reference; only your calendar can
be changed here…") sits above the strip. The old `availability/calendars`
route redirects to `?tab=team`. Availability and Breaks share one selected
calendar (kept across tabs; a fresh pick prefers the viewer's own staff
calendar, as web `pickScheduleCalendarId`).

## 2. Calendars tab (`BookableCalendarsManager`)

| # | Gap | Built |
|---|---|---|
| C1 | **Live bug:** toggling a calendar off made it vanish (`usePractitioners` always sent `active_only=1`), with no way to switch it back on | `usePractitioners({ includeInactive })` drops `active_only`/`staff_assignable` and filters resources client-side; the manager uses it; a paused column stays listed with its Inactive pill |
| C2 | Events cell: web shows active events with a short date, paused ones greyed "· paused", and the empty states "None here. Event manager" / "No active events" / "—" | built (`formatEventDateShort`, `eventsEmptyText`) |
| C3 | Plan pill printed "N / ∞ on plan" when the plan had no number; Add calendar showed before the allowance loaded | pill only when `unlimited` or `calendar_limit != null`; Add calendar once the allowance answers (kept if the route errors, since create enforces the limit) |
| C4 | Copy: "Name is required", "None" for an empty Services cell when the venue has services, "Active (bookable)", caption pointing at the Availability tab | built |
| C5 | Optional confirm before moving a class/resource/event off another column | not built — the assignments sheet already names the column it moves from |

## 3. Availability tab

| # | Gap | Built |
|---|---|---|
| A1 | Picked-day action in the planning calendar: "Amend hours for this date on the Closures & amended hours tab" / "Edit amended hours on the…" | `ScheduleTimelineSheet` gains `onAmendHours(date, existing)`; the screen switches tab and opens the sheet on the run (from the list, or from `availability_exceptions`) or a new hours entry on that date |
| A2 | `describeYmdShort` dropped the weekday (web "Mon 7 Sep 2026") | built; the rota tests updated |
| A3 | Info banner: heading "How calendar hours and business hours work together", the closed-days and no-business-hours sentences, a press-through to Business hours | built (in-app `/manage/hours`) |
| A4 | A colleague's planned hours were hidden unless they had changes | the timeline renders for every non-resource calendar, read-only when not the viewer's |
| A5 | Copy-to loop stopped at the first declined "copy anyway?" (web skips and continues) | built |
| A6 | Cycle count / weeks typed entry (1–52) | `CountRow` gains a numeric field beside its −/+ |
| A7 | Copy: "Closed" on a closed weekday row, "Save Working Hours", empty state "Add calendars first to set their schedule." | built |

The editors render inline in the tab (`inline` on `WorkingHoursEditor`,
`ScheduleTimelineSheet`), read-only with the web's hint on a calendar the
viewer may not change; the sheet variants still exist for other callers.

## 4. Breaks tab

| # | Gap | Built |
|---|---|---|
| B1 | Confirm before overwriting other calendars' breaks (web `window.confirm`) | the switch became the web's second button "Save to all calendars", which asks "Replace the breaks on N other calendars with these? Their existing breaks will be overwritten." in a `ConfirmPanel` |
| B2 | Free-minute time entry (app: ±15 steppers) | `TimePickerField` (OS picker, any minute) |
| B3 | Read-only view for staff on a colleague's calendar | `readOnly` + hint "View only - you can edit breaks for calendars linked to your account only." |
| B4 | Copy: the intro, the editor description, "No breaks - bookable for the full working-hours window", "+ Add break", the resource note | built (`BREAKS_INTRO`, `BREAKS_RESOURCE_NOTE`) |
| B5 | IA: one-off "Block time" + "Time blocks" were app-only on this screen | **removed from this screen** to match the web; one-off blocks stay on the Calendar tab (`BlockEditSheet`), where the slot is |

## 5. Closures & amended hours tab

| # | Gap | Built |
|---|---|---|
| L1 | **Live defect:** the filter chips offered a non-admin every calendar; tapping a colleague's 403'd the leave query and the whole screen became an error state | chips come from the viewer's permitted calendars; a leave error is scoped to the tab |
| L2 | The "Past" group could never populate (the list window started today) | the lists reach 90 days back as well as forward; "Past entries (N)" |
| L3 | Grid and list did not show All day vs Part day | cells draw "Off" (all day), "Block" (part day), "Hrs" (amended) on tinted days, with that legend; rows lead with an All day / Part day / Amended hours chip and "HH:MM–HH:MM each day" |
| L4 | Wrong pointers: the legacy banner sent people to venue closures and was admin-only; the footer said Business hours is "on the web dashboard" | web copy, every role; the footer and the venue note press through to the in-app Business hours screen |
| L5 | An amended-hours load failure was silent | "Could not load amended hours" + Retry, on the grid and the list |
| L6 | Copy: "Select a calendar.", "Edit block", "Add to calendar" / "Save changes", "New entry · range", the every-date-in-the-range hint, "Label (optional)", the empty state | built |
| L7 | Low: Delete inside the edit sheet; a stored `closed` override drawn as Off; amended hours in the tapped-day breakdown; no actions when the venue has no appointment calendars | built (`amendedClosedOnDate`) |

The sheet's dates are date pickers ("Start date" / "End date") and its times
are OS time pickers, as the web's inputs are.

## 6. Checks

`npx tsc --noEmit -p .` clean; `npx eslint --fix` on every touched file clean;
the full jest run green (see the commit). New or changed suites:
`BreaksEditor.test.tsx` (the confirm, read-only), `BookableCalendarsManager.test.tsx`
(the allowance gating), `working-hours-rota.test.ts` (weekday dates),
`calendar-amended-hours.test.ts` (`amendedClosedOnDate`),
`availability-tabs.test.ts` (new).

## 7. Still owed

- A device pass over all four tabs (the web preview cannot reach the authed API).
- An OTA carrying R29 + R30 (`eas update --clear-cache`, go-live record).
- C5 above, if the team wants the extra confirm.

## 8. Follow-ups built the same day (2026-09-10)

- **Override availability toggle** (`components/booking-wizard/AvailabilityOverrideControls.tsx`):
  one line, as on the web — the tick, the label, and an (i) `HelpTooltip` that opens the
  explanation. The help sentence no longer sits under the label. The booking flow is a
  full-screen route, so the tooltip's small Sheet is the only modal there.
- **Calendar resize snapped back for a few seconds.** Cause, in
  `components/calendar/DraggableAppointmentBlock.tsx`: the block holds its dropped shape itself
  and drops that override either when the grid re-lays it out or, as an error fallback, 2.5 s
  after the mutation settles. A drag never patched the grid cache, so when the reconcile refetch
  took longer than 2.5 s the fallback fired first and the bar snapped to its old length until the
  refetch landed. Fix: `commitDrag` / `commitVisitDrag` on the calendar screen now patch the
  grid row (`startTime` / `endTime`) through `applyOptimisticGridPatch` on the drop, exactly as a
  status press does, and revert the snapshot on failure. The grid's layout equals the held shape
  the moment the drop lands, so the override is released seamlessly and the refetch only
  confirms it. `CalendarBookingPatch` gained the two time fields (linked feed: `bookingTime` /
  `bookingEndTime`). A cross-column move is left to the refetch (the row changes column, which
  a time patch on the old column cannot express), so its error fallback is unchanged.
- **Per-service Start / Complete on the calendar (2026-09-10, after the OTA check).** Every
  path was already per row (the tray reads the row's own status, the press writes that one id,
  the route writes one row for Seated / Completed, the grid feed returns each row's own
  status). What read as coupling was the colour: the app followed the web's rule that every bar
  of a visit wears the earliest service's status colour, so starting or completing the first
  service recoloured all of them and starting the second changed nothing visible. Each bar now
  wears its own status colour (`paletteStatus` is no longer set by either grid; the chip and the
  spine still say the bars belong together). Recorded as a deliberate divergence from the
  web's tint at the time; web #190 adopted the same per-service colour later the same day
  (`Docs/APP_GAP_REPORT_R31_WEB_DELTA.md` §4), so the two diaries agree again.
- **"Refreshing" bar.** Not in the app: no screen renders such a banner (pull-to-refresh is a
  spinner, background refetches are invisible by design, the offline banner says Offline). It is
  Expo Go's own overlay while it reloads the JavaScript bundle in development.
