# App Gap Report R15 — Web delta audit (resneo `4595623d..5ae4eadf`)

**Date:** 2026-08-12
**Scope:** 15 commits on **`staging`** (26 files, ~5,774 insertions / 177 deletions). Previous audited point: `4595623d` (see [R14](APP_GAP_REPORT_R14_WEB_DELTA.md)).
**Caveat:** still **unreleased**. `origin/main` remains at `671f5051 "Staging (#132)"`; `origin/staging` is now 27 commits ahead of it. Everything below is staging-only. The reference clone was refreshed to `staging` for this audit at the user's request — see [Reference repo](../_reference/Resneo).
**Verdict:** two workstreams. One is server-side and arrives free; the other, **multi-service visits**, is the largest app-facing delta since R7 — and it is not only a missing feature. The app can currently **tear a visit apart**, by exactly the mechanism that produced web's reference case.

**Status: R15-5, R15-3 and R15-2 BUILT 2026-08-12.** Full suite green: 162 files / 1,669 tests (+1 file, +35 tests), `tsc --noEmit` clean, `eslint .` at its exact pre-existing error baseline (15 errors, all in `scripts/`; the 13 new warnings are the `require()`-in-a-jest-mock-factory pattern the suite already uses throughout). R15-1 and R15-4 remain open. See §5 for what was built and §6 for the review pass that followed.

> **The R14 shipping gate still stands and now covers R15 too.** Nothing here should ship ahead of the web staging release. The two visit endpoints do not exist on production web, so an app that calls them gets a 404 against `resneo.com` today. The release is to be synchronised with the staging→main merge.

---

## 1. What the web shipped

| Theme | What it is | App relevance |
| --- | --- | --- |
| **Visit resolver** (`8aebabde`) | `src/lib/booking/appointment-visit.ts`: N rows sharing a `group_booking_id` resolved into one visit — party vs service visit, ordered services, span, total, and the re-sequencing arithmetic (`resequenceVisit`, `distributeVisitDuration`, `minimumVisitMinutes`). Pure, 260 lines, unit-tested. | Ports directly — **R15-1**, **R15-2**, **R15-3** |
| **Calendar: a visit moves and resizes as one booking** (`df0aa8c7`, `281d1d8d`, `a30006e8`, `c622eb02`, `5ae4eadf`) | Group bars gain `canDrag` and a resize handle. Resize cascades off the tail then backwards; move shifts every row; every service is dry-run before any is written; undo restores the whole visit; the notify pill is armed once; the drag preview shows the visit's new length. | **R15-1** |
| **Detail panel reports the visit** (`cc9152a7`, `6734f658`) | Header span comes from `resolveAppointmentVisit`, not the clicked row, plus new `Duration` (wall-clock) and `Services` meta lines. | **R15-3** |
| **Cascade writes** (`aedd907c`) | `PATCH /api/venue/visits/[groupBookingId]/schedule` — move, re-span, or both, as one write. Plans → checks → writes, rolls back rows already written, `dry_run` answers in the save's shape, one guest notification for the visit. `excludeBookingIds` added to `validateAppointmentModificationInterval` so a visit stops conflicting with itself. | Backend the app can use — **R15-1**, **R15-2** |
| **Modify form opens on the visit** (`8c88939e`) | One start, one calendar, one wall-clock duration; per-service duration/service/variant editing withdrawn for visits; live check and save both go through the visit endpoint; a stale-span visit is re-laid on open. | **R15-2** |
| **Service list editing** (`9c0cec50`) | `PATCH /api/venue/visits/[groupBookingId]/services` — declarative list, `known_booking_ids` guard (412), removal cancels rather than deletes, money-bearing rows refused, a swap pins the resolved price. | **R15-4** |
| **Disabled booking models are inert** (`7932a8cd`, `16aec4f0`, + two docs commits) | `blocked-range-models.ts`; both the day engine and the month engine stop folding resource/class/event windows in when the model is off; resource ranges gain `kind: 'resource'` and a real reason string; the settings refusal now names the model, the count and the next booking. | Server-side — **free**, see §3, plus **R15-5** |

---

## 2. Gaps

### R15-1 · A multi-service visit cannot be moved or resized from the app at all — **High**

Both day grids refuse the gesture on a merged bar, with a comment pointing at web:

```ts
// A merged visit is never dragged or resized: the gesture moves ONE
// booking, which would tear the visit apart. `draggable` is the
// single switch for both (see DraggableAppointmentBlock), and the
// web disables the same thing on its clusters.
draggable={!item.cluster.isMultiSegment && MOVABLE_STATUSES.has(item.cluster.lead.status)}
```

