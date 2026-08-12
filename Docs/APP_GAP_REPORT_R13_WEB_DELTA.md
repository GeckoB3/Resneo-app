# App Gap Report R13 — Web delta audit (resneo `06d5491c..671f5051`)

**Date:** 2026-08-11
**Scope:** two commits — `cf17190b` (docs only) and `671f5051 "Staging (#132)"` (65 files, ~5,517 insertions). Previous audited point: `40558f01` (see [R12](APP_GAP_REPORT_R12_WEB_DELTA.md)); `06d5491c` was audited as part of R12's follow-through.
**Verdict:** five app items. One is a **contract break the web shipped knowingly** (the staff PATCH now 409s on unpaid promotions and the app has no way to answer it — the web plan names the app team as a required follow-up), one is a **live app bug of the same class the web just fixed on its own side** (Modify silently shrinks appointments to 30 minutes), and three are visibility/labelling parity.

**Status: all three actionable items BUILT 2026-08-11** (R13-4, then R13-1 + R13-3, then R13-2). App-only, no backend work. Full suite green: 158 files / 1,594 tests, `tsc --noEmit` clean, and `eslint .` back at its exact pre-existing baseline (226 problems / 15 errors, all in `scripts/*.mjs` and a provider this change never touched). R13-5 is a behavioural note with nothing to build.

Not verified on a device or in the browser preview: these paths need an authenticated venue API session, which the web preview cannot reach (CORS), and the Android emulator is unavailable here. The regression tests below stand in; an on-device smoke test of an unpaid `Pending` booking is still worth doing before release.

---

## 1. What the web shipped

Almost all of `671f5051` is one project: `Docs/deposit-payment-robustness-plan.md`, written after a live incident at CBL Beauty Lounge (8-9 Aug 2026) where a £20 deposit PaymentIntent failed at 00:49, the booking survived as `Pending` / deposit `Failed`, kept consuming the slot, and staff then promoted it to `Booked` with no payment check. The venue believed the booking was secured; Stripe showed it incomplete.

| Theme | What it is | App relevance |
| --- | --- | --- |
| **Unpaid-promotion guard** | `PATCH /api/venue/bookings/[id]` now returns `409 { code: 'DEPOSIT_UNPAID', … }` when a `Pending` capture unit that still owes its deposit or card save is promoted to `Booked`, or attendance-confirmed to `Confirmed` — unless the body carries `accept_unpaid: true`. Guards the status branch **and both attendance branches**, single and group. New `booking-owes-capture.ts`, `accept-unpaid-booking.ts`, `AcceptUnpaidBookingDialog.tsx` + `useAcceptUnpaidGuard`. | **R13-1 — contract break** |
| **Failed-deposit visibility** | `showDepositFailedPill()` + a red "Deposit failed" pill on three staff surfaces, status-gated to `Pending`/`Booked`/`Confirmed`. | **R13-2** |
| **Label changes** | `BOOKING_PRIMARY_ACTIONS.Pending` "Confirm" → **"Accept"** (D9); `BOOKING_REVERT_ACTIONS.Booked` ("Mark pending") deleted as dead code (D13). | **R13-3** (the revert: already absent in the app) |
| **Duration resolution** | New `resolveBookingCoreDurationMinutes()` returns `number \| null` and reads `booking_end_time` **then `estimated_end_time`**; the staff Modify form no longer defaults to 30 minutes, and adopts the catalogue duration when nothing resolves. The registry→row mapper stops dropping `estimated_end_time`. | **R13-4 — live app bug** |
| **Sweeps + self-heal** | `auto-cancel-bookings` widened to every online money booking (all sources, `deposit_status IN ('Pending','Failed')`, no-PI arm, 24h `requires_action` backstop, `succeeded` self-heal with comms), cadence `*/30` → **`*/10`**, abandonment threshold 20 min. Staff-sent payment links (comm log < 24h) exempt a row. Reconciliation gains a matching daily arm. | Server-only — **R13-5** (behavioural note) |
| **PI hygiene** | `cancelOpenDepositIntentForBookings` on staff cancel, guest cancel, `waive`, `record_cash`, and every sweep; `cancelAbandonedPaymentIntent` in every create-route cleanup catch; PI-linkage writes now error-checked. | Server-only, no app change |
| **Payment-link widening** | `GET /api/booking/pay` serves `Booked`/`Confirmed` while the deposit is owed (the accept-unpaid recovery path); friendly copy for a cancelled PI; `send_payment_link` gated to owed + live. | Free for the app — see R13-1 note |
| **Webhook** | `payment_intent.payment_failed` writes a `deposit_payment_failed` event and sends a `payment_failed` staff push (scoped to phone payment-link bookings). No status change. | Free — the app's push prefs already carry `payment_failed` |
| **Modify notify follow-up** | New `BookingModifyNotifyFollowUp.tsx`: notify / skip / undo panel with a 60s countdown after a staff modify that moved the start, using `defer_modification_guest_notification`. | **The web caught up to the app** — no gap, see §3 |
| Guest booking flows, `/pay`, `/pay/success`, `PaymentStep` 3DS return, `ClassMultiSessionCart` | Honest confirm outcomes (`confirmed` / `processing` / `cancelled` / `unconfirmed`) instead of unconditional success. | N/A — the app renders no guest booking flow |

