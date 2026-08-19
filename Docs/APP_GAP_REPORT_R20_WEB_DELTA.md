# R20 — app-vs-web delta audit

**Range:** `resneo` **`main`** `9c1efcf9..d0f18da7` — 2 commits (both squash merges),
13 files, +937/−15.
**Audited against:** `Resneo-app` `main` @ `9acb0ef`, 2026-08-19.
**Range shape:** `9c1efcf9` is a direct ancestor of `d0f18da7`, so the range is the
delta. Both are squashes (`fb422a56` "Staging (#155)", `d0f18da7` "Staging (#156)");
the nine granular changes were read from the squash bodies and the content audited
file by file.

The batch is **Stage 7 of the scheduling resolver plan — fail closed** — plus a
correction to `[R3-89]` that bears directly on what the app built for R19-3.

**Verdict: one OPEN finding the app cannot fix, two small app polish items, and one
correction to our own documentation. Stage 7 does not break the app, and mostly does
not reach it.**

---

## Part 1 — the `[R3-89]` correction (`[R3-94]`)

**Web's correction, verified in code rather than taken from the plan:** resources
already have a working per-date override mechanism of their own —
`unified_calendars.availability_exceptions`, written through `/api/venue/resources`
and genuinely read by `getBaseResourceAvailabilityRanges`
(`src/lib/availability/resource-booking-engine.ts:183`). It honours `{closed: true}`
for a whole day and `{periods: [...]}` for different hours. **A room can already be
closed for a date, and the engine acts on it.**

So the remaining gap there is **consolidation, not capability**, and web rates it
**low priority** (production has zero resources).

### What this means for R19-3 — boundaries right, reason wrong

R19-3 put resources on the app's Calendar availability screen for **hours only**, and
refused breaks and closures. That decision is **unchanged and still correct**:

- **breaks** — the resource engine reads `break_times` from the HOST row, never the
  resource's own. Web's original finding stands untouched.
- **leave** — `POST /api/venue/practitioner-leave` rejects a resource, and nothing
  reads leave stored AGAINST a resource. Also untouched, but see the correction to
  our own wording below: the engine very much does read the HOST calendar's leave.

What is wrong is **how we justified it**. The R19 report, the code comments in
`app/(app)/availability.tsx` and the memory note all say leave against a resource is
"unreadable by every engine", which reads as *resources cannot have closures at all*.
They can, through a different table, and **the app already ships the editor for it** —
`components/resources/ResourceExceptionsCalendar.tsx`, which writes exactly the
`{closed}` / `{periods}` shape the engine reads (verified against
`resource-booking-engine.ts`).

### How leave actually reaches a resource — the full picture, verified in code

The plan is read carefully here because our own wording was imprecise, and the
distinction matters to anyone answering "can I close a room?".

| Layer | Where it lives | Who reads it | App surface |
|---|---|---|---|
| Resource's own per-date closure / amended hours | `unified_calendars.availability_exceptions` | `getBaseResourceAvailabilityRanges` (`resource-booking-engine.ts:183`) — `{closed:true}` → no ranges; `{periods:[…]}` → those ranges | ✅ `ResourceExceptionsCalendar` (resource editor → Date exceptions) |
| **HOST calendar's leave and ad-hoc blocks** | `practitioner_leave_periods`, `calendar_blocks` | **The resource engine, per candidate** (`resource-booking-engine.ts:1021-1046`) — Stage 5's fix for §1.2 item 5 | ✅ Nothing to build: staff book host leave on the Availability screen and it propagates automatically |
| Leave stored against the resource itself | `practitioner_leave_periods` | Nothing | ❌ Correctly refused |
| Resource's own `break_times` | `unified_calendars.break_times` | Nothing (the engine reads the HOST's) | ❌ Correctly refused |

The second row is the one our R19 wording obscured. Before Stage 5 the resource
engine contained **zero** references to leave or block tables, so a room stayed
bookable while its host practitioner was on holiday (§1.2 item 5). That is fixed:
the engine now loads both and vetoes each candidate against them.

**So the app is handling resources correctly, and more completely than the R19
report implied.** A venue can close a room for a date (resource screen), and a
practitioner's leave already removes that practitioner's hosted resource slots with
no extra action. The only thing genuinely unavailable is leave or breaks recorded
against the resource row itself, which no engine reads — and which the app correctly
does not offer.

The app's position is therefore identical to web's: **staff closures on one screen,
resource closures on the resource screen, consolidation outstanding on both sides.**
No code change. The comments should be corrected so the next person does not read
them as "resources can't be closed" and either build a duplicate or tell a venue
something untrue.

Note for whoever reads the engine: those host-leave reads **also fail open**
(`resource-booking-engine.ts:998`), so R20-1's argument applies to them too.

If consolidation is ever done, web has already identified the right shape and it is
worth copying: **an adapter, not engine support** — when the selected calendar is a
resource, point the date-override panel at `availability_exceptions` rather than at
the leave table. Teaching the engines to read leave for resources would be larger AND
would duplicate a mechanism that already works.

