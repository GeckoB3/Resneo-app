# Handover — R20-1: Stage 7 fails closed for guests, but the staff read routes still fail open

**For:** an agent working in the ResNeo **web** repo.
**Repo / branch:** `C:\Resneo`, on **`main`** @ `d0f18da7` ("Staging (#156)").
**Size:** two one-line wraps, using a helper that already exists and is already
proven. No new logic, no migration, no schema change.
**Found by:** the ResNeo mobile app's R20 delta audit of `9c1efcf9..d0f18da7`.
Full context in the app repo at `Docs/APP_GAP_REPORT_R20_WEB_DELTA.md` (R20-1).

**This is a question first and a task second.** Stage 7's scope note may have
considered and excluded these routes; if so, say why and close it. Please read §3
before implementing, and §5 before deploying — the app needs one change of its own
landed first or the improvement arrives invisible.

---

## 1. What is wrong

Stage 7 wrapped five **guest** availability routes in `withScheduleFailClosed`. The
**staff** copies of the same reads were not wrapped, and they run the same code:

| Route | Wrapped? | Shared module |
|---|---|---|
| `src/app/api/booking/appointment-calendar/route.ts:53` | ✅ `withScheduleFailClosed` | `appointment-month-availability.ts` |
| `src/app/api/venue/appointment-calendar/route.ts:40` | ❌ bare `export async function GET` | **the same module** (`:16-18`) |
| `src/app/api/booking/availability/route.ts` | ✅ | appointment engine |
| `src/app/api/venue/appointment-availability/route.ts:17` | ❌ bare | the same engine |

`src/lib/availability/appointment-month-availability.ts` carries **twelve**
`reportAvailabilityReadFailure` sites — the file Stage 7's own commentary calls
"the most exposed surface in the programme", where a failure "does not remove one
time, it removes whole DATES from the picker".

Both routes reach that code with no wrapper, so a failed read returns **200 with
dates silently missing**.

## 2. Why it matters — this is the mobile app's primary booking surface

**The serious direction is the engine OFFERING a time that is not free**, not
withholding one. A failed leave or closure read is what the plan calls "the engine
sells the day": on a staff route that is a double-booked practitioner and a
customer turned away at the door. (Corrected 2026-08-19 after web's reply — the
original draft led with withheld dates, which is the milder half of the case and
made this look like an extension of decision (J) rather than decision (J) with
the audience changed.)

The milder direction is still worth stating, because it is what we can see:

The ResNeo app is staff-facing. It does **not** call the guest routes for
appointments; it calls these two:

| App hook | Route | What it drives |
|---|---|---|
| `lib/queries/useMonthAvailability.ts:96` | `/api/venue/appointment-calendar` | the date picker in the new-booking wizard |
| `lib/queries/useAppointmentAvailability.ts:53` | `/api/venue/appointment-availability` | the time-slot list |

The app **disables** dates the month route omits (`MonthDatePicker.tsx:175`). So a
failed read does not degrade gracefully: a member of staff is shown a month with
dates greyed out, cannot select them, and is told nothing. They conclude the venue
is booked and either turn the customer away or work around the wizard.

That is the exact failure decision (J) exists to prevent, with the audience changed.

## 3. Why we think this is in scope — please check us

The status table says "Guest paths only: staff write validators still fail open,
deliberately". §4 Stage 7 (`Docs/Resneo_Scheduling_Resolver_Plan_August_2026.md:841`)
defines that:

> The staff **write-path validators** (`findClassScheduleWindowAvailabilityConflict`,
> `findEventLeaveConflict`) still fail open, deliberately and consistently with each
> other… refusing to let staff schedule anything during a database wobble is a
> different trade with a different answer.

Two points:

1. That reasoning is about **write validators** — two named functions that BLOCK a
   staff write. We agree with it entirely and are **not** asking you to change them.
   The routes above are **reads**. They block nothing; they quietly withhold options.