---

## 2. Gaps

### R13-1 · The staff PATCH now 409s on unpaid promotions and the app cannot answer it — **High** — **BUILT**

`src/app/api/venue/bookings/[id]/route.ts` gained `gateUnpaidPromotion()`. It trips when the **capture unit** (the row, or every sibling sharing `group_booking_id`) has `deposit_status IN ('Pending','Failed')` **and** either `deposit_amount_pence > 0` or an open unsaved `booking_card_holds` row. The response:

```json
409 { "error": "The deposit for this booking has not been paid.",
      "code": "DEPOSIT_UNPAID",
      "deposit_status": "Failed",
      "deposit_amount_pence": 2000,
      "card_hold_fee_pence": 0 }
```

The only way past it is `accept_unpaid: true` in the same PATCH body. The app never sends that field, so **four** app paths are now hard-blocked on any unpaid `Pending` booking:

| # | App surface | Code | Sends |
| --- | --- | --- | --- |
| 1 | Booking detail primary action ("Confirm") | [booking-status-actions.ts:5](lib/booking/booking-status-actions.ts:5) → [useBookingMutations.ts:128](lib/queries/useBookingMutations.ts:128) | `{ status: 'Booked' }` |
| 2 | Bookings list swipe → Confirm | [BookingSwipeRow.tsx:61](components/bookings/BookingSwipeRow.tsx:61) | `{ status: 'Booked' }` |
| 3 | Calendar block tray → Confirm | [AppointmentBlock.tsx:222](components/calendar/AppointmentBlock.tsx:222) → [useCalendarQuickActions.ts:35](lib/queries/useCalendarQuickActions.ts:35) | `{ status: 'Booked' }` |
| 4 | Booking detail attendance toggle | [BookingDetailContent.tsx:363](components/bookings/BookingDetailContent.tsx:363) → [useBookingMutations.ts:531](lib/queries/useBookingMutations.ts:531) | `{ staff_attendance_confirmed: true }` |

The web plan anticipated this (**D10**): *"An out-of-date ResNeo app will show the error text instead of the dialog. Acceptable friction … but the app team must schedule the matching dialog."*

**The floor is honoured.** `getApiErrorMessage` returns `body.error` verbatim for a 409 ([client.ts:93](lib/api/client.ts:93)), and every one of the four paths surfaces it — so staff see "The deposit for this booking has not been paid." rather than a silent failure, and `ApiError.body` already carries the structured payload ([client.ts:115](lib/api/client.ts:115)). Path 1 and 2 also roll back their optimistic status flip. Nothing is corrupted.

**But there is no "accept anyway" in the app at all.** The only in-app workaround is to open the deposit sheet and **Waive** the deposit, which is a different business decision — it forgives the money, where accept-unpaid keeps it collectable (**D3**). Staff who want to accept and chase the deposit later must use the web dashboard.

**Built as:**
- [lib/booking/accept-unpaid.ts](lib/booking/accept-unpaid.ts) — pure: `depositUnpaid409()` narrows the error (409 **and** `code === 'DEPOSIT_UNPAID'`, nothing else), and `acceptUnpaidBodyCopy()` ports the web's three copy branches (named amount + "the last payment attempt failed" / "not paid yet" / card-save wording for a hold fee). 9 tests, including that an over-eager intercept can't swallow an unrelated 409.
- [components/bookings/AcceptUnpaidSheet.tsx](components/bookings/AcceptUnpaidSheet.tsx) — the sheet plus `useAcceptUnpaidGuard()`, returning `{ intercept, sheet }`. **Send payment link** posts the deposit action and leaves the sheet open (sending a link is not a decision about the promotion); **Accept without payment** closes first, then replays; **Go back** does nothing. 7 component tests.
- `accept_unpaid` threaded through all three mutations. `useUpdateBookingStatus` takes a `BookingStatusChange` union so every existing `.mutate('Booked')` caller is untouched and only the replay passes the object form. New `useSendDepositPaymentLinkById()` takes the booking id in its input, since the guard's target is dynamic.
- Wired into all four paths, plus the full-screen `/booking/[id]` route.