---

## Part 2 — Stage 7 (fail closed)

Five guest availability routes now run through one shared `withScheduleFailClosed`.
A schedule read that fails open no longer yields a confident-looking partial answer:
the route returns **503** with `Retry-After: 15`, `no-store`, and a body carrying
`unavailable: true`, a `tables` list, and
`error: "Availability is temporarily unavailable. Please try again in a moment."`
(deliberately no venue or calendar ids — it reaches an unauthenticated guest).

### R20-1 — the app's date picker is served by the route Stage 7 did NOT cover  **(OPEN — web-side only)**

Web calls the month path "the most exposed surface in the programme":
`appointment-month-availability.ts` carries **twelve** fail-open reads, and a failure
there does not remove one time, **it removes whole DATES from the picker**.

Stage 7 wrapped the guest copy — `/api/booking/appointment-calendar:54` is now
`withScheduleFailClosed(...)`. The **staff** copy is not:
`/api/venue/appointment-calendar` imports the same
`appointment-month-availability` module with no wrapper.

**That staff route is what the app's appointment date picker uses**
(`lib/queries/useMonthAvailability.ts:96`). So the app consumes the same twelve
fail-open reads on its highest-traffic date surface, without the protection web just
added on the guest side. A failed read shows staff a month with dates missing and no
indication anything went wrong — the same failure web judged serious enough to build
a whole stage around, one audience over.

**Re-verified 2026-08-19 against the code and the plan**, because this is the one
finding with real user impact:

- `src/app/api/booking/appointment-calendar/route.ts:53` — `export async function GET`
  returns `withScheduleFailClosed(() => handleAppointmentCalendarGet(request))`.
- `src/app/api/venue/appointment-calendar/route.ts:40` — `export async function GET`
  with no wrapper, importing `computeAppointmentAvailableDatesInMonth` and
  `computeAnyAvailableAppointmentDatesInMonth` from the same module (`:16-18`).
- `src/lib/availability/appointment-month-availability.ts` — **12**
  `reportAvailabilityReadFailure` call sites, shared by both routes.
- `/api/venue/appointment-availability` (the staff SLOT list, the app's other
  picker) is likewise unwrapped.

**The plan's own scope note is narrower than the summary line.** The status table
says "guest paths only: staff write validators still fail open, deliberately", and
§4 Stage 7 spells out what that means (`Docs/…Plan_August_2026.md:841`):

> The staff **write-path validators** (`findClassScheduleWindowAvailabilityConflict`,
> `findEventLeaveConflict`) still fail open, deliberately and consistently with each
> other… refusing to let staff schedule anything during a database wobble is a
> different trade with a different answer.

That reasoning is sound, and it is about **write validators** — two named functions
that BLOCK a staff write. It says nothing about the staff **read** routes, which are
a different thing: they do not block a write, they silently remove dates a staff
member could otherwise have booked. Decision (J)'s own justification (`:839`) —
"a wrong booking costs staff time and goodwill to untangle, while a retry message
costs one refresh" — is a STAFF-cost argument, and applies here unchanged.

So this looks like a surface outside the scope note rather than a decision taken
against it. Put it to web as a question, not as a defect.

**The app cannot fix this.** A 200 with missing dates is indistinguishable from a
genuinely quiet month. Raise it with web; the fix is wrapping
`/api/venue/appointment-calendar` (and, by the same argument,
`/api/venue/appointment-availability`).

### R20-2 — the app throws away the server's 503 copy  **(Low, app-side)**

Two app hooks call Stage 7-wrapped routes and can receive a 503 today:

| Hook | Route | Wrapped |
|---|---|---|
| `useBookableOfferings.useResourceAvailability` | `/api/booking/availability` | live |
| `useResourceMonthAvailability` | `/api/booking/resource-calendar` | latent |

The plumbing is already right: `apiFetch` throws `ApiError` on any non-2xx, and
`getApiErrorMessage` prefers `body.error`, so `ApiError.message` already reads
*"Availability is temporarily unavailable. Please try again in a moment."* The app
also already distinguishes error from empty and offers a retry
(`ResourceBookingFlow.tsx:353`) — it never shows the false "fully booked" screen that
Stage 7's own UI work existed to fix.

The one flaw: that branch hardcodes `message="Couldn't load times."` and **discards**
the server's copy. A guest-facing venue is told a generic failure where the server
sent a specific, accurate, reassuring one.

**Fix:** surface the `ApiError` message when there is one, keeping the generic string
as the fallback for network errors.

### R20-3 — the month picker cannot tell "loading" from "lookup failed"  **(Low, app-side)**

`ResourceBookingFlow.tsx:215` sets `resourceAvailableDates` from
`monthAvailabilityQuery.data`, so a failed month lookup yields `null` — which
`MonthDatePicker` documents as *"null while loading"* and treats as **no constraint**
(`MonthDatePicker.tsx:175`: dates are only disabled when `availableDates !== null`).