[CalendarDayGrid.tsx:755](components/calendar/CalendarDayGrid.tsx:755), [AllCalendarsDayGrid.tsx:962](components/calendar/AllCalendarsDayGrid.tsx:962), and the rule is stated again on the cluster type ([cluster-bookings.ts:60](lib/calendar/cluster-bookings.ts:60)). The reasoning was right and web has now removed its half: web's clusters drag and resize, and the tearing is prevented by planning every service before writing any, not by withholding the gesture.

WeekGrid is tap-only and needs nothing.

**The app's port is cheaper than web's own.** Web's calendar still runs its own dry run plus per-row PATCHes (`patchVisitMove` / `patchVisitResize`), which is safe only because `281d1d8d` bolted an all-or-nothing check onto it. The app can skip that generation entirely and send one `PATCH /api/venue/visits/{gid}/schedule` — which plans, checks, writes and rolls back server-side, and fires one guest notification. It is Bearer-capable (`createVenueRouteClient` reads `Authorization` and falls back to cookies), so no backend work is outstanding.

What the app needs: the cluster already carries `bookings` and `ids`, so the group id is in hand at the bar; `commitDrag` gains a visit branch that sends `booking_time` (+ `booking_date`, `practitioner_id` on a column move) or `total_duration_minutes`, and the existing notify/undo plumbing keys on the visit's first service.

**Do not copy one thing:** web's `patchVisitResize` records no undo at all, so a visit resize shows no pill and leaves the toolbar Undo armed on whatever came before it. Web's own plan flags this as open. The app's undo is a `moveNotice` per commit, so it gets this right for free — provided the visit branch sets it like the single-booking branch does.

### R15-2 · Modify and Reschedule edit one service of a visit and leave the rest behind — **High**

This is the one that is not merely missing.

[openModify](components/bookings/BookingDetailContent.tsx:527) builds its target from `booking.id`, `booking.booking_time` and `durationMinutes` — one row. `RescheduleSheet` takes a single booking the same way. Neither knows about `group_booking_id`, even though the detail has it (it feeds `GroupVisitCards` twelve hundred lines further down).

On the calendar the merged bar's tap target is `cluster.lead.id` — always the **earliest** segment. So on a three-service visit:

- **Shorten it in Modify** and services 2 and 3 stay where they are. Dead time opens between 1 and 2.
- **Move it in Reschedule** and service 1 leaves while 2 and 3 stay put. The visit is now in two places.

That first case is precisely how web's reference visit was created — *"the 11:30 to 11:45 hole is not a buffer; it was created by using the Modify form to shorten Olaplex, which did not re-sequence the services after it"* — and web has closed it by withdrawing per-service editing on a visit altogether. The app still offers it, on every entry point into a visit's detail.

**Fix:** lift the visit query the detail already runs (`useGroupVisitBookings`) above the hero, and when it resolves more than one row, pass the visit into the modify path: one wall-clock duration control, per-service duration/service/variant controls withdrawn, dry run and save both against `/api/venue/visits/{gid}/schedule`. Reschedule gets the same branch for `booking_date` / `booking_time` / `practitioner_id`. `resolveAppointmentVisit` ports as-is (its only import is the shared duration floor the app already has as `MIN_CORE_DURATION_MINUTES`).

Web also re-lays the visit on open when the rows' own span is not the visit's span, and says so in words before saving (*"This visit has 15 minutes of dead time in it. Saving closes it…"*). Worth taking: it is what repairs visits the app has already damaged.

### R15-3 · The detail header reports one service's time and length for the whole visit — **Medium**

[BookingDetailContent.tsx:470](components/bookings/BookingDetailContent.tsx:470) resolves `durationMinutes` from the single row, and the hero's time range and duration chip both follow it. Because the calendar tap target is the lead segment, a 10:00–12:15 visit opens showing **10:00–11:00 · 1h**. The bar above it is correct — `clusterCalendarBookings` takes the maximum end — so the calendar and the panel disagree about the same appointment.

Web's fix is small and lands in the same place: resolve the visit, prefer its `startHm`/`endHm`, and add two meta lines (`Duration`, wall-clock; `Services`, the list).

**One number to get right while porting.** [GroupVisitCards.tsx:106](components/bookings/GroupVisitCards.tsx:106) computes its `total` as the **sum of the segments**. Web's header duration is deliberately the **wall-clock span**, gaps included, *"matching the single control the visit is edited by"*. Those differ whenever a buffer or processing gap sits between two services, so showing both unlabelled would put two different totals on one screen. Take the span for the hero and either leave the card's sum labelled as services-only or drop it.

### R15-4 · No surface for changing what a visit is made of — **Low (defer)**

Web's `9c0cec50` lets staff add, remove, swap and reorder a visit's services in one declarative write. The app has no equivalent and never has; this is a new capability rather than a regression, and it is roughly as large as R15-1 to R15-3 combined.

