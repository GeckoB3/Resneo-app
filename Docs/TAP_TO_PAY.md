# Tap to Pay (mobile) — pointer + mobile essentials

> **Canonical design doc:** lives in the **backend repo** at `resneo/Docs/TAP_TO_PAY_DESIGN_AND_IMPLEMENTATION.md` (mirrored read-only at `_reference/Resneo/Docs/…`).
> That document covers the whole feature end-to-end (data model, backend endpoints, webhook, security, rollout, tests). This file is the **mobile-side summary** so resneo-app work is self-sufficient. If the two ever disagree, the canonical doc wins.

## Status (2026-07-24)

**Backend: implemented** (ledger, three endpoints, webhook branches, receipt, GET/bootstrap extensions).
**Mobile: implemented** — see "What shipped" below. **Not yet runnable end to end**: it needs an EAS dev build carrying the native Terminal module plus the Apple entitlement, and a pilot venue with `in_person_payments_enabled = true` and the Stripe card-present capability. Until then the surface is inert by design (the SDK is absent, so the app renders exactly as before).

### What shipped (mobile)
| File | Role |
|---|---|
| `lib/payments/terminal-sdk.ts` | Lazy, crash-proof SDK loader. **Never import the SDK directly** — it executes native work at import time and throws without the native module. |
| `lib/payments/connection-token.ts` | `POST /api/payments/connection-token` + per-venue-scope Terminal Location cache. |
| `lib/payments/terminal.ts` | `useTapToPayReader` — initialise, permissions, discover, connect. |
| `lib/payments/bluetoothReader.ts` | `useBluetoothReader` — scan, connect, firmware-update + battery + reconnect states (§7A). |
| `lib/payments/payment-display.ts` | The §3.4 button gate + neutral state labels (pure, unit-tested). |
| `lib/payments/attempt-id.ts` | RFC 4122 v4 `attempt_id` (the route rejects anything else). |
| `lib/queries/useTakePayment.ts` | Card / cash / refund mutations. |
| `providers/TerminalProvider.tsx` | Mounted inside `ToastProvider`; renders children untouched unless enabled. |
| `components/bookings/TakePaymentSheet.tsx` | Amount, method selection, capture states, cash, refund, inline reader pairing. |
| `components/bookings/ReaderSettingsSheet.tsx` | Pair / battery / firmware / forget, from Settings. |

### Deliberately deferred
- **"Send payment link" fallback on card decline (§7.8).** The doc suggests reusing the deposit route's `send_payment_link`, but that machinery sends a **deposit** request tied to `deposit_status`, not an appointment **balance**. Firing it after a declined balance payment would email the client a misleading (or failing) deposit request. The sheet instead surfaces the decline and points staff at cash / another method. Wire this up once the backend exposes a balance payment link.
- **Tips** (`tip_amount_pence` reserved, unused in v1) and **partial refunds** (v1 refunds a whole ledger row).

## What we're building
Let staff collect an appointment's **outstanding balance in person** by tapping the client's card/phone to the staff phone — **Stripe Tap to Pay on iPhone & Android, no hardware reader**. Money goes **directly to the venue** via Stripe Connect (0% to Resneo).

## Hard requirement — frictionless & optional, per appointment
- If the venue is **not** enabled (`venue.in_person_payments_enabled === false`), render **nothing** new and make **no** new network calls — the app behaves exactly as today.
- When enabled, the **Take payment** button appears only on appointments with an outstanding (or unknown) balance, and using it is always the staff's choice. **Never** block, nag, or auto-open on any status change. Completing an appointment with a balance left unpaid must be unobstructed.

## Backend API contract (already specified in the canonical doc)
- `POST /api/payments/connection-token` → body `{ owner_venue_id?: string }`, returns `{ secret, location_id }`. Used by the Terminal `tokenProvider`. Pass `ownerVenueId` from `useLinkedVenueContext()` so the token is scoped to the active (own or linked) venue's connected account.
- `POST /api/venue/bookings/[id]/charge`:
  - `{ method: 'card_present', amount_pence? }` → `{ payment_intent_id, client_secret, amount_pence }` (omit `amount_pence` = full balance).
  - `{ method: 'cash' | 'external', amount_pence, note? }` → `{ success: true }`.
  - `{ action: 'refund', payment_id, amount_pence? }` (admin) → `{ success: true }`.
