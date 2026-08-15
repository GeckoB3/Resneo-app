# App Gap Report R16 — Web delta audit (resneo `5ae4eadf..fe09c0a4`)

**Date:** 2026-08-15
**Scope:** the new content on web `main` since the R15 audit point — 55 files, 4,964 insertions / 137 deletions.
**Verdict:** this range is a **security hardening pass**, not feature work. Almost all of it arrives free. There are **three real app gaps, none High**, and **one watch item that outranks every gap in the report** (W1: `bookings` column grants vs. the app's realtime channels).

> **Status: BUILT 2026-08-15.** R16-1, R16-3 and R16-4 are implemented; 165 suites / 1,713 tests green, `tsc --noEmit` clean, `eslint` at its exact pre-existing baseline (15 errors, all in `scripts/`; 2 warnings, both pre-existing). **R16-2 and R16-5 were withdrawn on inspection — the app already handled both.** See §6. Nothing has been smoke-tested on a device.
>
> R16-1 grew during the build: the audit found the cross-column drag, but the Modify sheet turned out to send `practitioner_id` on **every** save, changed or not, which made C8 refuse ordinary time edits by non-admins on colleagues' bookings. See §2.

## On the range boundaries — read this before re-running the comparison

`git log 671f5051..fe09c0a4` reports 13 commits, but that range **re-includes everything R14 and R15 already audited**: web's `staging` was squash-merged into `main` as a chain of `Staging (#…)` commits, so R14's and R15's work reappears as new commits on `main` without being new content. The genuinely new material is the **tree diff** `5ae4eadf..fe09c0a4`, which is what this report audits. See [Reference repo](../_reference/Resneo) — commit-graph checks mislead across a squash; diff the trees.

The corollary is the good news: **the R14/R15 shipping gate is lifted.** `PATCH /api/venue/visits/{gid}/schedule` and `/services`, and the duration floor of 5, are on `origin/main` as of `fe09c0a4`. The app work built for R14/R15 no longer 404s or 400s against production.

---

## 1. What the web shipped

Web ran a forensic audit (`Docs/Resneo_Forensic_Audit_August_2026.md`, 827 lines) and implemented its findings. Items are numbered by that document (C=critical, N=new, H=high, D=durable fix).

| Item | What it is | App relevance |
| --- | --- | --- |
| **C11** — shared-PI refunds | A group, visit or class cart creates **one** PaymentIntent for the whole party. `stripe.refunds.create({payment_intent})` with no `amount` refunded **every** member's deposit when one attendee cancelled. New `shared-deposit-refund.ts` resolves the settling rows' share plus a deterministic idempotency key; applied at all four settle paths + a webhook guard for partial refunds. | **Free**, plus **R16-2** |
| **C12** — cascade predicate | `group_booking_id` means three things. A **class cart** (several sessions in one checkout) carries no `person_label`, so it read as a multi-service visit: one no-show cascaded to every session in the basket, including future ones, forfeiting their deposits. New `isCascadingVisitGroup` discriminates on `class_instance_id`. | **Free**, see **W2** |
| **C13** — deadline laundering | Every reschedule re-pinned `cancellation_deadline` to `newStart − notice`, so a guest past their deadline could reschedule further out and make a forfeited deposit refundable again. New `reschedule-cancellation-deadline.ts` freezes a passed deadline when `deposit_status` is `Paid` or `Card Held`, and skips the policy-snapshot rewrite with it. | **Free** |
| **C3 (interim)** — slot race | Every appointment write validated then inserted with up to ~650 lines and Stripe round-trips in between. New `revalidate-appointment-slot.ts` re-checks immediately before the insert on all five write paths. Explicitly **narrows, does not close** the race. | **R16-3** |
| **C8** — calendar move authz | A non-admin could move any booking onto a colleague's calendar. The validate route gated it; the route that performs the write did not. Now `requireManagedCalendarAccess` on `practitioner_id` for own-venue non-admins. | **R16-1** — the largest app-facing item in the range |
| **C6** — summary route gates | `/api/venue/bookings/[id]/summary` had neither the `full_details` gate nor PII redaction its sibling detail route has, and the web client *prefers* it. Now 403s a `time_only` viewer and redacts without the PII grant. | Free (see §3) |
| **H36** — linked list PII | `special_requests`, `internal_notes`, `dietary_notes`, `occasion` were sent in full to a `full_details` partner without the PII grant. Now redacted row-wide via the shared field list. | **R16-5** |
| **H38** — linked create guards | `practitionerId`/`appointmentServiceId` were optional on `linkedBookingCreateSchema`, and **every** guard in the create route was conditional on them — omit either and a partner wrote an unvalidated row onto the owner's diary. Both now required uuids. | **R16-4** |
| **C7** — accept-with-changes | An accepter could raise what the **requester** exposes and activate the link without the requester agreeing. The requester's side now becomes a `pending_change`, with a notification. | Free |
| **H8** — visit pill status | One cancelled service drove the whole visit's anchor to `Cancelled`, rendering every live sibling as cancelled. Terminal outcomes excluded from both the seed and the fold. | **No gap** — see §3 |
| **C10** — cancelled visit segments | The modify form planned around cancelled segments while the server re-planned from scheduled-only rows, so pressing Save on an untouched form moved the whole visit. Now filtered at the point of use. | **No gap** — see §3 |
| **C0/C1/C2, C4, N2–N5, D1** | Database hardening: revoked client `EXECUTE` on 19 SECURITY DEFINER functions (incl. `admin_hard_delete_venue`, which had no authorisation check at all); dropped the anon `waitlist_entries` policies; made `bookings.venue_id` immutable by trigger; closed the linked INSERT/DELETE policies; **column-level `SELECT` grants on `bookings` for `authenticated`**. Plus a CI check (`check-client-executable-functions.mjs`) against an allowlist of 12. | Free, plus **W1**, **W3** |

Non-app: `robots.ts`, `sitemap.ts`, `MarketingFooter.tsx`, `.github/workflows/ci.yml`.

---

## 2. Gaps

### R16-1 · The app offers a calendar move it is no longer allowed to make — **Medium**

C8 added a server-side gate: an own-venue non-admin PATCHing `practitioner_id` now gets **403 "You can only move bookings onto calendars assigned to your account."**

The app walks straight into it. [usePractitioners.ts:33](lib/queries/usePractitioners.ts:33) always sends `roster: '1'`, and that flag is precisely what disables the managed-calendar narrowing server-side:

```ts
// _reference/Resneo/src/app/api/venue/practitioners/route.ts:326
if (staff.role !== 'admin' && !roster) {
  const linkedIds = await getStaffManagedCalendarIds(admin, staff.venue_id, staff.id);
  list = linkedIds.length > 0 ? list.filter(...) : [];
}
```

So a non-admin sees **every** column. Neither day grid gates the drag on role — there is no `isAdmin` reference in `CalendarDayGrid.tsx` or `AllCalendarsDayGrid.tsx` — and `useRescheduleBookingById` ([useBookingMutations.ts:271](lib/queries/useBookingMutations.ts:271)) sends `practitioner_id` from both the drag and the "move to practitioner" chooser at [index.tsx:369](app/(app)/(tabs)/index.tsx:369).

Result for a non-admin today: the gesture completes, the bar animates, the PATCH 403s, and the grid snaps back on the failed invalidation. No data loss, but an affordance that is offered and then refused — and the error copy is about permissions, which staff will read as a bug.

Web has the same shape on its own dashboard; that is *why* the fix was server-side. But the app can do better cheaply, and `/api/venue/staff/me` already returns `linked_calendar_ids` — the output of `getStaffManagedCalendarIds`, the very function the server's gate consults.

**Note the scope carefully.** The gate is own-venue only (`isOwnVenue && staff.role !== 'admin'`) and lives inside the `body.practitioner_id` block, so a plain reschedule, status change, note edit or deposit action is untouched. Do not hoist it into a general admin check.

#### What the build found that the audit missed

The drag is the smaller half. **`ModifyBookingSheet` sent `practitioner_id` on every save, changed or not** — and it is the field's *presence*, not a changed value, that arms the gate. So a non-admin who opened Modify on a colleague's booking and changed only the time was refused, on a path the server otherwise permits. The dry run went first: the validate route has carried this gate for longer than the PATCH route has, and a 403 is not in the sheet's refusal set (409/400/412), so the check degraded to `unknown` and the save went anyway — straight into the same 403.

Three changes, in the order they matter:

1. **Send the calendar only on a real reassign** (`reassignedPractitionerId`), at all five send sites — the two visit endpoints, the validate dry run, the services payload, and the single-booking PATCH. Behaviour-identical when unchanged: `venue/bookings/[id]/route.ts:2311` resolves the slot from `booking.practitioner_id ?? booking.calendar_id`, and `visits/…/schedule:191` and `…/services:236` both fall back to the visit's current calendar. This is the fix that restores work non-admins were doing before C8 landed.
2. **Refuse the cross-column drag up front** in `commitTimeMove`, with web's own copy. Only the reassign branch is gated — a non-admin dragging inside their own column sends no `practitioner_id` and must stay unaffected. The target is always an own-venue calendar, because `AllCalendarsDayGrid` already restricts cross-column drops to `ownColumnIds`, which is exactly the server's `isOwnVenue` condition.
3. **Narrow the Modify sheet's calendar picker** to assigned calendars, keeping the booking's *current* calendar in the list even when it is not theirs — it is the selected value, and dropping it would render the picker with nothing chosen and make an unrelated edit look like a reassign.

The shared rule lives in [managed-calendars.ts](lib/calendar/managed-calendars.ts), mirroring `requireManagedCalendarAccess` case for case, with one deliberate divergence: an unknown role (profile still loading) is **optimistic**. Refusing there would block admins for the first moments after launch, and the server runs the real check regardless — so being wrong costs a 403, where the pessimistic version costs a broken gesture for everyone.

### ~~R16-2 · Refund is offered on bookings that have no paid deposit~~ — **WITHDRAWN, does not exist**

The audit read `showDepositActions` in `BookingDetailContent` — which gates on the cancel state alone — and stopped there. That variable only decides whether the deposit *card* renders. The Refund **button** is gated one level down, inside the sheet, on the deposit status itself:

```tsx
// components/bookings/DepositSheet.tsx:365
{target.status === 'Paid' ? (
  <Button label={refundArmed ? 'Tap to confirm refund' : 'Refund'} … />
) : null}
```

and `target.status` is `booking.deposit_status` at both call sites. The double-press case C11 guards against is covered too: the button is `disabled={pending !== null}` while in flight, `run()` calls `onClose()` on success, and the press is two-stage (arm, then confirm). **Nothing to build.** The new 409 is a safety net the app should never reach.

### R16-3 · The new slot-taken 409 is surfaced but not acted on — **Low**

C3 added a pre-insert re-check to five write paths, returning:

```ts
{ error: 'That appointment slot was just taken. Please choose another time.',
  code: 'SLOT_NO_LONGER_AVAILABLE' }   // 409
```

Nothing in the app matched on that code or that copy. `apiFetch` shows the message, which is good copy, so this was never a defect — but the picker behind the sheet still held the dead slot, and staff's obvious next move is to tap it again. The app already had `invalidateAppointmentAvailability` for exactly this (its own test note reads *"a slot just taken kept being served"*); it just was not reachable from a failure.

**Built:** `isSlotTakenError` in [client.ts](lib/api/client.ts) matches on `code`, never the sentence — the copy is web's to change, the contract is not — and `invalidateAvailabilityIfSlotTaken` wires it to the four appointment write paths (`useCreateBooking`, `useCreateGroupBooking`, `useCreateMultiServiceBooking`, `useUpdateWaitlistEntry`). Deliberately narrow: a compliance block or a dropped connection says nothing about occupancy, and refetching every picker on every error would be traffic without information.

The staff walk-in path is **not** wired, and should not be: the server sets no re-check for `staffWalkIn`, because a walk-in deliberately bypasses availability ([walk-in-bypasses-availability]) and can never receive this 409.

**One adjacent fix taken while here:** converting a waitlist entry *writes a booking*, so it fills a slot exactly as the create paths do — and it was the one booking write in the app that never invalidated availability on **success**. One line, same helper.

### R16-4 · Linked-booking create payload types both required ids as optional — **Low (latent)**

H38 made `practitionerId` and `appointmentServiceId` required non-null uuids. The app's type still says otherwise:

```ts
// types/linked-venues.ts:346
practitionerId?: string | null;
appointmentServiceId?: string | null;
```

**No caller exists.** `useCreateLinkedBooking` ([useLinkedCalendar.ts:74](lib/queries/useLinkedCalendar.ts:74)) is referenced only by its own definition — the app has no linked-booking create UI. So this is a latent trap for whoever builds one, not a live bug.

**Built:** both tightened to required `string`, with the reason on the type — that omitting them was the *vulnerability*, not a convenience, because every guard in the create route was conditional on them while the RPC wrote the row regardless. Whoever builds that UI must gate Save on both; do not restore `|| null`.

### ~~R16-5 · Linked bookings lose four note fields for non-PII partners~~ — **WITHDRAWN, does not exist**

H36 does null those four fields for a partner without the PII grant, but both risks the audit raised turn out to be already handled:

- **Display.** The notes block renders only when there is something in it (`booking.specialRequests?.trim() || booking.internalNotes?.trim()`, [LinkedBookingDetailSheet.tsx:343](components/linked/LinkedBookingDetailSheet.tsx:343)). Redacted to null, the whole block is absent — no stray label, no empty box.
- **Write-back.** The note field is an **"Add a note" composer**, not a seeded editor: `useState('')`, reset to `''` on open, and `changes.special_requests` is set only when it has text. A redacted field can never be written back as empty, because it was never loaded into the input in the first place.

**Nothing to build.**

---

## 3. Free — no app work

- **C11 shared-PI refunds.** Every refund the app triggers (cancel, deposit Refund, the guest's own manage link) now settles only the rows being cancelled. The app's party and visit bookings were exposed to the whole-party refund and are now not.
- **C12 cascade.** Marking one class-cart session No-Show no longer forfeits the rest of the basket. The app has **no copy claiming a cancel cascades to the group**, so there is nothing to reword.
- **C13 deadline.** The app only ever displays `cancellation_deadline` ([BookingDetailContent.tsx:1390](components/bookings/BookingDetailContent.tsx:1390)) and never recomputes it, so it inherits the corrected value.
- **H8 visit pill status — the app never had this bug.** `GroupVisitCards` renders `<StatusPill status={row.status} />` per row ([GroupVisitCards.tsx:97](components/bookings/GroupVisitCards.tsx:97), [:137](components/bookings/GroupVisitCards.tsx:137)) with no visit-wide anchor to floor them at. Web's fold was the defect; the app never ported it.
- **C10 cancelled visit segments — already correct.** `resolveAppointmentVisit` drops non-scheduled rows through `scheduledVisitRows` before doing anything ([appointment-visit.ts:166](lib/booking/appointment-visit.ts:166)), and the file header records it as a deliberate narrowing from web. Web has now converged on the app's behaviour.
- **C6 summary gates.** The app's linked path does not go through `/api/venue/bookings/[id]/summary` — `LinkedBookingDetailSheet` renders from the linked-calendar feed and makes no detail fetch. `useBookingDetail`'s summary prefetch is own-venue only. Nothing to handle.
- **C7, C4, N2/N3/N4, C1/C2.** Server- and database-side; no client contract changes.

---

## 4. Watch items

### W1 · `bookings` column grants vs. the app's realtime channels — **the sharpest item in this report**

`20270112120000_bookings_column_grants.sql` revokes `authenticated`'s table-level SELECT on `bookings` and re-grants exactly nine columns: `id, venue_id, calendar_id, practitioner_id, booking_date, booking_time, booking_end_time, status, updated_at`.

The migration's own header is candid that **Realtime delivery under column grants is unverified**, and names a pre-production gate: open a linked calendar, have the owner change a booking, confirm the column still updates live. It also names the fallback if delivery does not survive (drop the subscription and poll).

**The app is a second consumer web did not audit.** Eight subscription sites ride `bookings` realtime as `authenticated`:

| Screen | File |
| --- | --- |
| Global provider | [VenueLiveSyncProvider.tsx:30](providers/VenueLiveSyncProvider.tsx:30) |
| Calendar | [index.tsx:653](app/(app)/(tabs)/index.tsx:653) |
| Bookings | [bookings.tsx:444](app/(app)/(tabs)/bookings.tsx:444) |
| Clients | [clients.tsx:389](app/(app)/(tabs)/clients.tsx:389) |
| Client detail | [client/[id].tsx:200](app/(app)/client/[id].tsx:200) |
| Classes | [classes.tsx:117](app/(app)/classes.tsx:117) |
| Events | [events.tsx:96](app/(app)/events.tsx:96) |
| Resources | [resources.tsx:93](app/(app)/resources.tsx:93) |

Two things say it should be fine: every one filters on `venue_id`, which is granted, and **no app consumer reads the payload** — `useVenueLiveSync` discards the event and calls `onRefresh()`, which refetches through a Bearer API route that runs as `service_role`. That is the same property web relies on.

**What makes it worth watching anyway is the app's failure mode, which is worse than web's.** `useVenueLiveSync` polls *only while the channel is not `SUBSCRIBED`* ([useVenueLiveSync.ts:116-140](lib/realtime/useVenueLiveSync.ts:116)). If the channel subscribes successfully and then never fires — the exact shape the migration warns about — the poll interval is cleared, `liveState` reads `'live'`, and every one of those eight screens goes **silently stale with a live indicator on**. There is no error, no reconnect, and nothing on screen to suggest the data is old.

Verify on staging before this reaches production: with the app open on Calendar, change a booking from another session and confirm the grid reacts. If it does not, the app needs the same A6 fallback web scoped — and it needs it more, because web at least has a browser tab a user will refresh.

### W2 · A class cart still reads as a multi-service visit in the app — and in web

C12 discriminates a cart from a visit on `class_instance_id`, but it changed **only** `isCascadingVisitGroup` in `group-booking-status-sync.ts`. Web's `appointment-visit.ts` was not touched in this range and still gates on `person_label` alone — and so does the app's port:

```ts
// lib/booking/appointment-visit.ts:122
export function isServiceVisit(rows: readonly VisitServiceRow[]): boolean {
  if (rows.length === 0) return false;
  return !rows.some((r) => Boolean(r.person_label?.trim()));
}
```

So the app is **at parity with web** here — this is not a gap against web, which is why it is a watch item and not R16-6. But the app's exposure is broader than web's, because `isServiceVisit` drives the merged draggable bar ([cluster-bookings.ts:121](lib/calendar/cluster-bookings.ts:121)), the detail header, and the "Services in this visit" editor. Two class sessions bought together and falling on the same day would merge into one bar offering to *re-lay the visit*.

The fix is cheap when someone wants it: `class_instance_id` is already on the wire from `/api/venue/bookings/list` (it is in both column projections), so it needs adding to `GroupVisitBookingRow` ([useGroupVisit.ts:13](lib/queries/useGroupVisit.ts:13)) and to the predicate. Worth raising with web rather than diverging unilaterally — the same inconsistency exists on both sides of the same repo.

### W3 · `claim_user_account` survives the revoke — verified, no action

The app calls two RPCs directly as `authenticated`: `claim_user_account`, at [callback.tsx:70](app/(auth)/callback.tsx:70) and [AuthProvider.tsx:218](providers/AuthProvider.tsx:218). Given C0 revoked client `EXECUTE` on 19 definer functions, this was the sign-in-breaking risk in the range. **It is allowlisted** (`scripts/check-client-executable-functions.mjs:79`), and the revoke migration records why: it derives its venue from `auth.uid()` rather than a caller-supplied parameter, so it cannot be abused cross-tenant. No other direct `.rpc()` call exists in the app.

---

## 5. What is left

1. **W1** — the only outstanding item, and it is a verification rather than a build. It decides whether the app needs a polling fallback, and it cannot be answered from here: it needs the app open against staging while another session changes a booking.
2. **W2** — raise with web; do not diverge alone.
3. **A device pass on R16-1.** The cross-column drag refusal and the Modify save are both gesture-level changes that no unit test can prove feel right.

## 6. What was built

| Item | Outcome |
| --- | --- |
| R16-1 | **Built** — [managed-calendars.ts](lib/calendar/managed-calendars.ts) + drag gate + picker narrowing + the five `practitioner_id` send sites |
| R16-2 | **Withdrawn** — the app already gates Refund on `deposit_status === 'Paid'` |
| R16-3 | **Built** — `isSlotTakenError` + `invalidateAvailabilityIfSlotTaken` on four write paths, plus the waitlist success-path invalidation |
| R16-4 | **Built** — both ids required on `LinkedBookingCreatePayload` |
| R16-5 | **Withdrawn** — the notes block hides when empty, and the note field is a composer, not a seeded editor |

Files touched: `lib/calendar/managed-calendars.ts` (new, + tests), `lib/api/client.ts`, `lib/queries/invalidateAvailability.ts` (+ tests), `lib/queries/useCreateBooking.ts`, `useCreateGroupBooking.ts`, `useCreateMultiServiceBooking.ts`, `useWaitlist.ts`, `useBookingMutations.ts`, `types/linked-venues.ts`, `components/bookings/ModifyBookingSheet.tsx` (+ tests), `app/(app)/(tabs)/index.tsx`.

**Two of five gaps did not survive contact with the code.** Both were read at one level of the UI and gated at another — `showDepositActions` is the card, not the button; the linked note field is a composer, not an editor. Worth remembering for R17: for a *display or gating* claim, follow the value to the component that actually renders it before writing it up as a gap.
