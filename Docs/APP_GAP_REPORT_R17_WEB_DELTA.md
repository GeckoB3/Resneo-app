# R17 — app-vs-web delta audit

**Range:** `resneo` **`main`** `fe09c0a4..239f6020` — 4 commits, 47 files, +4,344/−210.
**Audited against:** `Resneo-app` `main` @ `05041d6`, 2026-08-16.
**Range is clean.** `fe09c0a4` is a direct ancestor of `239f6020`, so unlike R16
there is no squash re-inclusion and the commit range *is* the delta.

**Verdict: three findings, and one of them is a live regression in the app that
the app cannot fix by itself.** The batch is web's scheduling/availability
forensic audit (`Docs/Resneo_Scheduling_Availability_Audit_August_2026.md`),
rounds 1–3 plus the second limb of SA-M2. Most of it is server-side and arrives
free. The exceptions are below.

---

## R17-1 — Staff group and multi-service bookings from the app are now judged by the *guest* booking window (regression, fix belongs on web)

> **FIXED ON WEB `staging` @ `51d00fd6`, 2026-08-16 — verified below. NOT YET ON
> `main`, so the regression is still live in production.** Both routes now
> select the helper on source
> (`source === 'walk-in' ? isStaffWalkInBookingDateAllowed : isGuestBookingDateAllowed`),
> which is exactly what `/api/venue/bookings` has done since before this batch —
> checked at `fe09c0a4:227`, so "mirrors the singles route" is verified, not
> assumed. Each route has exactly one gate and no unconditional call survives.
>
> **One residual, deliberate and documented by the author:** `source: 'phone'`
> still gets the guest rule. So a staff *phone* multi-service or group booking
> for today is still refused on a venue with `allow_same_day_booking: false`, and
> still refused beyond `max_advance_booking_days`. That now matches what a single
> booking does, which was the point; but it is a real change from before SA-H7,
> when those two routes applied no window at all. Whether phone should also be
> exempt is flagged in the commit as an open product question. The app's walk-in
> multi-service path is real and reaches the exemption
> ([ConfirmStep.tsx:353](../components/booking-wizard/ConfirmStep.tsx) passes
> `source` straight through, and the component already branches on
> `source !== 'walk-in'` for deposits).

**Severity: high.** Live the moment this web release deployed. No app change can
fully fix it.

SA-H7 found that `create-multi-service` and `create-group` loaded a service's
booking window and never asked it, and closed that by calling
`isGuestBookingDateAllowed` per segment / per member:

```ts
// src/app/api/booking/create-multi-service/route.ts:378
if (!isGuestBookingDateAllowed(booking_date, svcWindow, input.venueTimezone ?? 'Europe/London')) {
  return NextResponse.json({ error: 'This date is not available for booking' }, { status: 400 });
}
```

The new gate is **unconditional**. Web's own comment states the premise:
*"Both this route and `create-group` are anonymous public flows."*

**That premise is false for the app.** These two routes are where every staff
multi-service and group booking made on mobile is created:

| App call site | Route |
|---|---|
| [lib/queries/useCreateMultiServiceBooking.ts:62](../lib/queries/useCreateMultiServiceBooking.ts) | `POST /api/booking/create-multi-service` |
| [lib/queries/useCreateGroupBooking.ts:31](../lib/queries/useCreateGroupBooking.ts) | `POST /api/booking/create-group` |

Both send `source: BookingSource` — `'phone'` or `'walk-in'` for staff-made
bookings. The routes already discriminate on exactly that value three times in
the same file (`:154` online-like email requirement, `:311` hidden add-ons,
`:318` `'public'` vs `'staff'` add-on validation), so the concept exists and the
new gate simply does not use it.

**What breaks, concretely:**

| Venue setting | Staff action on mobile | Now |
|---|---|---|
| `allow_same_day_booking: false` | multi-service visit for **today** | 400 "This date is not available for booking" |
| `allow_same_day_booking: false` | **walk-in** multi-service visit | 400 — and a walk-in is *always* today |
| date beyond `max_advance_booking_days` | group booking for that date | 400 "The date for {person} is not available" |

The walk-in row is the sharpest: [walk-in deliberately bypasses availability,
venue hours, overlap and min-notice server-side](../lib/booking/card-hold.ts)
by design, and this gate now refuses it before any of that reasoning is reached.

**The same file already contains the correct helper.**
`src/lib/booking/entity-booking-window.ts:68` defines
`isStaffWalkInBookingDateAllowed` — identical max-advance rule, but same-day
allowed regardless of `allow_same_day_booking`, with the docstring *"Staff
walk-in / counter bookings"*. It is not called from either route.

**Recommended fix (web, one line each):** select the helper by source, the way
the file already selects add-on visibility —
`isOnlineLikeSource ? isGuestBookingDateAllowed(...) : isStaffWalkInBookingDateAllowed(...)`.
Raise it with web rather than diverging; there is no app-side fix short of
abandoning the shared routes, and single-service staff bookings go through
`/api/venue/bookings`, so the app would otherwise apply two different rule sets
to the same booking depending on how many services it has.