- Booking detail GET now returns `booking_total_price_pence`, `amount_paid_pence`, `balance_due_pence`, `payment_state`. **`balance_due_pence` may be `null`** when the appointment's price can't be resolved (the column is unreliable for appointments — see canonical §5.7); when null, the sheet asks staff to enter the amount.
- Venue bootstrap (`GET /api/venue`) now returns `in_person_payments_enabled` and `card_present_ready`.

> **Source of truth = the webhook.** On a successful tap, invalidate booking caches and let the refetched booking (reflecting the webhook's write) show `payment_state='paid'`. Never set paid state from the client confirm result alone.

## Mobile work (see canonical §7 for full detail)
**Dependency:** `npx expo install @stripe/stripe-terminal-react-native` — **pin the exact version**; it's a public-preview beta and the discover/connect API has changed across betas. Per `AGENTS.md`, read that version's exact docs before coding. (`@stripe/stripe-react-native` does **not** do Tap to Pay.)

**Native config (`app.json`):** add the `@stripe/stripe-terminal-react-native` config plugin (`tapToPayCheck: true`, `appDelegate: true`, location usage string) + the iOS entitlement `com.apple.developer.proximity-reader.payment.acceptance`. Needs a **custom EAS dev/prod build** (not Expo Go); `expo-dev-client` is already installed. Real devices only (iPhone XS+/iOS 16.4+, NFC Android 11+).

**Env:** add `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (platform publishable key) to `lib/env.ts` + `.env.example`.

**New files:**
- `providers/TerminalProvider.tsx` — `StripeTerminalProvider` with a `tokenProvider`; **renders children untouched when the venue isn't enabled** (frictionless off).
- `lib/payments/terminal.ts` + `useTapToPayReader()` — lazy init → discover (`discoveryMethod: 'tapToPay'`, `simulated: __DEV__`) → connect with `locationId`; reconnect on linked-venue switch.
- `lib/queries/useTakePayment.ts` (+ `useRecordExternalPayment`, `useRefundPayment`) — modelled on `useBookingDeposit` in `lib/queries/useBookingMutations.ts`. Card flow: POST `/charge` → `retrievePaymentIntent` → `collectPaymentMethod` → `confirmPaymentIntent` → `invalidateBookingCaches`.
- `components/bookings/TakePaymentSheet.tsx` — modelled on `components/bookings/DepositSheet.tsx`; primary **Tap to Pay** (only if `card_present_ready`), secondary **Record cash/other**, admin **Refund**, with a capture state machine and an SCA/decline **Send payment link** fallback.

**Modified files:**
- `types/booking-detail.ts` — add `booking_total_price_pence`, `amount_paid_pence`, `balance_due_pence`, `payment_state`.
- `components/bookings/BookingDetailContent.tsx` — gated **Take payment** button + "Paid" indicator inside the existing "Payments & confirmation" card (`useVenueContext()` is already imported here). Gate: `in_person_payments_enabled && isAppointmentVenue && status !== 'Cancelled' && payment_state ∉ {paid,refunded} && (balance_due_pence === null || balance_due_pence > 0)`.
- `providers/AppProviders.tsx` — mount `TerminalProvider` just inside `ToastProvider` (no-op when venue not enabled).
- `types/venue.ts` (`VenueBootstrap`) — add `in_person_payments_enabled`, `card_present_ready` (already carries `stripe_connected_account_id`).

## Phase order (mobile portion)
Backend (data model + endpoints) ships and is tested first. Then: custom dev build with the SDK → Terminal provider + hooks (simulated reader first) → UI sheet + button → harden + store builds. Apple entitlement approval is the long pole — request it on day 1.
