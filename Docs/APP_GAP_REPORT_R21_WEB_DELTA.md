# R21 — app-vs-web delta audit

**Range:** `resneo` **`main`** `d0f18da7..491832ca` — 2 commits, 34 files, +3513/−71.
**Audited against:** `Resneo-app` `main` @ `bbb6fa3`, 2026-08-20.
**Range shape:** `d0f18da7` is a direct ancestor of `491832ca`. `b39299f1` is a squash
("Staging (#157)", four granular changes read from its body); `491832ca` is a direct
commit. Every claim below was checked in code on both sides, never from the plan docs.

Two batches:

1. **`b39299f1`** — web's answer to our own R20 delta audit: eight more routes wrapped
   fail-closed, `getCalendarGrid` instrumented, a dead route deleted, and the waitlist
   offer pre-check degraded per entry.
2. **`491832ca`** — three booking-modification defects (F7, G2a, F18) found in web's
   appointment test pass. Its §12.8 explicitly flags **the app** as likely carrying F7.

**Verdict: one real gap in the app (R21-1, F18 deposit actions). F7 — the one web named
us for — is NOT present: the app never had it.** Everything in `b39299f1` lands safely;
the app already handles all four newly-wrapped routes it calls, and its waitlist contract
already matches web's implementation exactly.