Worth recording now because the contract has sharp edges that will not be obvious later: `known_booking_ids` is **required** and a stale list is refused with 412 (omission is how a service is removed, so a form that never saw a fourth service would otherwise cancel it); removal **cancels** the row rather than deleting it, and a row with money against it is refused outright; a swap writes `booking_total_price_pence` at the pre-swap resolved price, and always takes the new service's catalogue duration — so swapping out and back does **not** restore a hand-set duration.

Recommend deferring until R15-1 to R15-3 have been on a device.

### R15-5 · A dead error branch would discard the better refusal the server now sends — **Low**

[booking-settings.tsx:860](app/(app)/manage/booking-settings.tsx:860) special-cases the booking-model refusal:

```ts
if (e instanceof ApiError && `${(e.body as { error?: string } | null)?.error ?? ''}`.includes('FUTURE_BOOKINGS')) {
  setModelsError("A booking type with upcoming bookings can't be switched off. …");
}
```

`PATCH /api/venue` has never put the code in `error` — it returns `{ error: guardErr.message }`, prose, and keeps `BOOKING_MODEL_HAS_FUTURE_BOOKINGS` on the thrown error object server-side. So the branch has always been dead, and the `else` (which surfaces `ApiError.message`, itself `body.error` via `getApiErrorMessage`) has been doing the work.

That accident is now a benefit: web's guard tallies every match before reporting, so the app already shows *"Appointments cannot be turned off yet. You have 12 upcoming bookings of that type, the next on Thu 13 Aug 2026 at 9:30am. Cancel or complete them first, then try again."* **The fix is to delete the dead branch, not to repair it** — repairing it would substitute a vaguer message for a specific one. Two lines, no behaviour change today, and it removes a trap for whoever next reads it and "fixes" the match.

---

## 3. Checked and clear

- **Disabled booking models blocking availability** (`7932a8cd`) is entirely server-side: the engine and the month engine now gate resource/class/event windows on the venue's active models. The app calls those endpoints and renders what they return. **Behavioural heads-up, nothing to build:** a venue with a model switched off will suddenly see *more* availability in the app's pickers (web measured 21 slots → 34 on the reported case). Same posture as R14's minimum-notice note — worth knowing before it is reported as an app defect.
- **Resource block reasons.** Resource ranges were the only untagged block source, so an enabled resource window reported nothing but "Blocked time". They now say "Overlaps a resource booking". The app displays server reasons verbatim — the only mention of the old string in the app is a comment ([useBookingMutations.ts:313](lib/queries/useBookingMutations.ts:313)) explaining a false trigger, not a match. Free improvement.
- **`excludeBookingIds` on `validateAppointmentModificationInterval`.** Additive, defaulted, server-side. It is what makes a visit stop conflicting with itself without switching the overlap gate off; the app's existing single-booking validate calls are unaffected.
- **Calendar grid columns.** Web's plan records that its grid was already correct (resource calendars merged into their host column, resources fetched behind the model gate). The app's columns come from the server roster feed, so nothing changes here either.
- **The bookings list.** `collapseMultiServiceVisits` keeps the earliest-start segment as the representative, and [BookingRow.tsx:150](components/bookings/BookingRow.tsx:150) renders only its **start** time — no end, no duration. So the list does not carry R15-3's wrong-span defect. Web did not touch its list in this delta either.
- **Party bookings.** `resolveAppointmentVisit` returns null when any row has a `person_label`, which is the app's `isMultiServiceVisitGroup` rule. Note the deliberate app divergence recorded in [cluster-bookings.ts:9](lib/calendar/cluster-bookings.ts:9): the **calendar** clusters on `group_booking_id` alone and so merges a party too. If R15-1 gives merged bars a drag handle, the visit branch must gate on the resolver (which refuses a party) and not on `isMultiSegment` (which does not) — otherwise dragging a party bar would re-sequence four people's bookings back-to-back.

---

## 4. Suggested order

| Order | Item | Why |
| --- | --- | --- |
| 1 | **R15-5** (delete the dead branch) | Two lines, and it locks in a better message the app already receives. |
| 2 | **R15-3** (detail reports the visit) | Port `resolveAppointmentVisit` + lift the visit query. Smallest of the visit work, and it is the one that makes the defect visible to staff. |
| 3 | **R15-2** (modify/reschedule a visit as a visit) | Stops the app creating the damage. Highest severity; depends on the resolver from step 2. |
| 4 | **R15-1** (drag and resize a merged bar) | Same endpoint as step 3, plus the party gate in §3. |
| 5 | **R15-4** (service list editing) | Defer past a device pass. |

No backend work is outstanding — both visit endpoints are Bearer-capable and complete. But they exist only on `staging`, so this whole report is gated on the web release, and steps 2 to 4 must not ship before it.