**Two deviations from the plan above, both deliberate:**

*The list guard is owned by the list, not the row.* `useAcceptUnpaidGuard` renders a `Sheet`, and `Sheet` is an RN `Modal` — one per `BookingSwipeRow` would mean a Modal and a mutation per booking on screen. `BookingSwipeRow` now takes an `onUnpaidPromotion` prop and [bookings.tsx](app/(app)/(tabs)/bookings.tsx) owns the single guard. Omitting the prop restores the old toast, so the row stays usable anywhere.

*It is a nested Sheet, not a mode step.* The [[ios-no-stacked-modals]] rule is about opening a second sheet **mid-presentation** — the LinkRequestSheet case. Here the sheet opens on a network 409, long after presentation settles, and [Sheet.tsx:128](components/ui/Sheet.tsx:128) documents sheet-within-sheet as an established pattern in this app (booking detail → Modify → Deposit all already do it). The one thing that matters is *where* it is mounted: inside `BookingDetailSheet`'s own `<Sheet>`, so it is a Modal nested in the presented Modal's tree, not a sibling presenting from the root.

Recovery needed no app change: the server now serves payment links for `Booked`/`Confirmed` rows that still owe, and `DepositSheet` already gates on the **deposit** status, not the booking status ([DepositSheet.tsx:336](components/bookings/DepositSheet.tsx:336)).

OTA-only; no backend work.

### R13-2 · No "Deposit failed" pill anywhere in the app — **Medium** — **BUILT**

The incident's second layer was that a failed deposit was invisible. Web added [`showDepositFailedPill`](_reference/Resneo/src/lib/booking/booking-staff-indicators.ts:28) (`deposit_status === 'Failed'`, deliberately **no amount gate** so `payment_with_setup` hold rows with a NULL amount still show it) and renders a red pill in `AppointmentDetailSheet`, `AppointmentRegistryCard` and `BookingDetailContent`, each gated at the render site to `['Pending','Booked','Confirmed']`.

The app's port of that module ([booking-staff-indicators.ts](lib/booking/booking-staff-indicators.ts)) has `showDepositPendingPill` but no failed variant, and the two render sites only handle `'Pending'`:
- [BookingRow.tsx:94](components/bookings/BookingRow.tsx:94) / [:188](components/bookings/BookingRow.tsx:188) — list row pill.
- [BookingDetailContent.tsx:853-865](components/bookings/BookingDetailContent.tsx:853) — hero badge, `booking.deposit_status === 'Pending'`.

So in the app a booking whose deposit **failed** looks identical to one with no deposit at all: no pill on the list, no badge on the detail. The deposit status is only legible if staff scroll to the deposit row or open the deposit sheet.

**Built as:** `showDepositFailedPill` (no amount gate, matching web) plus a `depositPillAppliesToStatus` helper holding the render-site status gate in one place instead of repeating the literal at each call. Rendered as a red `Deposit failed` pill on the list row — **outranking** "Deposit due", since a bounced payment is the louder fact — and as a danger `Badge` in the detail hero. On the detail it shows *alongside* a card-hold pill rather than instead of it: a `Failed` hold row is exactly the case staff must not miss. 7 new indicator tests + 3 row-render tests (including the card-hold row with a NULL amount, and a cancelled row keeping its stale columns but losing the pill).

### R13-3 · Pending primary action still says "Confirm" — **Low** — **BUILT**

`BOOKING_PRIMARY_ACTIONS.Pending` is now `{ label: 'Accept', target: 'Booked' }` — deliberately (**D9**), because the attendance action on a `Booked` booking is *also* called Confirm, and staff could not tell that the Pending one accepts a booking whose deposit may be unpaid. Three app sites still say Confirm: [booking-status-actions.ts:5](lib/booking/booking-status-actions.ts:5), [BookingSwipeRow.tsx:64](components/bookings/BookingSwipeRow.tsx:64), [AppointmentBlock.tsx:222](components/calendar/AppointmentBlock.tsx:222). Worth doing **with R13-1**, not before: the rename is what makes the new dialog make sense.

