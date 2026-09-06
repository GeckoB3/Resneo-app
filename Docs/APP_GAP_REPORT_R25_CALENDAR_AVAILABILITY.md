# App gap report R25: the Calendar availability page (2026-09-06)

**Scope.** The owner asked for every function of the web's Calendar Availability page
(`/dashboard/calendar-availability`, rendered by `AppointmentAvailabilitySettings.tsx`) to be at
parity in the app's Calendar availability screen (`app/(app)/availability.tsx`, its Calendars
sub-screen and `components/availability/*`). Both sides were inventoried in full (every control,
state, route and validation) and diffed feature by feature. The web's other page,
`/dashboard/availability` ("Dining Availability"), is the table-reservation product and is out of
scope for the appointments-first app, as every earlier round has held.

**Build status (same day):** R25-1, R25-4, R25-5 and R25-6 built; R25-2 and R25-3 built on the app
side, and the one-line web change per route they needed (`Docs/R25_WEB_HANDOVER.md`) landed on web
`staging` the same day (`da657660`, with a Bearer test; `C:\Resneo\Docs\R25_WEB_RESPONSE.md`), so
they show once staging deploys to main. The OTA that carries the app side is the next one on 1.1.0.

## Already at parity before this round

Weekly hours with split shifts, "Copy to other open days", the venue-hours context line and the
409 "Save these hours anyway?" flow; per-day breaks with "Copy Monday to all days" and the
apply-to-all fan-out; time blocks; closures and unavailability windows with the all-calendars
option, the three labels and the upcoming/past split; the team leave calendar; the legacy days-off
banner; calendar create, rename, activate, reorder, delete and booking links with copy. Resources:
hours only, no breaks, no closures (web defers the same).

## Findings and what was built

### R25-1 — Planning hours ahead was read-only  **(High, built)**

The web adds, edits, removes and copies schedule changes (a Monday-snapped start, one to six
weekly shapes, "until further notice / for N cycles / until a date", an overlap preview describing
what a save trims or splits, a full-timeline prune, and a planning calendar that shows the
bookable hours on any date and which rule sets them). The app listed the changes and said
"Planned changes and rotas are edited on the web dashboard."

Built:
- `lib/calendar/working-hours-rota.ts` gains the web's write side, ported with the web's own
  tests: `insertSchedulePeriod` (trim / shorten / start-later / split keeping the rota's rhythm),
  `removeSchedulePeriod`, `periodEndForCycles`, `periodCyclesForEnd`, `pruneEndedSchedulePeriods`,
  `ROTA_MAX_CYCLES`, `describeScheduleTrim`, `describeYmdLong`, `newSchedulePeriodId`.
- `components/availability/WeeklyHoursFields.tsx`: the seven weekday rows extracted from the
  hours editor as a controlled field group, so a planned week edits exactly like the standard
  week (`WorkingHoursEditor` now renders it; its tests are unchanged and pass).
- `components/availability/SchedulePeriodForm.tsx`: the web form, on the app's date picker, a
  count row for the pattern length and the cycle count, week tabs, a Runs segmented control, the
  amber overlap preview and the web's validation messages.
- `components/availability/SchedulePreviewCalendar.tsx`: the planning calendar (`summariseDay`
  ported as `summariseScheduleDay`, answered by the app's own venue-day resolver so a closure, an
  amended-hours day and a weekday the venue does not trade read exactly as they book), with the
  six period tints, week badges and part-day leave lines.
- `components/availability/ScheduleTimelineSheet.tsx`: the timeline (current changes, ended ones
  behind "Show N past changes"), the form, the calendar with its rule detail and the two actions
  ("Change hours from this week", "Edit this change"), an admin's "Copy this schedule to other
  calendars", and the 409 "Save this schedule anyway?" flow per calendar. Removal is the app's
  two-step "Tap to confirm" with the web's question under the row.
- The availability screen's row gains "Plan hours ahead" (a resource is excluded, as on the web;
  a calendar the viewer cannot change gets "View planned hours"), and `PatchPractitionerInput`
  gains `schedule_periods`.

