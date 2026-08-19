# R19 — app-vs-web delta audit

**Range:** `resneo` **`main`** `6e224759..9c1efcf9` — 2 commits (both squash merges),
31 files, +2,985/−605.
**Audited against:** `Resneo-app` `main` @ `1b97134`, 2026-08-19.
**Range shape:** `6e224759` is a direct ancestor of `9c1efcf9`, so the range is the
delta. Both commits are squashes (`16722925` "Staging (#153)", `9c1efcf9`
"Staging (#154)"), so granular authorship is not visible; the 16 granular changes
were read out of the squash bodies and the content audited file by file.

**Verdict: five build items, all in the weekly-hours editors. Two are live
defects in the app, not merely missing parity. ALL FIVE BUILT 2026-08-19 — see
Part 4.** The batch is the rest of Stage 6a
of web's scheduling resolver plan
(`_reference/Resneo/Docs/Resneo_Scheduling_Resolver_Plan_August_2026.md`),
almost all of it decision **(K)** — "one weekly-hours editor, three callers".
The app has the same three editors web just collapsed, and inherited the same two
bugs web found while collapsing them.

Nothing in this batch changes a request or response contract the app already
uses, so nothing here breaks the shipped app.

---

## Part 1 — findings

| # | Severity | Finding | Where |
|---|---|---|---|
| R19-1 | **High** | Business hours still capped at 2 periods per day | `components/manage/OpeningHoursEditor.tsx:177`, `app/(app)/manage/hours.tsx:57` |
| R19-2 | **High** | "+ Add split" always appends a fixed 09:00–17:00 | `components/availability/WorkingHoursEditor.tsx:122` |
| R19-3 | Medium | Resource calendars absent from Calendar availability | `lib/queries/usePractitioners.ts:32`, `components/resources/ResourceWeekHoursEditor.tsx` |
| R19-4 | Medium | No venue-hours context beside calendar hours | `components/availability/WorkingHoursEditor.tsx` |
| R19-5 | Medium | Breaks cannot be applied to all calendars | `components/availability/BreaksEditor.tsx` |

---

### R19-1 — Business hours still capped at 2 periods per day  **(High)**

Web removed the cap. `openingHoursDaySchema` was `.min(1).max(2)` and is now
`.min(1)` with no upper bound (`src/types/config-schemas.ts:40`), because the
cap was never a product rule — it existed only to stop `OpeningHoursControl`,
which could draw a first and a second period and no more, from silently
truncating a third on save. `WorkingHoursControl`, the resource timeline and
the resolver have always been unlimited. The editor now renders the array.

The app has the identical display-driven cap and it is now the only thing
enforcing it:

- `OpeningHoursEditor.tsx:177` offers "Add second period" **only** when
  `periods.length === 1`, so a third can never be added in the app;
- the new period is hardcoded `{ open: periods[0].close, close: '21:00' }` —
  web replaced this with `nextPeriodAfter()` (an hour's gap after the previous
  close, an hour long), because a fixed default is wrong for any venue whose
  last period has moved past it;
- `hours.tsx:57` destructures `const [first, second] = day.periods` and checks
  only that pair, so a venue that sets three periods **on web** gets them
  rendered correctly in the app (the map is over the whole array) but only the
  first two validated.

Also reconcile a **divergence** while lifting the cap: the app's `validate()`
rejects "The second period must start after the first one ends." Web has no
such rule at any layer — `openingHoursPeriodSchema` only checks `open < close`,
and the resolver unions periods in any order. Web's new editor keeps periods
ordered by construction (`nextPeriodAfter`) rather than by validation. Keep the
app's rule or drop it, but do so deliberately: as written it can refuse a save
the server would accept.

**Build:** render N periods; replace the `length === 1` gate with web's
`canAddPeriod()` (room for another period before 23:59) and show web's
"The last period runs to the end of the day, so there is no room for another
one." when there isn't; seed with `nextPeriodAfter()`; validate every
consecutive pair, not just the first.

### R19-2 — "+ Add split" always appends a fixed 09:00–17:00  **(High)**

This is the defect web found by clicking Add twice, documented on
`canAddPeriod` in `src/components/scheduling/WeeklyHoursEditor.tsx:50`:

> …the Add button clamps against the end of the day and hands back a period
> identical to the one before it… two identical rows, both valid on their own,
> neither what anyone asked for.

`WorkingHoursEditor.tsx:122` is the same code:

```ts
function addRange(key: string) {
  ...ranges: [...cur.ranges, { ...DEFAULT_RANGE }]   // DEFAULT_RANGE = 09:00–17:00
}
```

On a calendar working 09:00–17:00 — the seeded default for every new calendar —
pressing "+ Add split" produces a second range identical to the first. There is
no end-of-day guard either, so Add can be pressed indefinitely.

**Build:** port `canAddPeriod` / `nextPeriodAfter` (they are pure and about
fifteen lines) and use them here **and** in R19-1's editor, so the two app
editors cannot drift apart again the way web's three did.