**Built as:** all three renamed, and the swipe toast now says "Booking accepted." Four existing test expectations moved with it (`booking-status-actions`, `AppointmentBlock` tray, `BookingDetailSheet` action bar).

The companion change (deleting the dead `BOOKING_REVERT_ACTIONS.Booked` "Mark pending") needed nothing — the app already omits it, with a comment at [booking-status-actions.ts:13](lib/booking/booking-status-actions.ts:13). The app was right first.

### R13-4 · Modify silently shrinks appointments that carry no `booking_end_time` — **High, live app bug** — **BUILT**

This is the bug the web fixed in `booking-core-duration.ts`, and the app has it too.

`/api/booking/create` persists `booking_end_time` **only when the client sends one** ([create/route.ts:1710](_reference/Resneo/src/app/api/booking/create/route.ts:1710)), and among guest flows only `ResourceBookingFlow` / `ResourceSlotBookingForm` do. `estimated_end_time` is always written ([:1701](_reference/Resneo/src/app/api/booking/create/route.ts:1701)). The web states the consequence outright in [registry-to-expanded-booking-row.ts:25](_reference/Resneo/src/lib/booking/registry-to-expanded-booking-row.ts:25): `booking_end_time` is NULL for *every guest-created appointment*.

The app **never reads `estimated_end_time`** — grepped, zero occurrences outside `_reference`; [types/booking-detail.ts:136](types/booking-detail.ts:136) declares `booking_end_time` only. The chain:

1. [BookingDetailContent.tsx:445-448](components/bookings/BookingDetailContent.tsx:445) derives `durationMinutes` from `booking_end_time` alone → `null` for a guest-created appointment.
2. [ModifyBookingSheet.tsx:194](components/bookings/ModifyBookingSheet.tsx:194) seeds `setDuration(target.durationMinutes ?? 30)` (also `:152`, `:389`, `:453`).
3. Save PATCHes `duration_minutes: 30`.

A 90-minute guest-booked colour appointment opened in Modify and saved — even to change nothing but the practitioner — **is rewritten to 30 minutes**, releasing an hour of the practitioner's day into bookable availability. The web's own note adds that a service with processing time is rejected outright ("Processing blocks must lie within the service duration") because 30 minutes cannot hold the stored blocks.

Two lesser symptoms of the same root: the duration chip at [BookingDetailContent.tsx:830](components/bookings/BookingDetailContent.tsx:830) renders nothing, and `formatBookingTimeRange` shows a bare start time with no end, on exactly those bookings.

**Not visible on the calendar** — `/api/venue/calendar-grid` computes `endTime` server-side, so bars are correct. This is confined to the detail/modify path, which is why it has survived.

**Built as:**
- [lib/booking/booking-core-duration.ts](lib/booking/booking-core-duration.ts) — `resolveBookingCoreDurationMinutes()` returning `number | null`, reading `booking_end_time` then `estimated_end_time` (as the venue-local wall clock encoded as UTC, so the device's timezone is irrelevant). 10 tests.
- `estimated_end_time` added to `BookingDetail`. It was already on the wire — the GET spreads the whole row — the app simply never read it.
- `BookingDetailContent` now resolves the duration through the helper, and its time-range label derives an end from the resolved duration when the row has no `booking_end_time`, so those bookings stop showing a bare start time.
- `ModifyBookingSheet`'s `duration` is `number | null` with no default. When it opens null, an effect adopts the catalogue duration (the chosen variant's when there is one) as **both** the value and a new `baselineDuration`, so adopting is not mistaken for a staff edit and does not arm Save on an untouched form. Availability, month-availability and the dry-run validation all wait for a resolved duration rather than querying for the catalogue default. Undo restores `baselineDuration`, never 30.

**Two deliberate divergences from the web helper.** Its floor is `Math.max(15, …)`; the app's is **5**, because the app's API floor is 5 ([[appointment-min-duration-5]]) and clamping to 15 would misreport a real 5-minute appointment. And where web wraps on `end <= start` (returning 1440 for a row whose end equals its start), the app returns null: an equal end is a broken row, not a day-long booking, and the old code rendered nothing there.