**Note:** `/api/booking/create` has called the guest helper unconditionally
since before this range (`:1056`). It never bit the app because staff singles do
not use that route. SA-H7 propagated the unguarded pattern to the two routes
that the app *does* use.

---

## R17-2 — The app's diary refuses a drag over a break or closure that web now allows

> **BUILT 2026-08-16.** `lib/calendar/occupying-blocks.ts` ports the rule (both
> vocabularies — the app's grid returns `calendar_blocks.block_type` raw, so
> `break` / `closed` / `amended_hours` are accepted alongside web's computed
> `venue_closed` / `venue_amended_hours` / `practitioner_closed`). Applied in the
> two grids that drag (`CalendarDayGrid`, `AllCalendarsDayGrid`); `WeekGrid` has
> no drag. `CalendarTimeBlock` gained `blockType`, threaded from `getDayBlocks`
> and from the client-synthesised break blocks. `narrowWorkingRanges` cuts
> non-working blocks out of the working ranges so a drop over a break reads
> amber rather than green — which needed no change to the drag worklet.
> Unknown types still occupy. 27 new tests.

**Severity: high.** Pure app gap, and it is the app's own client-side rule.

SA-H3/SA-H5 established which diary blocks are advice rather than walls, in a
new shared rule (`src/lib/calendar/occupying-blocks.ts`):

```ts
const NON_OCCUPYING_BLOCK_TYPES = new Set([
  'venue_closed', 'venue_amended_hours', 'practitioner_closed', 'break',
]);
```

`practitioner_leave`, classes, events and hand-made blocks stay hard conflicts,
and an unrecognised type occupies.

**The app has no equivalent discrimination.**
[app/(app)/(tabs)/index.tsx:753](<../app/(app)/(tabs)/index.tsx>) maps *every*
grid block into a `CalendarTimeBlock`, reading `b.type` only to choose a label
and set `isEditable: false`:

```ts
const readOnlyType = b.type === 'break' || b.type === 'closed' || b.type === 'class_session';
```

Those blocks then flow into the conflict set unfiltered —
[AllCalendarsDayGrid.tsx:687](../components/calendar/AllCalendarsDayGrid.tsx)
(`overlays` = all of `column.timeBlocks`), joined into `busyRanges` at `:769`,
and evaluated by `evaluateConflict` in
[DraggableAppointmentBlock.tsx:246](../components/calendar/DraggableAppointmentBlock.tsx),
where any overlap is level 2 — red, refused. `CalendarDayGrid.tsx:544` and
`WeekGrid.tsx:375` build the same set the same way.

So on mobile, dragging an appointment onto a break or a closed period is refused
by the gesture itself. Web now permits it (with an amber note). The type
discriminator is already on the wire — `CalendarGridBlock.type`,
[types/calendar-grid.ts:51](../types/calendar-grid.ts) — so this is a filter,
not a contract change.

**Also port `isNonWorkingBlock`.** The app's amber level-1 state is driven only
by `workingRanges`; web now drives the amber note from closures and breaks too,
and deliberately excludes `venue_amended_hours` — landing inside a window the
venue opened specially is the *most* inside-hours a slot gets.

---

## R17-3 — The app never sends `allow_during_breaks`, so the server refuses the move anyway

> **BUILT 2026-08-16, and effective for SINGLE bookings only — see R17-4.** All
> eight send sites now pass `allow_during_breaks: true` beside
> `allow_outside_hours: true`, and both `useVisitMutations` payload types carry
> it. Single-booking moves, resizes, reschedules and undo go through
> `PATCH /api/venue/bookings/[id]`, which accepts the flag, so those work. The
> visit paths post to two routes that do not — R17-4.

**Severity: high.** Fixing R17-2 alone changes nothing a user can do — this is
the second enforcing layer, and web learned the same lesson the hard way (their
rule change "changed nothing a user could do" until the hit-testing and the
override threading were both fixed).

The two staff overrides are **separate gates**: `allowOutsideHours` has never
relaxed a break. This range threads the second one through the staff routes:

| Route | Added |
|---|---|
| `PATCH /api/venue/bookings/[id]` | `body.allow_during_breaks` → `allowDuringBreaks` (`:2293`, `:2391`) |
| `POST /api/venue/bookings/[id]/validate-appointment-modification` | `allow_outside_hours` **and** `allow_during_breaks` (the visit dry-run) |
| `validateAppointmentModificationInterval` | `allowDuringBreaks` param |

**The app sends `allow_outside_hours: true` at eight sites and
`allow_during_breaks` at none:**

| File | Line |
|---|---|
| `app/(app)/(tabs)/index.tsx` | 440, 1110 (calendar drag / resize) |
| `components/calendar/RescheduleSheet.tsx` | 145 |
| `components/bookings/ModifyBookingSheet.tsx` | 999, 1254, 1366 |
| `lib/queries/useBookingMutations.ts` | 240, 311 |
| `lib/queries/useVisitMutations.ts` | 33–34, 154–155 (typed `allow_outside_hours` only) |

Result: a move or resize over a break comes back `409 Conflicts with a break`,
and a **visit** move is refused by the dry-run before any row is written —
precisely the failure web describes as *"the visit was not moved"* while the
identical drag on a single booking succeeded.

