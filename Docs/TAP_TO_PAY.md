# Tap to Pay (mobile) — pointer + mobile essentials

> **Canonical design doc:** lives in the **backend repo** at `resneo/Docs/TAP_TO_PAY_DESIGN_AND_IMPLEMENTATION.md` (mirrored read-only at `_reference/Resneo/Docs/…`).
> That document covers the whole feature end-to-end (data model, backend endpoints, webhook, security, rollout, tests). This file is the **mobile-side summary** so resneo-app work is self-sufficient. If the two ever disagree, the canonical doc wins.
>
> **Last reconciled:** 2026-07-24 against the canonical doc at web `staging` @ `3c2616ce` (its §16 sixth review). The per-pass mobile review findings below are **only** in this file — the canonical doc compresses them into three spec corrections. Don't lose them in a future sync.

## Status (2026-07-24)

**Backend: implemented** (ledger, three endpoints, webhook branches, receipt, GET/bootstrap extensions, **visit-scoped settlement**, and a **venue toggle in the web dashboard**). On the web repo's `staging` branch, not yet on `main`.
**Mobile: implemented** — see "What shipped" below. Both hardware paths (Tap to Pay + Bluetooth reader), on `main` through `cad0bcc`. SDK pinned at **`@stripe/stripe-terminal-react-native@0.0.1-beta.31`**.

**Not yet runnable end to end.** Still required: an EAS dev build carrying the native Terminal module, and a pilot venue with `in_person_payments_enabled = true` plus the Stripe card-present capability. Until then the surface is inert by design (the native module is absent, so the app renders exactly as before).

**The Apple entitlement is a Tap to Pay requirement only.** `com.apple.developer.proximity-reader.payment.acceptance` gates Apple's ProximityReader framework — the phone's own NFC acting as the reader. A **Bluetooth reader (BBPOS WisePad 3) needs no Apple entitlement and no approval**: the card is read by separately certified hardware and iOS sees only a BLE accessory. So a reader-only pilot can ship without waiting on Apple (§7A.4, §7A.11). Shipping Bluetooth-only would mean dropping the `ios.entitlements` block and `tapToPayCheck` from `app.json` first — signing with an entitlement the Apple account has not been granted fails provisioning.

Device eligibility splits the same way: **Tap to Pay** needs iPhone XS+/iOS 16.4+ or a certified NFC Android 11+ device; the **Bluetooth path works on any Bluetooth-capable device**, which is much wider.

### What shipped (mobile)
| File | Role |
|---|---|
| `lib/payments/terminal-sdk.ts` | Lazy, crash-proof SDK loader. **Never import the SDK directly** — it executes native work at import time and throws without the native module. |
| `lib/payments/connection-token.ts` | `POST /api/payments/connection-token` + per-venue-scope Terminal Location cache. |
| `lib/payments/terminal.ts` | `useTapToPayReader` — initialise, permissions, discover, connect. |
| `lib/payments/bluetoothReader.ts` | `useBluetoothReader` — scan, connect, firmware-update + battery + reconnect states (§7A). |
| `lib/payments/payment-display.ts` | The §3.4 button gate + neutral state labels (pure, unit-tested). |
| `lib/payments/attempt-id.ts` | RFC 4122 v4 `attempt_id` (the route rejects anything else). |
| `lib/payments/last-method.ts` | Remembers the last-used payment method (§7A.6). |
| `lib/queries/useTakePayment.ts` | Card / cash / refund mutations. |
| `providers/TerminalProvider.tsx` | Mounted inside `ToastProvider`; renders children untouched unless enabled. |
| `components/bookings/TakePaymentSheet.tsx` | Amount, method selection, capture states, cash, refund, inline reader pairing. |
| `components/bookings/ReaderSettingsSheet.tsx` | Pair / battery / firmware / forget, from Settings. |

### Review findings (second pass, 2026-07-24)
Fixed after a line-by-line re-read of the canonical §7/§7A:
- **Reader cross-talk.** SDK discovery events are global, and the sheet mounts the Tap to Pay and Bluetooth hooks together, so each was seeing the other's readers (a Bluetooth scan could satisfy a Tap to Pay connect, and the phone's own reader appeared in the pairing list). Both callbacks now filter on `deviceType`.
- **Missing success state (§7.8).** Added: amount collected, the receipt line for card only (cash and refunds send no receipt, confirmed against the backend), and Done. This also removed a stale-balance bug where the header kept showing the original amount due after collecting.
- **Missing Retry (§7.8)** on the card error state; it repeats the channel that failed.
- **Missing last-used-method persistence (§7A.6).**
- **Missing auto-reconnect (§7A.5):** "Use card reader" now tries the remembered reader before showing a picker, and an unexpected disconnect makes ONE guarded silent reconnect attempt.
- **Discovery-timeout race:** a stale 30s timer could clear a newer attempt's resolver and hang it.
- **Snapshot staleness:** the sheet now receives the balance and ledger rows live from the booking, so a refetch is reflected without reopening.