4 regression tests in `ModifyBookingSheet.test.tsx` pin the `durationMinutes: null` case: the catalogue duration is adopted, Save stays disabled, the save PATCHes 45 rather than 30, and Undo restores 45.

### R13-5 · Sweep cadence changed under the app — **No build, behavioural note**

`vercel.json` moved `auto-cancel-bookings` from `*/30` to `*/10`, and the online abandonment threshold is 20 minutes, so an unpaid online money booking is now **cancelled 20-30 minutes after creation** (was: never, for a `Failed` row — one failed attempt used to exempt a booking from every sweep, because the webhook rewrote the very column the sweeps filtered on). Widened from class-cart rows to every online source, every model.

App consequence: `Pending` deposit bookings will start disappearing from the app's lists and calendar on their own, within half an hour. The app's cache invalidation and 60s polling handle this without change, and the staff push rides the existing `payment_failed` event, which the app's notification-preferences screen already exposes. Flagged only so an auto-cancel is not mistaken for an app defect in the field.

Exemption worth knowing at the desk: staff sending a payment link (a `deposit_request_*` / `card_hold_request_*` comm log inside 24h) shields the row from the 20-minute sweep and moves it to the 24-hour deadline instead. So the app's "Send payment link" is also the way to buy a booking more time.

---

## 3. Checked and clear

- **Modify notify follow-up.** The web's new `BookingModifyNotifyFollowUp` (notify / skip / undo, 60s countdown, revert carrying `skip_booking_modification_guest_notification`) is a port **of the app's** behaviour — its own comment cites the calendar drag's deferred-notify window. The app already defers on a schedule change ([ModifyBookingSheet.tsx:555](components/bookings/ModifyBookingSheet.tsx:555)) and owns the undo PATCH ([:620](components/bookings/ModifyBookingSheet.tsx:620)). No gap.
- **New `events` rows** (`booking_status_changed` with the new `{from, to, staff_id}` payload, `booking_accepted_without_payment`, `deposit_payment_failed`). The app's timeline filter keys `booking_status_changed` on `payload.new_status === 'Confirmed'` ([booking-timeline.ts:83](lib/booking/booking-timeline.ts:83)) and hides unknown types — **identical to the web's own filter**, which was not updated. Both hide them. Parity holds.
- **`send_payment_link` gating.** The server now 409s `invalid_state` when the deposit is settled or the booking is terminal. The app's `DepositSheet` hides the action for `Paid`/`Refunded` and otherwise surfaces the server message. No change needed.
- **PI cancellation on waive / record cash / cancel.** Entirely server-side; the app's existing deposit actions inherit it.
- **`formatBookingModificationNotifyToast` copy fix** (em-dash removed per the web's copy rule). The app does not share that helper and writes its own toast copy.
- **Guest-facing honesty work** (`/pay`, `/pay/success`, `PaymentStep` 3DS `return_url`, the five booking flows, `client-confirm-payment.ts`). The app renders no guest booking flow and no payment page.

---

## 4. Build order (as shipped)

| Order | Item | Why |
| --- | --- | --- |
| 1 | **R13-4** (duration) | Live data loss on a common path, independent of everything else, OTA. |
| 2 | **R13-1** + **R13-3** (accept-unpaid guard + "Accept" label) | Shipped together; the rename is what disambiguates the dialog. Largest piece. |
| 3 | **R13-2** (failed pill) | Small, and it is what makes staff notice a booking needs R13-1's sheet in the first place. |

All three are app-only. No backend work is outstanding from this delta.

## 5. Files

| New | Changed |
| --- | --- |
| `lib/booking/booking-core-duration.ts` (+ test) | `types/booking-detail.ts` |
| `lib/booking/accept-unpaid.ts` (+ test) | `components/bookings/BookingDetailContent.tsx` |
| `components/bookings/AcceptUnpaidSheet.tsx` (+ test) | `components/bookings/BookingDetailSheet.tsx` |
| | `components/bookings/ModifyBookingSheet.tsx` |
| | `components/bookings/BookingSwipeRow.tsx`, `BookingRow.tsx` |
| | `components/calendar/AppointmentBlock.tsx` |
| | `lib/booking/booking-status-actions.ts`, `booking-staff-indicators.ts` |
| | `lib/queries/useBookingMutations.ts`, `useCalendarQuickActions.ts` |
| | `app/(app)/(tabs)/bookings.tsx`, `app/(app)/(tabs)/index.tsx`, `app/(app)/booking/[id].tsx` |