**Fix:** send `allow_during_breaks: true` alongside `allow_outside_hours: true`
at all eight sites, and add it to both `useVisitMutations` payload types.
R17-2 and R17-3 must ship together.

---

## R17-4 — SA-H5 never reached the two visit SAVE routes (new finding, fix belongs on web)

**Severity: high. Found while building R17-3, by checking rather than assuming
the flag would be honoured.**

SA-H5 threaded `allow_during_breaks` through the bookings PATCH and through
`POST /api/venue/bookings/[id]/validate-appointment-modification` — the dry run
web's own diary uses. It did **not** reach the two routes the app uses to move
and re-service a visit:

| Route | Accepts | Passes to the engine |
|---|---|---|
| `PATCH /api/venue/visits/[groupBookingId]/schedule` | `allow_manual_overlap`, `allow_outside_hours` (`:54–55`) | `allowManualOverlap`, `allowOutsideHours` (`:392–393`) |
| `PATCH /api/venue/visits/[groupBookingId]/services` | same (`:85–86`) | same (`:486–487`) |

Neither schema calls `.strict()`, so the app's new `allow_during_breaks` is
**silently stripped, not rejected** — sending it is harmless and becomes correct
the moment web adds it. But until then:

| App path | Route | Break move |
|---|---|---|
| single-booking drag / resize / reschedule / undo | `PATCH /api/venue/bookings/[id]` | **works** |
| visit drag on the calendar | `…/visits/{id}/schedule` | still 409 |
| `RescheduleSheet` visit path | `…/visits/{id}/schedule` | still 409 |
| `ModifyBookingSheet` dry run + save | `…/visits/{id}/services` | still 409 |

**Fix (web):** add `allow_during_breaks: z.boolean().optional()` to both schemas
and pass `allowDuringBreaks: body.allow_during_breaks === true` into
`validateAppointmentModificationInterval` alongside the existing two — the same
two-line change the bookings PATCH already got. This is the identical shape as
the visit dry-run hole SA-H5 found and fixed; it simply stopped one route short.

---

## Verified clear — checked, and no action needed

**The grants migration (`20270113120000`) is safe for the app.** This is the R16
W1 shape repeating, so it was checked rather than assumed. Web's safety analysis
enumerated *its own* 27 browser-client files; it could not speak for the mobile
client, which holds its own Supabase key.

- The app issues **zero** `.from()` calls against any of the twelve tables.
- It subscribes to three of them: `calendar_blocks` and
  `practitioner_calendar_blocks` ([index.tsx:666–667](<../app/(app)/(tabs)/index.tsx>))
  and `unified_calendars` ([resources.tsx:94](<../app/(app)/resources.tsx>)).
- All three keep `SELECT` — Part B revokes writes only, deliberately, to keep
  realtime alive.
- Part A drops `TO anon` SELECT policies, which do not apply to the app's
  `authenticated` role. Each of the three tables carries a `staff_manage_*`
  policy that is `FOR ALL` **with no `TO` clause**, so it covers `authenticated`
  (`20260430120000:341`, `:364`; `20260401000000:25`).
- Every app subscription filters on the app's **own** `venueId`, which is what
  the policy predicate matches. No subscription rides a linked venue's id.

**The app does not have web's SA-H3 hit-testing bug.** Web's fix needed the
diary's hit-testing repaired because a closure block at z-index 15 swallowed
clicks meant for the slot buttons beneath. Every block overlay in the app's
grids carries `pointerEvents="none"` (`AllCalendarsDayGrid.tsx:814, 844, 863,
886`), so taps already pass through to the empty-slot layer. Only the JS
conflict rule (R17-2) needs changing.

**SA-C3 needs nothing from the app.** `availability-read-failure.ts` makes
fail-open availability reads *visible* — it does not fail closed and does not
change any response shape.

**SA-M13 has no live effect.** The legacy `practitioners` branch deleted from
`POST /api/venue/practitioner-calendar-blocks` made the managed-calendar check
unconditional. The app posts to that route
([useAvailabilityManage.ts:59](../lib/queries/useAvailabilityManage.ts)), but
production holds zero `practitioners` rows, so the branch could only ever fall
through. The app was already on the unified path.

**Arrives free, server-side:** SA-C2 (guest self-reschedule writing the variant
duration — guest flow, not a staff route), SA-H6 (a cancellation made to close a
day no longer offers those slots to the waitlist), SA-M2 (closure-aware reminder
suppression in the comms cron), SA-H1 (the noon-UTC wall-clock fallback deleted;
seven callers repointed).

---

## Not covered

Static analysis of both trees plus the migration and policy history. No device
pass and no live API probe. R17-1 in particular is stated from the route source:
it should be confirmed with one request — a staff multi-service visit for today
against a venue with `allow_same_day_booking: false` — before or alongside
raising it with web.

The Realtime column-grant verification carried from R16 (§4 of the 2026-08-15
go-live check) is still open and is **not** closed by the check above: this
audit confirms the app's subscriptions are *permitted*, not that Realtime
*delivers* under column grants.