**Doc correction:** §7A.4 lists the iOS plugin prop as `bluetoothPeripheralUsagePermission`; the pinned SDK's config-plugin schema actually accepts **`bluetoothPeripheralPermission`**. The doc's spelling would be silently ignored. Every prop in `app.json` was validated against the plugin's own type. `bluetoothBackgroundMode` is deliberately NOT set: background reconnection is optional in the doc and adds an App Store review surface for no v1 benefit.

### Review findings (third pass)
Five further defects, all fixed:
- **Abandon-cancel was a silent no-op.** The SDK does **not** re-export `cancelCollectPaymentMethod` from its package root, so the module-level `require(...)` resolved to `undefined` and cancelled nothing. It now comes off the `useStripeTerminal` hook and runs from `CardCollectSection`'s unmount cleanup, which covers every route out of the sheet.
- **Reader connect errors were lost.** `connect()` returned a bare boolean and the caller read `tapToPay.error` straight after awaiting, which sees the pre-await render's value (null). Every specific message ("Location permission is needed…") silently became the generic fallback. `connect()` now returns `{ ok, error }`. Regression-tested.
- **Wrong reader could collect.** Choosing "Tap to Pay on this phone" while a Bluetooth reader was still connected reused that reader, collecting on the wrong device and mislabelling the ledger row's `reader_type`. Both connect paths now check `deviceType` and disconnect first (Terminal holds one reader at a time).
- **Repeat `initialize()`.** The Bluetooth path re-initialised on every scan and connect; an "already initialised" error envelope would throw and abort the scan. Both hooks now share a one-shot `ensureTerminalInitialized`.
- **Ref mutated during render** (`reconnectRememberedRef`), which is unsafe under concurrent rendering. Moved into an effect.

### Review findings (fourth pass: both hardware paths + UI polish)
- **Abandoned discovery was never cancelled.** Leaving the pairing screen or the reader settings sheet left a Bluetooth scan running: battery drain, and worse, the SDK refuses to start a new discovery while one is in progress, so closing and reopening could leave pairing permanently broken until app restart. Both hooks now cancel discovery on unmount.
- **Firmware updates were invisible during pairing.** The pairing step showed "Choose your card reader" while a mandatory multi-minute install ran, with the reader buttons still tappable. It now shows the update copy with percentage and locks the controls (the card step already handled this).
- **An extra tap mid-payment.** After pairing a reader, staff had to press "Use card reader" a second time, with the client waiting. Pairing now continues straight into collection.
- **Buttons stayed live during reader work.** `busy` ignored the reader's own `connecting` / `updating` states, so a second collect could be fired mid-connect.

### Stress testing (fifth pass)
The reader layer is where every defect in this feature has been found, and it is
the part that cannot run on a device from here. So rather than re-reading it
again, it is now **executed** against a mock Terminal SDK that mirrors the real
one (readers arrive through the global callback DURING `discoverReaders`, not as
a return value):

- `lib/payments/reader-hooks.test.tsx` (22 cases) drives both state machines
  through connect, retry after failure, double-tap, abandon mid-discovery,
  linked-venue switch, firmware update with progress, low battery, unexpected
  disconnect, remembered-serial reconnect, and the no-reader timeout.
- `lib/payments/connection-token.test.ts` (10 cases) pins Terminal Location
  **scoping**: own-venue and linked-venue locations must never cross, because a
  leak there would attach a payment to the wrong venue's Stripe account.
- `TakePaymentSheet.test.tsx` now also covers card collection end to end through
  the UI, including the uuid attempt id and the reader-vs-pairing branch.

These confirm the earlier fixes actually hold (cross-talk filtering,
disconnect-before-connect, error propagation, discovery cancel on unmount,
shared one-shot init) rather than just looking right on the page.

### Visit-payment pass (sixth, `cad0bcc`)
Visit-scoped settlement landed in the backend **after** the mobile work and was already semantically compatible — `balance_due_pence` is the visit balance, so the sheet was collecting for the whole visit, and the list already collapses a multi-service visit into one row via `collapseMultiServiceVisits`. The gap was purely that staff had no way to tell **why** the amount exceeded the service they opened. Closed with the `VisitPayment` type, `visitPaymentNote()`, the sheet header note, and `BookingPaymentRow.booking_id` (because `payments[]` is now visit-wide).