The consequence is mild and on the safe side: after a 503 the month renders normally
with every date selectable, and the user learns of the problem at the slot step,
where there IS an error and a retry. The app does **not** reproduce web's bug of a
month with nothing green.

But "loading" and "failed" sharing one sentinel means the month gives no signal at
all. Worth a distinct state so the failure is visible where it happened rather than
one step later.

---

## Part 3 — checked and NOT a gap

| Web change | App position |
|---|---|
| `/api/booking/unified-availability` fail-closed | **The app does not call it.** The plan says it "serves the embed and the mobile app" — not this app; every app call site is listed above. Worth telling web, since it affects how they weigh that route's audience. |
| `/api/booking/appointment-calendar`, `/api/booking/class-instances` fail-closed | Not called by the app. The app's equivalents are the `/api/venue/*` staff routes — see R20-1. |
| Retry card in `AppointmentBookingFlow` | Web's **guest** booking UI. The app is staff-facing and has its own error+retry state already. |
| `schedule-read-context.ts` / `availability-read-failure.ts` | Server-side request-scoped plumbing (`node:async_hooks`). No client contract. |
| 503 retry behaviour | Already sensible: `queryClient` retries once and never on 401/403 (`lib/queries/queryClient.ts:76`). |

---

## Part 4 — recommended order

1. **R20-1 to web** — the only finding with real user impact, and the app cannot
   touch it. Ask whether the staff month/availability reads were meant to be in
   Stage 7's scope; the fail-open reasoning given covers write validators, not reads.
2. **R20-4 (doc)** — correct the R19-3 rationale in the code comments, the R19 report
   and the memory note. No behaviour change, but the current wording is misleading.
3. **R20-2** — one-line message fix.
4. **R20-3** — small, and only worth doing if a venue actually hits it; production has
   no resources today, so this surface currently has no traffic.

---

## Part 5 — added after web's reply (`C:\Resneo\Docs\R20-1_WEB_RESPONSE.md`, 2026-08-19)

Web accepted R20-1 as in scope — the Stage 7 scope note had not considered staff
**read** routes at all — and returned four corrections plus five more routes.
Our full reply is `Docs/R20-1_APP_REPLY.md`. What changed on our side:

### R20-5 — the "Any available" fan-out is not fail closed  **(Medium, app-side, TRACKED)**

`lib/queries/useAppointmentAvailability.ts:184` aggregates the client-side
per-practitioner fan-out as:

```ts
const isError = errors.length > 0 && errors.length === results.length;
```

so one practitioner's failure is treated as success and that practitioner's slots
are silently dropped from the merged list. Once web wraps the staff slot route,
this converts a silent partial answer into a *different* silent partial answer for
every "Any available" search — the wrap does not close that path.

The comment on the line ("a single practitioner erroring shouldn't blank the
merged list") is a fair trade for a transient network blip and a bad one for a
deliberate 503. **Not built.** The likely shape is a visible partial state —
"couldn't check every team member" with a retry — rather than either blanking the
list or hiding the gap.

Note the divergence this rests on: the web guest route pools **server-side**, so
its fail-closed is genuine; the app fans out client-side. That is a parity
difference, not an equivalent implementation.

### R20-2 extended to classes and events — BUILT

`ClassBookingFlow` and `EventBookingFlow` hardcoded "Couldn't load classes." /
"Couldn't load events." and discarded `ApiError.message`. Both now prefer the
server's copy, matching the resource fix. Needed because web is wrapping
`/api/booking/class-offerings` (a Stage 7 omission they found) and, on our
finding, `/api/booking/event-offerings`.

### `/api/booking/event-offerings` — raised back to web

Web's §5 accounted for three unwrapped guest routes and omitted this one. It calls
`fetchEventInputForRange` (`route.ts:70`), which contains a fail-open read
(`event-ticket-engine.ts:457`). Same shape as `class-offerings`, same scope-note
justification, and the app calls it directly
(`lib/queries/useBookableOfferings.ts:89`).

### `calendar-grid` — NOT covered by web's change

Recorded here so nothing later reads it as closed. `getCalendarGrid` has zero
reporting sites, so wrapping it today would be a no-op; it discards `error` on
five reads including `bookings`, which renders our calendar as an empty day.
Instrumentation first, then the wrap. Our side already handles the 503
(`app/(app)/(tabs)/index.tsx:2182`), so it needs no app change.

### `/api/venue/class-availability` — confirmed never called

`git log --all -S "class-availability" -- "*.ts" "*.tsx"` returns no commits: the
string has never been in app source on any branch. Web is clear to delete it.

### Web's three staff twins buy the app nothing

`/api/venue/class-offerings`, `/api/venue/resource-availability` and
`/api/venue/resource-calendar` are used by the WEB staff flows. The app's class,
event and resource pickers call the **guest** routes instead. Worth doing on web's
side, but it must not be counted as covering the app for those models.