2. Decision (J)'s own justification (`:839`) is already a staff-cost argument:
   *"a wrong booking costs staff time and goodwill to untangle, while a retry message
   costs one refresh."* A staff member who cannot see a bookable date pays that cost
   without the compensating retry message.

So these look like surfaces that fell **outside** the scope note rather than ones
decided against. If they were deliberately excluded, the plan does not say so, and
recording the reason would be worth more than the code change.

## 4. The change

Both routes already have a single `GET` export and no partial-response paths, so the
same handler-level wrap Stage 7 used elsewhere fits without restructuring:

```ts
// src/app/api/venue/appointment-calendar/route.ts
export async function GET(request: NextRequest) {
  return withScheduleFailClosed(() => handleAppointmentCalendarGet(request));
}
async function handleAppointmentCalendarGet(request: NextRequest) { /* existing body */ }
```

and the same shape for `src/app/api/venue/appointment-availability/route.ts`.

Points worth keeping in mind:

- **`withScheduleFailClosed` already replaces only a SUCCESS.** A 400/403/500 passes
  through untouched, which is what you want: the 401 guard at the top of each staff
  handler must keep returning 401, not become a 503.
- **The body omits venue and calendar ids** because the guest routes are
  unauthenticated. That is harmless for a staff route — reuse the helper as-is rather
  than forking it for a marginally richer body.
- **`Retry-After: 15` and `no-store` come for free** and are correct here too.
- `/api/venue/appointment-availability` has no internal pooling branch (web confirmed).
  **Correction 2026-08-19:** this bullet originally called the app's client-side
  `any_available` fan-out "the right granularity" because it treats a partial failure
  as success "by design". That was wrong and contradicted our own R20 report. The
  aggregation is `errors.length === results.length`, so one practitioner's 503 silently
  drops that practitioner's slots. It is an app-side hole, tracked as R20-5, and it
  means this wrap does not fully close the "Any available" path.

## 5. Deploy order — the app needs a change first

**Please do not deploy this until the app change described here has shipped, or the
improvement lands invisible.**

What the app does today with a 503 from each route:

| Route | App behaviour on 503 | Verdict |
|---|---|---|
| `/api/venue/appointment-availability` | `TimeSlotStep.tsx:310` renders `ErrorState` with the server's own message and a Retry button | ✅ already correct — your copy reaches the user verbatim |
| `/api/venue/appointment-calendar` | `ServiceBookingFlow.tsx:692` collapses the error to `availableDates = null`, which `MonthDatePicker` reads as **"no constraint"** — every date becomes selectable and **nothing is shown to the user** | ⚠️ needs an app fix first |

The month picker's `null` currently means both "still loading" and "failed". Landing
the wrap before the app separates them would turn a silent wrong answer into a
different silent wrong answer: the month would simply stop colouring dates, with no
error and no retry.

**Superseded 2026-08-19.** R20-3 is built and committed. More importantly, web's
reply corrected the ordering rule and was right: an app release never reaches every
install, so "app first" is not sufficient on its own. Wrapping **both** routes in
one commit is what makes an old client degrade acceptably — the month goes
permissive rather than falsely restrictive, and the failure surfaces one step later
at `TimeSlotStep.tsx:310`, which already shows the server's own message with a
Retry on every shipped version. **Both or neither**, and not gated on the app.

## 6. Suggested verification

Mirror what Stage 7 did for the guest routes, which worked well:

1. Inject a failure at handler level (not deep in a helper the request shape may not
   reach — Stage 7 lost time to exactly that, `[R3-91]`).
2. Confirm **503 with `Retry-After: 15`**, then confirm clean recovery to 200.
3. Confirm a **401** on an unauthenticated request is still a 401.
4. Confirm no false 503 on the normal path for both routes.

The shared helper's 8 fixtures already cover the generic behaviour, so route-level
tests need only assert the wrap is present and that auth failures pass through.
