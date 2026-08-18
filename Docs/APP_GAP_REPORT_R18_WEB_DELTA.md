# R18 — app-vs-web delta audit

**Range:** `resneo` **`main`** `239f6020..6e224759` — 3 commits (two squash merges and
one direct), 83 files, +7,911/−783.
**Audited against:** `Resneo-app` `main` @ `aebf12d`, 2026-08-18.
**Range shape:** `239f6020` is a direct ancestor of `6e224759`, so the range is the
delta. Two of the three commits are squashes (`ea9672f2` "Staging (#150)",
`6e224759` "Staging (#152)"), so the granular authorship is not visible here; the
content was audited file by file.

**Verdict: two build items, both in the money controls on the visit create paths
— both BUILT 2026-08-18, see the blockquotes below. Everything else in the batch
either arrives free server-side or was already correct in the app.** The batch is Stages 0–6a of web's scheduling resolver plan
(`Docs/Resneo_Scheduling_Resolver_Plan_August_2026.md`) plus the staff charge
discretion fix (#151). It also closes **R17-4**, which was raised by the app.

---

## Part 1 — R17 close-out

| Finding | Where it stood | Where it stands now |
|---|---|---|
| **R17-1** staff group/multi-service judged by the guest window | fixed on web `staging` only; regression live in production | **Closed.** Both routes now select the helper on `source` — `create-multi-service:413`, `create-group:399`. Shipped to `main` inside `6e224759`. |
| **R17-2** diary refused a drag over a break or closure | built app-side 2026-08-16 (`915039b`) | **Closed.** `lib/calendar/occupying-blocks.ts` present, both drag grids use it. |
| **R17-3** app never sent `allow_during_breaks` | built app-side, effective for singles only | **Closed.** Eight send sites plus both `useVisitMutations` payload types carry it. |
| **R17-4** the flag never reached the two visit SAVE routes | raised with web, handover written | **Closed by web.** `visits/[groupBookingId]/schedule/route.ts` and `.../services/route.ts` both take `allow_during_breaks` and pass `allowDuringBreaks` into the validator. |

**R17 is complete on both sides.** The app half needs no further code. Two things
are worth a device pass rather than a code read, because neither was ever probed
live:

1. **A visit dragged over a break now saves.** Until `6e224759` this returned
   409 while the identical drag on a single booking succeeded. That asymmetry is
   the one user-visible thing R17-4 fixes, and it has never been exercised.
2. **A staff walk-in multi-service visit on a venue with
   `allow_same_day_booking: false`.** R17-1 was stated from route source with no
   live probe. It is now fixed on both branches, so the check is a confirmation,
   not a hunt.

**One residual, unchanged and deliberate:** a staff **phone** multi-service or
group booking still gets the guest booking window, so it is still refused for
today at a venue with `allow_same_day_booking: false`, and still refused beyond
`max_advance_booking_days`. Web states this explicitly as matching what a single
staff booking does. No app change; the app's error surfacing for it is the
route's plain message.

---

## Part 2 — new gaps

### R18-1 — The app's group flow sends no money decision at all, so a card hold is forced on and a deposit cannot be taken

> **BUILT 2026-08-18.** `GroupPerson` now carries the same `chargePence` /
> `chargeLabel` pair a chain segment does, stamped in `commitDraft` from
> `multiServiceSegmentCharge`, so the confirm step totals the whole group rather
> than reading one attendee. The confirm screen gained both controls and both
> money lines (deposit/pay-now and no-show fee are separate rows, since a group
> can owe both), and `buildPayload` threads `charges`. Walk-ins get the hold
> toggle but not the charge checkbox, matching the route.

**Severity: high.** Two defects from one omission.

Web #151 (`6a89fb96`) gave both visit create routes per-booking staff discretion
over money, resolved through one helper:

```ts
// src/lib/booking/staff-visit-charge-discretion.ts
chargeDeposits: !isWalkIn && (input.require_deposit ?? false),
holdCards: input.require_card_hold ?? true,
```

Note the asymmetric defaults. **An omitted `require_deposit` means "do not
charge". An omitted `require_card_hold` means "hold the card".**

The app's `buildGroupPayload` already accepts a `charges` argument
([lib/booking/multi-service-chain.ts:266](../lib/booking/multi-service-chain.ts)),
but `GroupBookingFlow` never passes one — it has no charge control of any kind,
so `staffChargePayloadFields` returns `{}` and neither field is sent.

| Service in the group | Result today |
|---|---|
| takes a deposit | no deposit is ever collected, and staff have no way to ask for one |
| `payment_requirement: 'card_hold'` | hold forced on: `deposit_status: 'Pending'` awaiting the card save (`create-group/route.ts:738`), with no toggle to waive it |

The card-hold row is the sharper one: the app's group flow reports success and
navigates away ([GroupBookingFlow.tsx:320](../components/booking-wizard/GroupBookingFlow.tsx)
defers the Stripe step by design), so staff get a Pending booking they did not
choose and cannot decline at the point of creation.

Web carries both controls on its group step and sends both fields
(`AppointmentBookingFlow.tsx:2780-2781`, controls at `:5652`), and says why in
the source: the group step is unreachable on the web today and exists precisely
because *"create-group IS staff-reachable from the mobile app"*. The control was
built for this app, and the app does not render it.

**Fix:** render the deposit checkbox and the card-hold toggle in
`GroupBookingFlow` against the group's totals, and pass `charges` into
`buildGroupPayload`. The payload builder needs no change.

---

### R18-2 — A multi-service chain has no card-hold toggle, so a chain with a hold segment always holds

> **BUILT 2026-08-18.** New `resolveVisitCardHoldTotal` sums a visit's hold
> segments (the mirror of `resolveVisitChargeTotal`, which drops them);
> `ConfirmStep` uses it to offer the toggle on a chain and sends
> `requireCardHold` in `charges`. The two payload flags became independent
> spreads rather than an either/or — a single service still resolves to one or
> the other, but writing it as a choice was what hid the second control from
> every caller that can carry both. The two controls were extracted to
> `components/booking-wizard/StaffChargeControls.tsx` for the third caller
> (R18-1) rather than copied a third time.

**Severity: medium-high.** Same shape as R18-1, one field narrower.

`aebf12d` fixed the deposit half for chains — `charges: { requireDeposit }` is
now threaded — but deliberately left the hold alone:

```ts
// components/booking-wizard/ConfirmStep.tsx
const staffCardHold = isMultiService ? null : resolveStaffEntityCardHold({ … });
```

with the payload comment recording it: *"chains have no hold toggle yet, so
there is no decision to report and the route's default (on) stands."* That was
written against the old route, where there was nothing to report to. There is
now.

Web reached the opposite conclusion in the same release, and explains it:

> A mixed chain can carry both a chargeable amount and a card-hold fee; each
> gets its own control, since for a chain "the two are never shown together"
> (7.6) would leave one of them with no control at all.

So on web a chain shows the deposit checkbox **and** the hold toggle
(`AppointmentBookingFlow.tsx:4685` and `:4696`). For a single service only one is
ever non-zero, so the app's mutually-exclusive rule stays correct there — it is
only chains that need both.

**Fix:** total the `card_hold` segments (the pieces `resolveVisitChargeTotal`
already filters out of the money-now total, so the data is in hand), render the
toggle when that total is greater than zero, and send `require_card_hold`
alongside `require_deposit` in `staffChargePayloadFields`.

---

## Verified clear — checked, and no action needed

**`/api/venue/bookings` no longer forces `full_payment`.** The single-booking
route now gates both charge labels on the checkbox
(`requiresDeposit = staffWantsDeposit && …`). The app's `aebf12d` moved to the
same rule the same day via `lib/booking/appointment-online-charge.ts`, labelling
the control "Require payment" for a pay-in-full service. The two agree.

**`days_off` now rejects weekday names** on `POST`/`PATCH
/api/venue/practitioners`, with a comment naming the mobile app as the caller it
cannot see. The app never sends the field: `PatchPractitionerInput`
([types/availability-manage.ts:77](../types/availability-manage.ts)) has no
`days_off`, and no app surface writes one. The app's amber "legacy blocked
dates" banner keys on ISO dates and still matches web's, which is unchanged.

**The new `availability_blocks` validation cannot bite the app.** The route now
refuses `date_end < date_start`, `time_end <= time_start`, and an
`amended_hours` block with no periods, and PATCH now 404s on a missing row. The
app's `validateDraft`
([components/manage/AvailabilityBlocksSection.tsx:236](../components/manage/AvailabilityBlocksSection.tsx))
already enforces all three client-side, with the same messages.

**The closure-conflict 409 now also fires for `amended_hours`** (narrowing a
day's hours strands bookings the way a closure does). The app's create/update
hooks already thread `?acknowledge_affected_bookings=true`
([lib/queries/useAvailabilityBlocks.ts:130](../lib/queries/useAvailabilityBlocks.ts))
and the section handles the `requires_confirmation` body generically, so
amended-hours saves take the existing confirm path. **Worth a device check** that
the confirm sheet does appear when editing an amended-hours block, since it could
not fire there before.

**Grid bounds need no port.** Web added `useVenueWideBlocks` and threaded blocks
into `getCalendarGridBounds` so its diary follows a date's resolved hours; part
of that was undoing a circularity in its own generated closure stripes. The app
derives bounds from the returned content ranges instead
(`AllCalendarsDayGrid.tsx:358` sums working hours, bookings, time blocks,
sessions and schedule blocks), so an amended window already widens the grid.

**Part-day closures now mean what they say for appointments.** Stage 3 deleted
the adapter that converted any `closed` block into a full-day appointment
closure, so the times in the app's closure editor now narrow the day instead of
being ignored. Behaviour improves with no app change. Web replaced its amber "a
Closure always removes the whole day" warning with a plain helper line; the app
never carried that warning, so there is nothing stale to remove — optionally add
the new line ("Leave both times blank to close the whole day").

**Hosted resources stop selling during the host's leave**
(`resource-booking-engine`, +311) and **group sessions are now gated by venue
hours on both read and write** (a class by explicit closures alone, an event by
hours too). Both are server-side and arrive free. The second is a real behaviour
change for app staff: a 19:00 event at a 09:00–17:00 venue will no longer be
listed or accepted. Web staff hit the identical rule, so this is parity, not a
gap — but it is new, and there is no staff override for it on either client.

**The three public calendar routes went `Cache-Control: no-store`**
(appointment-calendar, class-instances, resource-calendar) because nothing
revalidates a CDN-cached schedule. The app's own React Query staleTime is now the
only cache in front of those reads.

**Not a new gap, noted:** the app has no service availability month summary
(web's `ServiceAvailabilityCalendar`, re-pointed here from the legacy exceptions
JSON to real blocks). The app exposes `custom_availability_enabled` on the
service editor without the calendar preview. Pre-existing and outside this range.

---

## Not covered

Static analysis of both trees plus the migration. No device pass and no live API
probe. The `calendar_date_overrides` migration (Stage 6a) is expand-only and
backfill-only — no route reads it yet, and the app issues no `.from()` against
it — so it needs nothing from the app until Stage 6b.