### R19-3 — Resource calendars absent from Calendar availability  **(Medium)**

Decision (K) step 5: resources now appear in web's hours tab alongside every
other calendar. A resource is a `unified_calendars` row and its hours are the
same `working_hours` column — `/api/venue/resources` only *aliases* it as
`availability_hours` on the way in and out. Excluding them is what forced web's
third weekly-hours editor to exist.

The app excludes them structurally: `usePractitioners.ts:32` sends
`staff_assignable=1`, which the web route filters to
`calendar_type !== 'resource'` (`practitioners/route.ts:386`). So
`app/(app)/availability.tsx` lists no resources on any tab, and a resource's
hours are editable only inside `ResourceEditorSheet` via
`ResourceWeekHoursEditor` — which supports **one range per weekday**
(`{ enabled, start, end }`). Split shifts set on web survive a save
(`resourceWeekHoursFromJSON` parks range #2+ in `extraRanges`) but cannot be
seen or edited in the app.

Match web's boundaries exactly when building this:

- **Hours: yes.** Verified end to end on web — `working_hours` is the column
  the resource engine reads.
- **Breaks: no.** The resource engine reads `break_times` from the *host* row,
  never the resource's own, so a break saved against a resource is a control
  that saves and does nothing. Web renders an explanatory panel instead
  (`AppointmentAvailabilitySettings.tsx:1251`).
- **Closures: no.** `POST /api/venue/practitioner-leave` rejects a resource
  (`requireVenueHostCalendarId` filters `calendar_type = 'resource'`) and
  nothing would read it. Web deferred the resource half of decision (L) for
  this reason; the app's existing `ResourceExceptionsCalendar` stays as it is.

### R19-4 — No venue-hours context beside calendar hours  **(Medium)**

Decision (K) step 6. A calendar can only sell where its hours fall inside the
venue's, and setting hours outside them is not an error and is not rejected —
it simply never becomes bookable, which web calls "the most confusing possible
outcome because nothing anywhere says so". Web now prints
`Venue: 09:00 to 17:00` under each day, in amber with
"(hours outside this are not bookable)" when the calendar's hours fall outside.

The app's `WorkingHoursEditor` shows nothing of the sort. Web added
`GET /api/venue/opening-hours` for this (its page had no other source); **the
app needs no new endpoint** — `venue.opening_hours` is already on the bootstrap
that `VenueProvider` holds. Port `venueDayContext` / `describeVenueDay` /
`calendarHoursOutsideVenue` from `src/lib/calendar/venue-hours-context.ts`;
they are pure and fully unit-tested on web.

Note the `unset` vs `closed` distinction the module is careful about: a venue
that has never set opening hours imposes no constraint, so it must not be told
its calendar is "outside opening hours".

### R19-5 — Breaks cannot be applied to all calendars  **(Medium)**

Stage 6a item 7. A lunch break is nearly always the same shape across a team,
and retyping it per calendar is how two calendars end up disagreeing by a typo.
Web's leave panel has had `apply_to_all_active` all along; breaks now match.

The app's `BreaksEditor` saves the selected calendar only. The app's leave sheet
already has "Apply to all practitioners" (`availability.tsx:917`), so the
control has a precedent to copy.

Web's implementation notes worth carrying over: resources are **excluded** from
"all calendars" (same `break_times`-on-the-host reason as R19-3); the writes go
one PATCH at a time because `/api/venue/practitioners` takes a single id, so a
partial failure reports what actually succeeded — "Saved breaks to N of M
calendars, then failed."

---

## Part 2 — arrives free, or already correct

| Web change | App position |
|---|---|
| Leave mirrored into `calendar_date_overrides` (dual write, fail-soft) | **Backend only.** `practitioner_leave_periods` stays authoritative and every engine still reads it. No app change. **Watch Stage 6b**, which makes the new table the only one — that *will* be a contract change. |
| Events rejected when the calendar has leave (400 + message) | **Already surfaced.** `EventEditorSheet.formatSaveError` returns the server's `error` string, so the new reason reaches the user verbatim. |
| `PATCH /practitioner-leave` validates the *merged* row; writes both time halves together | **Already compatible.** The app always sends both `unavailable_start_time` and `unavailable_end_time` together (`availability.tsx:464`, `:476`), so the half-set trap this closes is one the app never triggered. |
| Leave form: "Closure / Unavailable window" type dropdown removed, times now optional | **Non-gap.** The app never had the duplicated dropdown; its "All day / Time window" Segmented is already the derived distinction web moved to, and a segmented control is the right shape on mobile (there is no way to "blank" a stepper). |
| Leave list badges relabelled "All day" / "Part day" | **Cosmetic.** The app prints the actual window (`09:00–12:00 (window)`), which says more than the badge. Optional. |
| Diary column header now agrees with its grid | **Non-gap.** The app's calendar column headers show the calendar name only, never an hours line, so the header/grid disagreement web fixed never existed here. Adding the line would be a new feature, not parity. |
| `GET /api/venue/opening-hours` (new, staff-readable) | **Not needed** — see R19-4. |
| `schedule-health` cron + `vercel.json` entry | **Monitoring only.** No app surface. |
| Venue opening-hours period cap removed at the schema | Enables R19-1; no app change on its own. |

---

## Part 3 — build order

1. **R19-2** then **R19-1** — port `canAddPeriod` / `nextPeriodAfter` once, use
   it in both editors. R19-2 is the live duplicate-row bug; R19-1 is the cap.
2. **R19-4** — pure, no endpoint, drops straight into the editor R19-2 just
   touched.
3. **R19-5** — self-contained.
4. **R19-3** — largest, and the only one that changes what the availability
   screen lists. Land it last so the navigation change arrives on its own, which
   is the order web used for the same reason.

---

## Part 4 — what was built (2026-08-19)

All five, in the order above. `tsc` clean, lint clean, 178 suites / 1,875 tests
green (34 of them new).

**New shared modules** — the point of the exercise, not a side effect. Web's
whole decision (K) is "these three editors agreed by coincidence; make them
agree by construction". The app had two editors agreeing by coincidence.

| Module | What it owns |
|---|---|
| `lib/scheduling/weekly-hours.ts` | `canAddPeriod` / `nextPeriodAfter` / `NO_ROOM_FOR_PERIOD` + `END_OF_DAY_MIN`. Minutes-since-midnight, because both app editors already work in minutes at the point they call it. |
| `lib/calendar/venue-hours-context.ts` | `venueDayContext` / `describeVenueDay` / `calendarHoursOutsideVenue`, ported from web. |
| `lib/calendar/schedule-calendars.ts` | `isResourceCalendar` / `appointmentCalendarsOf` — the hours-vs-everything-else split, in one place with the reasons attached. |

**R19-1** — `OpeningHoursEditor` renders N periods; "Add second period" (gated
on `length === 1`, seeding a hardcoded `previous.close → 21:00`) became
"+ Add period", gated on `canAddPeriod`, seeded by `nextPeriodAfter`, and
replaced by web's "no room" line when the day runs to the end. `hours.tsx`
`validate()` now checks every period, and **dropped** the "second period must
start after the first one ends" rule — web has it at no layer
(`openingHoursPeriodSchema` only checks `open < close`, and the resolver unions
periods in any order), so it could refuse a save the server would accept.

**R19-2** — `WorkingHoursEditor.addRange` uses the same two helpers. The Add
button is replaced by the "no room" line rather than clamping.

**R19-4** — `WorkingHoursEditor` takes a `venueOpeningHours` prop (from the
bootstrap `availability.tsx` already holds — no new request, no new endpoint)
and prints `Venue: 09:00 to 17:00` per day, amber with "(hours outside this are
not bookable)" when the calendar's hours fall outside. Silent when the venue has
never set hours: no constraint, so nothing to say.