---

## 5. What was built (R15-5, R15-3, R15-2)

**R15-5** — the dead branch is gone from [booking-settings.tsx](app/(app)/manage/booking-settings.tsx), replaced by a comment explaining why the fallback is the better path and asking the next reader not to "fix" the match back in.

**R15-3** — new pure [lib/booking/appointment-visit.ts](lib/booking/appointment-visit.ts) (14 tests), ported from web with three deliberate narrowings, each of which is a test:

- **Cancelled and no-show rows are dropped before the span is measured.** Web resolves whatever its caller passes and filters separately in its endpoints, so its header can span a service that is not happening. The app's rows come straight off `/api/venue/bookings/list`, which returns them all.
- **Fewer than two scheduled services is not a visit.** A lone service in a group is an ordinary booking, and every caller wants the single-row path for it — the rule `collapseMultiServiceVisits` and `GroupVisitCards` already use.
- **`booking_time` is nullable** on the app's row type, and a row that cannot be placed makes the whole set decline rather than being dropped or guessed at.

The re-laying arithmetic (`resequenceVisit`, `distributeVisitDuration`) was **not** ported: the app sends a wall-clock total and the server distributes it, so a client copy would be a second opinion with no reader.

[BookingDetailContent](components/bookings/BookingDetailContent.tsx) now resolves the visit and prefers its span, its total and its service list for the hero. [GroupVisitCards](components/bookings/GroupVisitCards.tsx) switched its "total" from the sum of the services to the same wall-clock span, so the screen carries one number rather than two that differ by whatever gaps are inside the visit.

**R15-2** — new [lib/queries/useVisitMutations.ts](lib/queries/useVisitMutations.ts) wrapping `PATCH /api/venue/visits/{id}/schedule`, and both editing sheets branch on a `visit` field added to their targets:

- **[ModifyBookingSheet](components/bookings/ModifyBookingSheet.tsx)** (13 new tests, 46 in the suite): opens on the visit, withdraws the Service / Variant / Add-ons controls, and offers one wall-clock length. It asks the endpoint for the visit's real shape on open, adopts the planned total as both value and baseline (so the correction does not read as a staff edit), and says so in words when the visit carries dead time — *"This visit has 15 minutes of dead time in it. Saving closes it…"* — with Save armed on an otherwise untouched form, because that re-lay is the repair for visits the app has already damaged. The live check, the save and the undo all go through the one endpoint.
- **[RescheduleSheet](components/calendar/RescheduleSheet.tsx)** (new file, 8 tests — it had none): a visit moves whole, with the services named on the sheet so it is obvious what is about to move.

Two things the app does NOT copy from web:

- **No slot list, and no green month markers, for a visit.** Both availability endpoints exclude ONE booking, so a visit's other services count as occupied against themselves: the list would hide every slot the visit currently overlaps, including where it already sits. Visit mode uses the OS time picker and the endpoint's own dry run, which excludes every one of the visit's rows.
- **No compliance override on a visit.** The visit endpoint takes no `override_compliance` flag, so a block is reported as a plain refusal rather than offering an admin a button that cannot be honoured. The single-booking path keeps its override.

## 6. Review pass

**One real defect, found after the build was green and fixed.** `total_duration_minutes` is an **instruction**, not a description — the server lays the services out to fill it. Both sheets were sending the span the form happened to be holding on every save, so moving a visit that contained dead time would have silently lengthened its **last service** by that dead time. Worse on the failure path: if the opening plan never arrived, the form is still showing the rows' raw span, and that raw span would have been asserted as the target length. Both now send it only on a deliberate edit (`durationEdited`), on the dry run and the save alike, so a move stays a move. Four tests pin it.

**Two limits left in place, documented rather than papered over:**

- **Undo after a length change restores the total, not necessarily the split.** The server redistributes by its own rule (growth goes on the tail), so a shrink that cascaded back into an earlier service returns with those minutes on the last one. Inherent to editing a visit by one wall-clock number; the slot and the total are exact, and the common case — a move that never touched the lengths — sends no total at all and restores the services exactly.
- **The R15-3 wiring in `BookingDetailContent` has no render test.** The rules underneath it are fully covered by the resolver's 14 tests; the wiring itself is three `visit ? … : …` expressions, and a render harness for that component needs roughly twenty hook and child mocks. Judged not worth the brittleness — flagged so the gap is known rather than assumed covered. One trap inside it was caught by eye and is commented: **Rebook** seeds a new booking from one service, so it keeps the row's own duration, not the visit's span.

**Not verified in the browser preview**: the changed surfaces are the booking detail panel and its two sheets, which need the authed API the web preview cannot reach (see [[dev-environment]]). They want a device pass alongside R15-1.