**Built 2026-08-20: R21-1, R21-3, R21-5 and R21-6.** The deposit gate now uses a shared
`hasSettleableDeposit`; the variant → duration behaviour is pinned by five tests; and the
modify form no longer wipes the variant off a booking whose service was archived. Each was
confirmed to fail when the bug is injected. R21-6 softens the calendar'''s error state, which
was the app-side precondition web set for wrapping `calendar-grid` — so R21-2 is now
unblocked and sits with web (`Docs/R21_WEB_HANDOVER.md` W1). R21-4 is recorded, not built.

**R21-3 was corrected after web replied** — it was reported as a defect shared with web,
and it is not: web's save already omits the key, the app's did not. Part 5 has the detail.

---

## Part 1 — F7, the bug web flagged the app for

> Web §12.8: "flags that resneo-app likely carries the same F7 duration bug, since that
> half of the fix was client-side."

**It does not.** Web's and the app's modify forms solve the same problem with different
structures, and the app's structure never had the hole.

### Why web had it

`StaffAppointmentModifyForm.tsx` drove duration from an effect that only ran when the
field was empty (`if (durationMinutes != null || !selectedService) return`), and its
variant `<select>` set nothing but the id:

```
onChange={(e) => setVariantId(e.target.value || null)}   // pre-fix, line 1414
```

So switching Basic (30 min) to Premium (60 min) left the field on 30, and the form
posted 30, which the server prefers over the variant's own duration.

### Why the app does not

The app never used an adoption effect for this. Its variant chips call a handler that
moves both values together:

- `components/bookings/ModifyBookingSheet.tsx:475` — `selectVariant` → `setVariantId(id)`
  **and** `setDuration(v.duration_minutes)`
- `components/bookings/ModifyBookingSheet.tsx:453` — `selectService` → resolves the next
  variant, then `setDuration(nextVariant?.duration_minutes ?? svc.duration_minutes)`
- The chips are the only way to change either value (`:1785`, `:1803`), and they even
  label each variant with its length (`${v.name} (${v.duration_minutes}m)`)

The app's adoption effect (`:397`) is scoped to the one job web's now shares — filling a
null duration on a booking whose row carried no end time — and is self-limiting.

The create path is clean for the same reason: `VariantStep` carries
`naturalDuration={variant.duration_minutes}` per variant and passes a duration override
through `onContinue`.

**Verified not reachable by any other route:** every `setVariantId` call site in the app
is either the open-seed (`:334`, paired with `setDuration(target.durationMinutes)`),
`selectService`, or `selectVariant`. The app has no equivalent of web's auto-correct
effect (`StaffAppointmentModifyForm.tsx:547-559`), which is the one place web changes a
variant without touching duration.

### [R21-4] The one real divergence — LOW, behaviour only

Web's fix added `durationEditedByStaffRef`: a duration staff typed or picked themselves
survives a later service/variant switch, which then only *reports* the new catalogue
length. **The app overwrites unconditionally** — the Stepper and preset chips (`:1993`,
`:2014`) call `setDuration` with no marker, so switching variant afterwards discards the
staff figure.

Reaching it needs "adjust duration by hand, *then* change variant", which is the unusual
order. Not a correctness bug — the app always sends a duration that matches the variant
it is sending. Worth matching for consistency, not urgently.

### [R21-5] No regression test on the app side — **BUILT**

Web landed `StaffAppointmentModifyForm.variant-duration.test.tsx` (148 lines) with its
fix. The app's correct behaviour was **untested**: every service fixture in
`ModifyBookingSheet.test.tsx` used `variants: []`, so nothing would have caught a
regression that reintroduced F7 here.

Fixed: the catalogue mock now takes `mockServiceVariants`, and a
`ModifyBookingSheet — variant duration (R21-5)` suite pins five things — the field moves
with the chosen variant, the PATCH carries the new length, the dry run is checked against
the new length (a stale one would pre-clear a slot the booking no longer fits and 409 on
save), switching back restores, and a booking whose own length differs from its
catalogue entry keeps it on open without arming Save.

**Tested the test:** deleting the `setDuration` from `selectVariant` turns three of the
five red.

### F7's server half — the app was a visible victim, now fixed for free

Web's PATCH re-snapshotted `service_variant_name_snapshot` only when the **service** id
changed, so a variant-only switch left it stale. The app reads that column: the venue
detail route resolves `service_variant_name = variantSnapshot || detailBundle.…`
(`route.ts:284`), and the app renders it in booking detail
(`BookingDetailContent.tsx:518`), the bookings list (`BookingRow.tsx:77`), group visit
cards, the payment display and the bookings-tab sort key.

So switched-variant bookings **have been showing the old option name throughout the
app**. Fixed server-side; no app change needed.

**No break from the new 400.** Web's fix also validates the variant on a variant-only
edit (`Invalid or inactive variant for this service`). The app can never trip it: its
catalogue comes from `/api/booking/appointment-catalog`, which filters
`variants.filter((v) => v.is_active)` (`appointment-catalog.ts:253,362`) — which is also
why `AppointmentCatalogVariant` has no `is_active` field at all.

---

## Part 2 — [R21-1] F18: deposit actions offered where the server now refuses — **BUILT**

**Severity: medium. The app carried web's exact pre-fix gate.**

Web removed three deposit actions from bookings with nothing to settle, and added the
matching server guard. The app has the old condition:

```
// components/bookings/DepositSheet.tsx:335
{target.status !== 'Paid' && target.status !== 'Refunded' ? (
  … Send payment link / Record cash payment / Waive deposit …
```

Web's replacement is `hasSettleableDeposit(status)` — true only for `'Pending'` and
`'Failed'` (`src/lib/booking/deposit-action-eligibility.ts`).

**What this means now that web has shipped:** on any booking whose `deposit_status` is
`'Not Required'`, `'Waived'`, `'Charged'`, `'Card Held'` or null, the app offers all
three buttons and **every one of them now 409s**:

- `send_payment_link` — always refused (pre-existing; the app already showed the error)
- `waive` — **newly** refused with `code: 'invalid_state'`
- `record_cash` — **newly** refused with `code: 'invalid_state'`

Before `491832ca`, tapping "Record cash payment" on a no-deposit booking *succeeded* and
wrote `deposit_status: 'Paid'` with `deposit_amount_pence: 0`, so the row then read
"£0.00 · Paid" beside its real outstanding balance and offered a £0 refund. **The web fix
has already stopped the app corrupting rows this way** — the remaining defect is three
dead buttons and a confusing error.

Reachable from one place, so the fix is contained: `BookingDetailContent.tsx:1498`
("Deposit actions" / "Take deposit / payment", gated only by
`showDepositActions = cardHoldState ? cardHoldHasActions : !isCancelled`, `:715`) →
`DepositSheet`.

The error itself degrades correctly today — `run()` surfaces `ApiError.message`
(`DepositSheet.tsx:104`), so staff see web's own copy rather than a generic failure.

### What was built

1. **`lib/booking/booking-staff-indicators.ts`** — `DEPOSIT_SETTLEABLE_STATUSES` +
   `hasSettleableDeposit`, mirroring web's `deposit-action-eligibility.ts`. It went here
   rather than in a new module because this file already owns every other
   `deposit_status` derivation (`showDepositPendingPill`, `showDepositFailedPill`,
   `depositPillAppliesToStatus`).
2. **`DepositSheet.tsx`** — the three settle actions are now gated on
   `hasSettleableDeposit(target.status)`. Refund is untouched: it is gated separately on
   `'Paid'` and must not be caught by the same tightening.
3. **`BookingDetailContent.tsx`** — the button that OPENS the sheet is gated too. Without
   this the fix would have replaced three failing buttons with a sheet whose only working
   control is Close. It now shows only when the sheet has something to offer:
   `!isCancelled && (hasSettleableDeposit(status) || status === 'Paid')`, card-hold
   bookings keeping their own `cardHoldHasActions` gate.
4. The **"Take deposit / payment"** label is gone with it — it could only ever have been
   reached on a booking that has no deposit, which is exactly the case the button no
   longer appears for. Taking money where none was owed is the in-person payment button.

**Tests:** `hasSettleableDeposit` unit-tested in `booking-staff-indicators.test.ts`
(4 cases), plus a new `DepositSheet.test.tsx` (11 cases) covering each status. **Tested
the test:** restoring the old `!== 'Paid' && !== 'Refunded'` gate turns five of the
eleven red.

---

## Part 3 — G2a, not applicable

`/api/confirm` is the **guest** self-reschedule route (guest manage page). The app has no
guest surface and never calls it. The fix — re-snapshotting `service_name_snapshot` on a
guest service change — improves what the app *displays* for those bookings, by the same
mechanism as F7's server half above. Nothing to do.

---

## Part 4 — `b39299f1`, the R20 answer: all four items land safely

### 4.1 Eight routes wrapped fail-closed — app already handles the 503

The app calls four of the eight. All four already render a retry rather than a
confident-looking empty answer, built during R19/R20:

| Route | App caller | Handling |
| --- | --- | --- |
| `venue/appointment-calendar` | `useMonthAvailability` | `ServiceBookingFlow.tsx:955` passes `isError` + the server's own `ApiError.message` + `onRetry` into `MonthDatePicker`, which renders a retry **in place of** the grid (`MonthDatePicker.tsx:61-68`) |
| `venue/appointment-availability` | `useAppointmentAvailability` | `TimeSlotStep.tsx:313` → `ErrorState` with retry; pooled partial failures separately counted (R20-5) |
| `booking/class-offerings` | `useClassOfferings` | `ClassBookingFlow.tsx:142-153` → `ErrorState`, preferring the server's 503 copy |
| `booking/event-offerings` | `useEventOfferings` | `EventBookingFlow.tsx:155` — same shape |

The other four (`venue/{class,event}-offerings`, `venue/resource-{availability,calendar}`)
are web's staff twins; the app uses the guest `/api/booking/*` siblings, exactly as
recorded in R20. **No gap.**

### 4.2 `getCalendarGrid` instrumented — [R21-2] the app-side risk is unchanged, and still not fixable here

Web found all seven reads in `getCalendarGrid` discarded `error` and substituted `[]`, so
a failed `bookings` read rendered an **empty day** on the app's calendar with nothing
logged. Web's commit **only makes it visible** (Sentry); behaviour is deliberately
unchanged, and `/api/venue/calendar-grid` is now *explicitly* recorded as unwrapped —
wrapping it would have been inert until the instrumentation existed.

The app still receives `200` + an empty list and cannot distinguish it from a genuinely
quiet day. **R20's calendar-grid item stays open**, now with web-side telemetry behind
it. Nothing to build here; the next move is web's decision to wrap the route — and web
flagged one sub-decision it deliberately left open: whether a failed *name* lookup
(`guests`, service names — labelled `(label only)`) should blank the whole calendar.
`Docs/R21_WEB_HANDOVER.md` W1 sets out what web needs to do, and confirms the app already
renders a 503 correctly (`app/(app)/(tabs)/index.tsx:2182`). Web has agreed, added that
**no web code fetches this route at all** (the app's calendar is its only consumer), and
was **holding the wrap until R21-6 landed** — which it has (below), so the wrap is theirs
to take whenever they are ready.

#### [R21-6] Soften the calendar's error state first — **BUILT**

One consequence had to land **before** web wraps the route. The calendar polls
`calendar-grid` every 60 seconds (`index.tsx:624,635`) and the screen checked
`gridQuery.isError` before rendering data, so once the route can 503 a single transient
blip during a background refetch would have replaced a working calendar with a full-screen
error.

The grid now stays on screen under a thin banner — "Couldn't refresh — showing the last
update, which may be out of date", with a Retry — and the full-screen error is reserved for
two cases:

- a **cold load**, where there is nothing to fall back on;
- a failure while `placeholderData: keepPreviousData` is holding a **different range**.
  Degrading there would put one day's bookings under another day's date, which is the
  wrong-answer trade `withScheduleFailClosed` exists to avoid. This is the same
  placeholder race `resolveDayLoadState` already handles for the closed-day banner.

The rule is a pure helper, `lib/calendar/grid-error-state.ts` (5 tests), rather than a
condition at the render site, so it cannot drift back into an `isError` check. Web has been
told the wrap is unblocked.

### 4.3 `venue/class-availability` deleted — confirmed dead on our side too

`grep -rn "class-availability"` across the app returns **nothing** outside `_reference/`.
Web's own check (`git log --all -S` over the app repo) agrees. No shipped build can call
it. **No gap.**

### 4.4 Waitlist per-entry degradation — app already exact

Web now leaves `can_offer` unset and sets `offer_check_failed: true` when the pre-check's
schedule read fails, rather than answering a `false` it cannot stand behind. The app was
built to this contract during the R20 exchange and matches field for field:

- `types/waitlist.ts:37-51` — `can_offer?`, `offer_unavailable_reason?`,
  `offer_check_failed?`
- `lib/waitlist/offer-state.ts:39` — `offer_check_failed` checked **first**, so a stale
  `false` cannot win
- `app/(app)/waitlist.tsx:323` — "Couldn't check availability — offering will re-check.",
  muted, button stays enabled

The app's copy is marginally ahead of web's, which puts "Offering re-checks it" in a
`title` tooltip only. **No gap.**

---

## Part 5 — [R21-3] An archived service wiped the booking's variant — **BUILT** (app), open on web

**Corrected 2026-08-20 after web's reply.** The original finding claimed both repos posted
`service_variant_id: null` here. That was wrong about web, and the correction matters
because it moves the defect from "shared, low priority" to "ours, real data loss".

**Web's save was already safe.** `buildPatchPayload`
(`StaffAppointmentModifyForm.tsx:96`) sets the key only when
`requiresVariant && serviceVariantId`, so the route's `service_variant_id !== undefined`
branch never runs and both the id and `service_variant_name_snapshot` survive. The line
originally cited (`:823`) is web's **validate dry-run** body, not its save — web builds the
two in different places, the app built them in the same place, which is how they got
conflated. Web does carry the bug in that dry run, so its check judges "no variant" while
its save preserves one; web is fixing the validate body only.

**The app's save posted `null`.** Both bodies in `ModifyBookingSheet` carried
`service_variant_id: requiresVariant ? variantId : null`, and `requiresVariant` is false
when the booked service is no longer in the catalogue — a state the form explicitly
supports ("pick a service below to change it, or just adjust the time and duration").
So adjusting only the *time* of an archived-service booking dropped its option, and since
`491832ca` its option **name** with it.

### What was built

One derived value, spread by both bodies so the dry run and the save cannot disagree:

```
const variantIdToSend = serviceInCatalog ? (requiresVariant ? variantId : null) : undefined;
...(variantIdToSend !== undefined ? { service_variant_id: variantIdToSend } : {}),
```

Keyed on **whether the catalogue resolved the service**, not on `!serviceVariantId` as web
does. The two agree on the archived case and differ on one other: switching a booking from
a variant service to a plain one. `bookingUpdate.service_variant_id` is written in exactly
one place (`route.ts:2663`), gated on the key being present, so web's rule leaves the old
id in place there while the service-change block nulls the name snapshot beside it. Ours
still sends `null`, which clears it. Raised with web; we will match whichever they settle
on.

**Tests:** four in `ModifyBookingSheet.test.tsx` — the archived case omits the key, a
service that really has no options still sends `null`, a real variant is still sent, and
the "service is gone" notice still renders. **Tested the test:** restoring the old
expression turns the archived-service one red.

---

## Summary

| # | Finding | Severity | Where |
| --- | --- | --- | --- |
| **R21-1** | **F18 — deposit actions offered where the server now 409s** | Medium — **BUILT** | `DepositSheet.tsx`, `BookingDetailContent.tsx`, `booking-staff-indicators.ts` |
| R21-2 | `calendar-grid` still fails open; app cannot detect it | Medium — web's move, **now unblocked** (R21-6 landed) | — |
| R21-3 | Archived service wiped the booking's variant (and its name) on save | Medium — **BUILT** (app-only; web's save was already safe) | `ModifyBookingSheet.tsx` |
| R21-4 | Staff-typed duration overwritten by a later variant switch | Low — recorded, not built | `ModifyBookingSheet.tsx:1993,2014` |
| R21-5 | No app regression test for variant → duration | Low — **BUILT** | `ModifyBookingSheet.test.tsx` |
| R21-6 | Calendar showed a full-screen error when a 60s poll failed over good data | Low — **BUILT** (unblocks web's wrap) | `grid-error-state.ts`, `app/(app)/(tabs)/index.tsx` |
| — | F7 duration bug (web's §12.8 flag) | **Not present** | — |
| — | G2a guest reschedule snapshot | N/A — guest route | — |
| — | Fail-closed wraps on the 4 routes the app calls | Already handled | — |
| — | `class-availability` deletion | Never called | — |
| — | Waitlist `offer_check_failed` | Already exact | — |