### Refund routing (seventh pass, found by the doc reconcile)
Making the visit-scoping explicit in this file exposed a live contract mismatch between the two repos:
- the booking GET returns `payments[]` **visit-wide** (`.in('booking_id', visit.bookingIds)`), commented "refundable from any line";
- but the charge route's refund branch looks the row up **anchor-scoped** (`.eq('id', payment_id).eq('booking_id', id)`);
- and the app posted every refund to the **opened** booking, with `refundablePayments` filtering on status only.

So refunding a visit payment from any line other than the one it was collected on 409'd with "This payment cannot be refunded" — reachable because the list collapses a visit to one representative row, which needn't be the anchor. Standalone appointments were unaffected. **Fixed app-side** (no backend change needed, since the row *is* anchored to its own booking): `useRefundPayment` takes the row's `paymentBookingId` and posts there, and `otherVisitLineNote()` labels sibling rows in the refund list — `booking_id` had been on the type since `cad0bcc` but was never read. If the backend later widens its lookup to the visit, this stays correct.

### Money-state pass (eighth, 2026-07-29)
The seven passes before this one all landed on the **reader** layer. This one covers the **money state around it** — what the app believes has been paid, and when. Fixed app-side:

- **A successful tap left the booking looking unpaid.** The card mutation invalidated the caches once, the instant `confirmPaymentIntent` resolved, but the webhook is the source of truth and lands 1–3s later, so that single refetch returned the *pre*-webhook booking: "Outstanding £90" with a live Take payment button, and the `pending` ledger row invisible everywhere. A double charge waiting to happen. Now: a bounded backoff (2s/5s/10s) in `useBookingDetail` while a card row is pending (`lib/payments/settlement-watch.ts`), a "Card payment processing" banner on the booking, and the Take payment sheet opening on a warning step rather than the collect menu when a payment is in flight.
- **Over-entry was silently clamped**, on card *and* cash — see the clamp item below. `checkChargeAmount()` now blocks client-side.
- **The £1,000 cap surfaced as "Invalid request"** — mirrored as `MAX_IN_PERSON_PENCE` with a real message. Taking a >£1,000 balance *in full* stays possible: omitting `amount_pence` bypasses the schema cap and the server charges the balance it resolved itself.
- **Payment history** on the booking (`BookingPaymentHistory`), including `pending` / `failed` rows — previously the ledger was only visible through the admin-only refund list, three taps inside Take payment, and end-of-day reconciliation had nothing to work from.
- Plus: the card step now states the amount it is about to charge, the success screen states what is still outstanding after a part payment, cash gets a confirm step, refunds keep their amount in the confirm label and auto-disarm, the amount field re-seeds from a live balance without clobbering a typed figure, and both money-writing buttons carry a same-frame re-entry guard.

### Backend requirements
Four things this pass could **not** fix app-side. All live in `src/app/api/venue/bookings/[id]/charge/route.ts` unless stated.

1. **A stuck `pending` card row is unrecoverable in the app.** The refund branch requires `status === 'succeeded'`, so a row whose `payment_intent.succeeded` webhook never lands can be neither refunded nor cleanly re-collected — only the Stripe dashboard resolves it, and the venue is left holding a booking that may or may not have been paid. Needs either a **reconciliation job** that sweeps `booking_payments` for `card_present` rows `pending` beyond a threshold, retrieves the PaymentIntent on the snapshotted connected account and writes its real terminal status (then `recomputeBookingPaymentSummary`), or an **admin-triggered endpoint** doing the same for one row (e.g. `{ action: 'sync_payment', payment_id }`). A job is preferable: the app cannot be relied on to be open. Until then the app's mitigation is visibility only — the row is shown on the booking and in the sheet, and the copy sends staff to the Stripe dashboard.
2. **The silent clamp.** `chargePence = Math.min(Math.max(input.amount_pence ?? balanceDuePence, 1), balanceDuePence)` records a different figure from the one submitted, without saying so. On cash that is a till-reconciliation bug: staff take £50 in notes, the ledger says £30. The app now blocks it client-side, but any other client still walks into it. Should be a `400 { error, code: 'amount_exceeds_balance', balance_due_pence }` instead of a clamp.
3. **The cap error is unusable.** `amount_pence` is capped by `z.number().max(MAX_IN_PERSON_PENCE)`, so a breach fails schema parse and returns a bare `{ error: 'Invalid request' }`. Validate it outside the schema (or add a refinement message) and return a specific `code`. **Until then `MAX_IN_PERSON_PENCE` is duplicated in `lib/payments/payment-display.ts` and the two must be kept in sync.**
4. **The cash route doesn't echo what it recorded.** It returns only `{ success: true }`, so the app's success screen ("£30.00 collected", "£60.00 still outstanding") is built from what the *client* believed the balance was at render time. If the server balance dropped between render and POST — a deposit landing, a sibling service settled, a colleague collecting — the ledger holds the clamped figure while the screen reports the client's, and staff read the wrong number out to the client. Not fixable app-side. The card path is immune because it echoes `amount_pence`; cash should do the same (`{ success: true, amount_pence, balance_due_pence }`), after which the app can build the success screen from the response.