### R25-2 — No plan allowance: pill, gate, tier copy  **(Medium, built app-side; web change needed)**

The web reads `GET /api/venue/calendar-entitlement` for "3 / 5 on plan" / "Unlimited calendars",
hides "Add calendar" at the limit and explains the limit per tier. The app showed the button
always and explained a 403 after the fact. Built: `useCalendarEntitlement`, the pill, the gate
and `calendarLimitMessage` (the web's tier copy, pointing at Settings → Plan on the web
dashboard, since the app never sells a subscription). The route was cookie-only on the web
(`createClient()`); the swap asked for in `Docs/R25_WEB_HANDOVER.md` landed on web staging the
same day (`da657660`), so the pill appears once that deploys. A deployment that predates it
answers 401, which the app treats as "unknown", keeping the after-the-fact 403 handling.

### R25-3 — No resource-overlap conflict flag  **(Low, built app-side; web change needed)**

The web reads `GET /api/venue/calendar-column-conflicts` for the "Conflict" pill and the
"Resource availability overlap" box on a calendar card. Built (`useCalendarColumnConflicts`, the
pill, the box with the web's copy); the same route history and the same web fix.

### R25-4 — Assignments editable only from each offering's editor  **(Medium, built)**

The web's "Edit calendar" modal ticks the services, class types, resources and ticketed events
that sit on a column, moving a class, resource or event off wherever it was (with a confirm) and
never leaving a resource without a column. The app's card was read-only ("assignment editing
lives in each editor"). Built: `CalendarAssignmentsSheet` from an "Edit assignments" button on
the card, with the web's help copy; `lib/venue/calendar-assignments.ts` plans the changes (the
full service set for `PUT /api/venue/practitioner-services`, one PATCH per moved class type,
resource or event, a resource moved to another calendar rather than orphaned, and the web's
"Add another calendar column before moving a resource off this calendar." refusal). A row says
"Moves here from {calendar}" in place of the web's confirm dialog; Save is the consent.

### R25-5 — Small differences  **(Low, built)**

- "Open page" beside "Copy URL": the calendar's public booking page in the in-app browser.
- Leave notes accept 500 characters, the server's limit; a block's reason keeps 200.
- The Calendars intro copy now matches the web's.

### R25-6 — Staff could open a colleague's editors  **(Low, built)**

The web gates "Save Working Hours" and the breaks editor on `canEditWorkingHoursFor` and shows
"View only …" for another person's calendar; the app showed every calendar's Edit buttons to every
staff member and let the server 403. Now a calendar the viewer may not change shows no Edit
buttons and the web's view-only line; the planned hours can still be looked at.

## Not built, and why

- **Web-only URL parameters** (`?tab=`, `?addCalendar=1`): navigation conveniences with no
  mobile equivalent; the app's deep links are a deferred item from R7.
- **Drag-to-reorder**: the web's own mobile fallback is the app's up/down buttons.
- **The web's `window.confirm` dialogs**: expressed as two-step taps or inline captions plus an
  explicit Save, the app's convention (a native alert never fires on the web preview).
- **Server default hours on a new calendar**: the server already applies the web's 09:00–22:00
  default when the app sends none, so nothing to change.

## Verification

- `lib/calendar/working-hours-rota.test.ts` carries the web's insert / split / cycle / prune
  cases; `lib/venue/calendar-entitlement.test.ts` and `lib/venue/calendar-assignments.test.ts`
  cover the copy and the assignment plan; `BookableCalendarsManager.test.tsx` gains the pill and
  gate, the conflict flag and an assignments save. The full suite, the type check and the linter
  are clean.
- Not device-verified: the owner's device pass is the check, in this order: plan a change from
  next Monday with a 2-week rota until further notice and watch the planning calendar; add a
  second change that overlaps it and read the preview; remove one; copy the schedule to another
  calendar; open Edit assignments and move a class; as a staff member, confirm a colleague's
  calendar reads view-only.
