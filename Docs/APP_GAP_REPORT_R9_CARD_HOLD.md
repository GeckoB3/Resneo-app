# App gap report R9 — Card-hold deposits + post-R8 web parity

**Date:** 2026-07-19
**Web baseline:** `main @ 569d18b3` ("Staging (#104)", 2026-07-10) in `_reference/Resneo`
**Previous parity point:** web `main @ 2e37ea66` (2026-07-01) — the state the R8 compliance
work and the 2026-07-02 calendar/compliance parity commits were built against.

## Scope

Everything merged to the web `main` between those two commits, which squash-merges
PRs #91–#104. The polish branches (`card-hold-polish`, `services-polish`,
`claude/compliance-polish-phtmvb`, `claude/email-formatting-3day7z`) were verified to be
fully contained in `main` (their tips differ from `main` only by main-side newer
commits). #104 is marketing-only (Google Play badge + welcome email) — no app surface.

The dominant change is **card-hold deposits** (~22k lines,
`Docs/CARD_HOLD_DEPOSITS_DESIGN_AND_IMPLEMENTATION.md` in the web repo): a venue can
require card details at booking with no upfront payment, then explicitly charge a
no-show fee. Two new `deposit_status` values (`'Card Held'`, `'Charged'`), a
`booking_card_holds` table, a fourth `payment_requirement` value (`'card_hold'`), the
`card_hold_deposits` feature flag, and staff/guest surfaces throughout.

## Implemented in this pass (all shipped)

### Card holds

| # | Surface | App change |
|---|---------|-----------|
| 1 | Core state machine + copy | New [lib/booking/card-hold.ts](../lib/booking/card-hold.ts): verbatim port of the web's `card-hold-ui-state` (resolveCardHoldUiState §9.1 state table + §9.2a charge-gate mirror), `card-hold-copy` staff strings, `formatCardHoldFeePence`, `resolveStaffEntityCardHold`, `isRosterChargeLinkCandidate`. Tests in `card-hold.test.ts`. |
| 2 | Booking detail | `BookingDetailContent`: hold pill in hero + Details + Payments card, detail lines, "Card hold actions" replacing the legacy deposit button whenever a hold state resolves (§9.1 hiding rule). Cancel-gate bypassed for kept late-cancellation holds (§9.3). `BookingDetail.card_hold` typed from `GET /api/venue/bookings/[id]`. |
| 3 | Deposit actions sheet | `DepositSheet`: card-aware mode — Resend link / Waive / **Charge no-show fee** (in-sheet amount step, min £0.01 floor mirror, max = consented fee, live "Charge £X" confirm) / Refund no-show fee / Release card hold (two-step confirms). Legacy mode unchanged for non-hold bookings. `DepositAction` union gains `charge_no_show_fee` + `release_hold`. |
| 4 | New-booking wizard | Staff **Card hold toggle** (§7.6/D6): default on, walk-ins included, replaces "Require deposit" when the entity resolves to `card_hold`; sends `require_card_hold`; never sends `require_deposit` for hold entities. Appointment flow (`ConfirmStep`) + class/event/resource flows (via `BookingFlowConfirm`), fee = per-unit × spots/tickets. Confirmation panel shows "A card request link was sent to the guest." + fee. Multi-service chains surface `payment_mode: 'setup'` as the card-request notice. |
| 5 | Offerings/catalog types | `BookingPaymentRequirement` + appointment catalog types widened with `'card_hold'`; `payment_requirement` threaded into `AppointmentServiceOption` (the public payloads fold the venue flag in server-side). `offeringPriceLabel` shows "Free" for a free card-hold offering. |
| 6 | Service editors (4) | Appointment services, class types, events, resources: fourth "Card hold" radio (exact web copy), flag-gated via `resolved.card_hold_deposits`; amount field relabels to "No-show fee (£)" (per person for classes/events); validation mirrors the server (≥ £1 everywhere; classes capped at £150; no price relationship); fee persists into the same deposit column (D5); "Card hold is disabled for this venue…" note when configured-but-flag-off. Variant editor: per-option fee override relabel + ≥ £1 validation. |
| 7 | Services list | Card shows "Card hold: £X no-show fee" + "Card holds are switched off in Settings" warning (web #92 parity). |
| 8 | Class roster | Canonical `'No-Show'` status string (web D9 fix — was `'No Show'`), hold-state deposit lines, admin "Charge no-show fee: open this booking" affordance on chargeable rows (`isRosterChargeLinkCandidate`; row press opens booking detail where the real gate re-derives). |
| 9 | Event/resource attendee rows | `Card held` / `No-show fee charged` labels for hold statuses (amount-less rows previously showed nothing/mislabeled). |
| 10 | Timeline | 5 card-hold events (`card_hold_saved/_released/_charged/_charge_failed/_charge_refunded`) with the web's exact titles/details incl. release-reason labels. |
| 11 | Comms log labels | `card_hold_request_email/sms`, `card_hold_payment_reminder_email/sms`, `card_hold_charged_email`; `auto_cancel_notification` label updated to "deposit or card details missing". |
| 12 | Reports | Deposit summary gains "No-show fees charged (n)" + "Active card holds" rows and CSV lines (`report4_deposit` new keys). |
| 13 | Indicators | `showDepositPendingPill` documented: hold states never show "Deposit pending" (nothing owed upfront). |

### Other #91–#101 changes

| # | Change | App change |
|---|--------|-----------|
| 14 | Compliance venue-wide requirements GET | `useComplianceRequirementCounts` now makes ONE `GET /api/venue/compliance/requirements` (no `service_id`) and groups by the polymorphic service FK — replaces the per-service fan-out. Panel markers unchanged visually. |
| 15 | Manual service ordering (#94) | The manage list already ordered by `sort_order`; added admin **Move up / Move down** controls persisting via `PUT /api/venue/appointment-services/reorder` (`service_ids`, `sort_order = index`). Public booking page + staff wizard lists arrive server-sorted, so they follow automatically. |

### Covered without app work (server-side or web-only)

- Card-hold booking creation, cancellation/release semantics, crons, webhooks, emails,
  SMS, consent snapshots — all server-side; the app consumes the same routes.
- Add-on price double-count fix (#93, email totals), email formatting redesign (#94),
  cookie-consent + payment-label flicker fixes, Google Play homepage/welcome email (#102-#104),
  docs review (#91) — web/server only.
- Feature-flag instant updates (#92): the app already refreshes via react-query
  invalidation on flag PATCH.

## Deferred / accepted gaps

- **In-app Stripe capture** stays deferred (existing posture): card-hold staff bookings
  use the card-request **link** flow, which the backend sends for `POST /api/venue/bookings`.
  A staff **multi-service** chain with card-hold segments books through the public
  create-multi-service route whose card capture is client-secret-driven; the app shows the
  hold notice but cannot present the SetupIntent sheet (same standing limitation as deposits).
- **Drag-to-reorder** services (web dnd-kit): app ships up/down buttons (the web also has
  arrow buttons); a native drag list is a polish item.
- **List/glance approximation** (§9.1 accepted for v1, same as web): bookings-list rows
  without the hold payload fall back to enum-only pills.
- On-device smoke test of the new flows still to be done (web preview can't reach the
  authed API).

## Verification

- `npx tsc --noEmit` clean; `npm run lint` 0 errors (no new warnings).
- Jest: 105/105 suites, 927/927 tests green, including new `lib/booking/card-hold.test.ts`
  (state machine, charge gate, late-cancel keep, enum-only fallback, roster candidate,
  staff toggle resolution) and the rewritten venue-wide compliance counts contract test.