### Deliberately deferred
- **"Send payment link" fallback on card decline (§7.8).** The doc suggests reusing the deposit route's `send_payment_link`, but that machinery sends a **deposit** request tied to `deposit_status`, not an appointment **balance**. Firing it after a declined balance payment would email the client a misleading (or failing) deposit request. The sheet instead surfaces the decline and points staff at cash / another method. Wire this up once the backend exposes a balance payment link.
- **Tips** (`tip_amount_pence` reserved, unused in v1) and **partial refunds** (v1 refunds a whole ledger row).

## What we're building
Let staff collect an appointment's **outstanding balance in person**, by either of two card paths:
- **Tap to Pay on iPhone & Android** — the client taps their card or phone against the **staff phone**; no hardware. Needs an eligible NFC device and, on iOS, the Apple entitlement.
- **A Bluetooth reader (BBPOS WisePad 3)** — chip + contactless + on-reader PIN, on **any** Bluetooth-capable device. No Apple entitlement. This also closes the UK SCA gap: a high-value or PIN-required card that would stall Tap to Pay can just be chip-inserted with the PIN on the reader keypad.

Both run the identical `card_present` PaymentIntent through the same charge route, webhook, ledger and receipt — the only difference is which reader is connected when `collectPaymentMethod` runs. Plus **cash/external recording** and **refunds**. Money goes **directly to the venue** via Stripe Connect (0% to Resneo).

## Hard requirement — frictionless & optional, per appointment
- If the venue is **not** enabled (`venue.in_person_payments_enabled === false`), render **nothing** new and make **no** new network calls — the app behaves exactly as today.
- When enabled, the **Take payment** button appears only on appointments with an outstanding (or unknown) balance, and using it is always the staff's choice. **Never** block, nag, or auto-open on any status change. Completing an appointment with a balance left unpaid must be unobstructed.

## Backend API contract (already specified in the canonical doc)
- `POST /api/payments/connection-token` → body `{ owner_venue_id?: string }`, returns `{ secret, location_id }`. Used by the Terminal `tokenProvider`. Pass `ownerVenueId` from `useLinkedVenueContext()` so the token is scoped to the active (own or linked) venue's connected account.
- `POST /api/venue/bookings/[id]/charge`:
  - `{ method: 'card_present', amount_pence? }` → `{ payment_intent_id, client_secret, amount_pence }` (omit `amount_pence` = full balance).
  - `{ method: 'cash' | 'external', amount_pence, note? }` → `{ success: true }`.
  - `{ action: 'refund', payment_id, amount_pence? }` (admin) → `{ success: true }`.
- Booking detail GET now returns `booking_total_price_pence`, `amount_paid_pence`, `balance_due_pence`, `payment_state`, a `payments[]` ledger array, and a `visit_payment` object. **`balance_due_pence` may be `null`** when the appointment's price can't be resolved (the column is unreliable for appointments — see canonical §5.7); when null, the sheet asks staff to enter the amount.
- Venue bootstrap (`GET /api/venue`) now returns `in_person_payments_enabled` and `card_present_ready`.

### Payment is VISIT-scoped — Take payment settles the whole visit
A multi-service visit or group booking writes **one `bookings` row per service/person**, each with its own variant, add-ons and deposit. A cut + colour visit is **one collection, not two**: the backend's `loadVisitPaymentPicture` sums every row sharing `group_booking_id` and every payment across them. What this means for the app:

- `balance_due_pence`, `amount_paid_pence` and `payment_state` on the booking GET are **visit-scoped** — they are what Take payment acts on. `booking_total_price_pence` stays **this row's** resolved price.
- `visit_payment` carries `booking_count`, `booking_ids`, `total_pence`, `amount_paid_pence`, `balance_due_pence`. It is optional on the type so older payloads still parse.
- **Visit total is `null` if ANY line is unresolvable** (not £0) → staff enter the amount. Cancelled lines are excluded, except the anchor row. Siblings never cross venues.
- `payments[]` is **visit-wide**, so a visit payment is visible and refundable from any line — hence `BookingPaymentRow.booking_id`.
- One collection writes **one** ledger row, anchored to the booking the staff opened, with `metadata.group_booking_id` + `visit_booking_ids` for provenance.
- App-side, `visitPaymentNote()` (`lib/payments/payment-display.ts`) renders "Covers all N services in this visit" under the guest name, and returns **null for a standalone appointment** so the common case stays uncluttered. Without it staff had no way to tell why the amount exceeded the service they opened.