**R19-5** — `BreaksEditor` takes `applyToAllCalendars` and an "Apply to all
calendars" switch. One PATCH per calendar, and a partial failure reports what
actually saved. The switch is hidden unless the calendar on screen is itself in
the permitted list — otherwise a staff member opening a colleague's breaks would
fan out a run of 403s.

**R19-3** — `usePractitioners({ includeResources: true })` drops
`staff_assignable=1` (the flag the web route filters resources on) under a
distinct cache key, and `availability.tsx` splits `practitioners` (hours) from
`appointmentCalendars` (everything else). Resources get a "Resource" tag, an
Edit-hours button, and web's explanation in place of Edit breaks.

Three guards worth keeping, all found while wiring it:

1. **The filter chips stay on `appointmentCalendars`.** They feed the leave
   query, and `GET /api/venue/practitioner-leave?practitioner_id=<resource>`
   404s — which this screen turns into a full-page error state
   (`isError` includes `leaveQuery.isError`). Resources are still listed under
   Working hours on "All".
2. **`defaultPractitionerId()` seeds from `appointmentCalendars`**, or the
   leave/block sheet could open pre-set to a resource that `POST` rejects.
3. **`openBreaksSheet` refuses a resource id** even though the row hides the
   button.

### Not verified on a device

The editors are covered by component tests, but nothing here has been exercised
against the live API — the web preview cannot reach the authed backend (CORS).
Worth a device pass on: a three-period day saving from the app, a resource's
hours saving from Calendar availability, and apply-to-all breaks across a team.

One deployment note: the third period only saves once web `9c1efcf9` is live,
since `openingHoursDaySchema.max(2)` is what rejects it. Until then the app
surfaces the server's zod message and nothing is lost — the draft stays put.

### Checked and deliberately not built

`AvailabilityBlocksSection` (amended hours on `availability_blocks`) still
offers two periods against a schema that allows four. That is **not** an app
gap: web's `BusinessClosuresSection` offers exactly the same two (`p1`/`p2`), and
decision (K) explicitly scoped itself to `venues.opening_hours`. The app matches
web; the unused headroom is a shared web-side limitation.