### Feature flag
`venues.in_person_payments_enabled` is the master switch (default false). The venue now **turns it on themselves** from the web Dashboard → Settings; it no longer needs a SQL flip for a pilot. When false the bootstrap returns false, the app renders nothing, and all three endpoints 403 — including refunds (the kill switch is total; Stripe-dashboard refunds still reconcile via the flag-agnostic `charge.refunded` webhook).

> **Source of truth = the webhook.** On a successful tap, invalidate booking caches and let the refetched booking (reflecting the webhook's write) show `payment_state='paid'`. Never set paid state from the client confirm result alone.

## Mobile build & native config — as built

**Dependency:** `@stripe/stripe-terminal-react-native`, **pinned at `0.0.1-beta.31`**. It's a public-preview beta and the discover/connect API has moved across betas, so per `AGENTS.md` re-read that exact version's reference before touching this code. (`@stripe/stripe-react-native` does **not** do Tap to Pay.) Two non-obvious constraints this version forces:
- **Never import the SDK directly** — it executes native work at import time and throws wherever the native module is absent (Expo Go, web, any build without it). All access goes through `lib/payments/terminal-sdk.ts`. This is what keeps the surface inert.
- **`cancelCollectPaymentMethod` is not re-exported from the package root** — it must come off the `useStripeTerminal` hook.

**Build:** requires a **custom EAS dev/prod build**, not Expo Go; `expo-dev-client` is already installed. Web export needs the native-only SDK stubbed in `metro.config.js`, and Android needs **`minSdkVersion 26`** (the Terminal SDK's floor) via `expo-build-properties`.

**`app.json` plugin config (as built, validated against the pinned plugin's own types):**
```json
[
  "@stripe/stripe-terminal-react-native",
  {
    "tapToPayCheck": true,
    "appDelegate": true,
    "locationWhenInUsePermission": "Location is required to accept in-person card payments.",
    "bluetoothAlwaysUsagePermission": "Bluetooth is used to connect to your card reader.",
    "bluetoothPeripheralPermission": "Bluetooth is used to connect to your card reader."
  }
]
```
- **Location permission is mandatory for both paths** — Stripe disables card-present payments outright without it.
- The canonical doc's §7A.4 originally said `bluetoothPeripheralUsagePermission`; the pinned plugin accepts **`bluetoothPeripheralPermission`** and silently ignores the longer spelling. Always validate prop names against the pinned plugin's types.
- **`bluetoothBackgroundMode` is deliberately unset.** It was judged optional for a Tap-to-Pay-first v1 and adds App Store review surface. Reconsider if the WisePad becomes the primary path: without `UIBackgroundModes: bluetooth-central` the reader can drop or power down when the app backgrounds or the phone locks.
- iOS entitlement `com.apple.developer.proximity-reader.payment.acceptance` lives in the `ios.entitlements` block (the plugin does not add it). Verify it survives into the built `.entitlements` — an EAS prebuild can overwrite. **Tap to Pay only** — see the entitlement note in Status.

**Env:** `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (the **platform** publishable key) in `lib/env.ts` + `.env.example`; the SDK needs it at init.

**Button gate** (`components/bookings/BookingDetailContent.tsx`, inside the existing "Payments & confirmation" card) implements canonical §3.4 rule 2 verbatim: `in_person_payments_enabled && isAppointmentVenue && status !== 'Cancelled' && payment_state ∉ {paid,refunded} && (balance_due_pence === null || balance_due_pence > 0)`. Render nothing else when it's false — the surface simply doesn't exist.

## What's left before a pilot
1. An **EAS dev build** carrying the native Terminal module (nothing runs without it).
2. A pilot venue with `in_person_payments_enabled = true` (self-serve from the web dashboard now) **and** the Stripe card-present capability on its connected account.
3. **Apple entitlement** — only if the pilot uses Tap to Pay. A WisePad 3 pilot skips this entirely and can go first.
4. On-device manual passes the mock SDK can't cover: first-pair firmware update, low battery, disconnect mid-collection, on-reader PIN on a high-value card, contactless tap on the reader. A **simulated** Bluetooth reader (`simulated: true` in `__DEV__`) covers discover/connect/collect/confirm before hardware arrives.
