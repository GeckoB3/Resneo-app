# App Gap Report R12 — Web delta audit (resneo `38a7f64f..40558f01`)

**Date:** 2026-08-09
**Scope:** one squash — `40558f01 "Staging (#129)"` (61 files, ~6,750 insertions). Previous audited point: `38a7f64f` (see [R11](APP_GAP_REPORT_R11_WEB_DELTA.md)).
**Verdict:** four app items. One is a **live app bug** the web change introduces (billing), one is a **high-value backend one-liner** that also unblocks the parked multi-service calendar issue, one is a missing settings toggle, and one is a pre-existing divergence this delta puts a spotlight on.

**Status: all four BUILT 2026-08-09.** Backend change committed to `C:\Resneo` `staging` as `05085e5b` (unpushed). App changes are in the working tree. Full suites green on both sides — web 305 files/2,819 tests, app 143 files/1,452 tests; typecheck and lint clean. The multi-service *grouping* remains parked by decision (see §R12-1).

---

## 1. What the web shipped

| Theme | What it is | App relevance |
| --- | --- | --- |
| **Staff-first booking flow** | New per-venue flag `staff_first_booking_flow`, off by default. When on, the team member is chosen first, then that person's services — on the public page, the collective page, **and the staff-facing "New Appointment" form**. New `appointment-flow-order.ts`, `StaffChoiceCard.tsx`, settings card, e2e specs, and a 4-revision plan doc. | Toggle **and** the reorder — see R12-2 |
| **Service name snapshot** | Migration `20270103125000` adds `bookings.service_name_snapshot` + `service_variant_name_snapshot`, written once by trigger. Read paths now prefer the snapshot, so deleting or renaming a service no longer rewrites/erases history. | Mostly free — except the one endpoint only the app uses. See R12-1 |
| **Venue terminology default** | Migration `20270103124000` flips the `venues.terminology` column default from restaurant wording to appointments wording and repairs drifted rows per key; `mergeVenueTerminology` now ignores stale table words at display time. | See R12-4 |
| **Collectives** | Combined page inherits the host's `staff_first_booking_flow` and `any_available_practitioner`; host terminology resolved against `unified_scheduling`; practitioner ordering by owning venue. | N/A — all public combined-page rendering, which the app does not do (its `CombinedPageConfigEditor` is branding only) |
| **change-plan hardening** | Stripe rejection messages surfaced verbatim; `resume_subscription` on a `canceled`/`incomplete_expired` subscription now starts a **fresh Stripe Checkout** instead of failing. | **Live app bug — see R12-3** |
| Help search/articles, e2e specs, CI, `globals.css`, super-admin flags page | Web-only surfaces. | N/A |

## 2. Gaps

### R12-1 · The app's calendar endpoint missed the snapshot sweep — **High** — **BUILT**
The snapshot work updated **every** read path that resolves a service name… except the one the app's calendar uses.

| Read path | Snapshot-aware? | Used by |
| --- | --- | --- |
| `/api/venue/bookings/list` (`booking_item_name`, `service_variant_name`) | ✅ | web calendar + list, **app Bookings tab** |
| `/api/venue/bookings/[id]` and `…/summary` | ✅ | app booking detail |
| `/api/venue/guests/[guestId]` (client history) | ✅ | app client detail |
| `/api/venue/linked-calendar` | ✅ | app linked columns |
| **`/api/venue/calendar-grid`** → `getCalendarGrid()` in `src/lib/unified-availability.ts` | ❌ **not touched** | **app calendar only** |

`getCalendarGrid` selects `appointment_service_id, service_item_id` and resolves names from the live `appointment_services` / `service_items` tables. So on the app's calendar, a booking whose service was deleted still renders with **no service name** (`AppointmentBlock` falls back to the time label), and a renamed service still rewrites past bars — exactly what the migration set out to stop. Every other ResNeo surface, web and app, is now correct.

That endpoint has **no web consumers** (grepped: only help-article prose), which is why it keeps being missed.

**This is the same function that omits `group_booking_id`** — the cause of the multi-service calendar issue investigated on 2026-08-09 and parked.

**Built as** `05085e5b` on `C:\Resneo` `staging`: `getCalendarGrid` now selects `service_name_snapshot, group_booking_id, person_label` and resolves the bar label snapshot → catalogue → `'Service'`. `service_variant_name_snapshot` was **not** added — this grid renders a single `serviceName` per bar and never surfaced the variant, so selecting it would ship an unread column. New suite `src/lib/unified-availability.calendar-grid.test.ts` (8 tests) pins the precedence and was confirmed to fail 5/8 against the old code before the fix landed. An adjacent nit went with it: the old `?? 'Service'` let an empty catalogue name through as an empty bar, where `||` carries on to the generic word.

App side: `types/calendar-grid.ts` now declares `group_booking_id` / `person_label`. **The grouping itself stays parked** — merging bars needs the web's span semantics (first start → last end), not the Bookings tab's `collapseMultiServiceVisits` (which keeps one segment and would draw the visit at the first service's duration), and the rule for multi-person group bookings is still an open product decision. The service-name fix needed no app change at all: the app already renders whatever `serviceName` the server sends.

Needs a backend deploy, so **not OTA-only**.

### R12-2 · Staff-first toggle absent from the app — **Medium** — **BUILT**
`staff_first_booking_flow` joins `APPOINTMENTS_FEATURE_FLAG_KEYS` on the web and gets a settings card. In the app:
- `types/venue.ts:24` `AppointmentsFeatureFlagKey` lists six keys and **not** this one, so `ResolvedAppointmentsFeatureFlags` is now missing a key the server sends (structurally harmless at runtime, but the contract has drifted).
- `app/(app)/manage/booking-settings.tsx` renders toggles for five flags (`any_available_practitioner`, `guest_self_reschedule`, `waitlist_v2`, `class_commerce_enabled`, `card_hold_deposits`; compliance lives on its own screen). An admin working from mobile cannot turn staff-first booking on, or even see that it exists.

**CORRECTION (2026-08-09).** An earlier draft of this section said the app's booking wizard needed no change, on the strength of the plan doc, which lists the staff dashboard modal under "surfaces that never change". **The shipped code does not match the plan.** `AppointmentBookingFlow.tsx:743` reads:

```ts
staff_first_booking_flow === true &&
(bookingAudience === 'public' ||
  (isStaff && !staffCalendarSlotPrefillActive && !staffRebookBootstrap?.appointment)) &&
!editBooking && !lockedPractitioner && !preselectedServiceId
```

`isStaff` is explicitly included, so the staff-facing "New Appointment" form reorders too. Reading the plan instead of the implementation was the mistake; the code is the contract.

**Built as:** the flag key added to `AppointmentsFeatureFlagKey`; a "Staff-first booking" card in `booking-settings.tsx` beside "Any available practitioner"; `staffFirstEnabled` on `useBookingFormVenue`; a pure `lib/booking/appointment-flow-order.ts` (11 tests) holding the entry rule; a new `StaffPickerStep`; and the wizard reordered to `staff_pick → service → variant → addons → date → time` (11 component tests). `booking-settings.tsx` copy now matches the web's and says the reorder applies "when you take a booking yourself".

**The entry rule, ported exactly.** Reorder only when the session does not already know one of the two answers:
- knows the *what* (rebook seeded from a past appointment) → service-first;
- knows the *who* (calendar slot tap: date + time + column all set) → service-first;
- **walk-ins still reorder**, even from a column — the web's deliberate choice, since someone at the desk asks for a person as often as for a service.

Web conditions with no app equivalent, recorded so the two can be diffed later: `editBooking` (the app modifies in a separate sheet), `lockedPractitioner` (no per-practitioner page), `preselectedServiceId` (no `?service_id=` entry; the rebook bootstrap is the app's only "knows the what" path).

**Two app-specific decisions**, both documented at their call sites:
1. **Off when booking into a linked venue.** The linked profile does not carry the other venue's feature flags, and guessing at their booking setup is worse than the order our staff know — the same reasoning that already disables "any available" for linked venues.
2. **The rebook exclusion flips the ordering late.** The web has its bootstrap synchronously as a prop; the app reads it from SecureStore after mount. The ordering is pinned once the venue is known and the rebook effect flips it back to service-first when it resolves an appointment — which happens before any step the user could have acted on, and the same effect jumps the step, so nothing is left stranded.

### R12-3 · "Resume subscription" now reports a false success — **Medium/High (live bug)** — **BUILT**
`POST /api/venue/change-plan { action: 'resume_subscription' }` previously either resumed or errored. It now detects an unresumable subscription (`canceled`, `incomplete_expired`) and returns `{ redirect_url }` for a fresh Stripe Checkout — **with no `message` field**.

`app/(app)/manage/plan.tsx` `handleResume()` has neither a `redirect_url` branch nor a `manageOnWeb` gate, so on that path it renders `data.message ?? 'Your subscription will continue.'` — telling the admin their subscription is resuming when nothing happened and no checkout opened. Two separate defects:

1. **False success.** Needs the same `redirect_url` handling `handleResubscribe()` already has.
2. **Store-billing posture.** A resume that is really a *new purchase* should route to the web dashboard like `handleResubscribe()` does (`if (manageOnWeb) { openWeb('/dashboard/settings?tab=plan'); return; }`) — otherwise the app opens Stripe Checkout for a subscription, which is what the reader-app posture exists to avoid (Apple 3.1.1).

Also worth adopting: the route now surfaces Stripe's own rejection text, which the app displays verbatim via `setActionError(err.message)` — so this improves for free.

**Built as:** a pure `resolveResumeSubscriptionOutcome` helper in `lib/billing/resume-subscription-outcome.ts` (10 tests) returning `resumed` | `checkout` | `purchase_on_web`, with `handleResume()` acting on it. A genuine resume still happens in-app on every platform — restoring a subscription the venue already has is not a sale, which is why it was never gated in the first place; only the Checkout fallback follows the reader-app posture. One accepted trade-off, commented at the call site: on that path the server has already created a Checkout session before the app can decline it, so the session is left to expire — it costs nothing and charges nobody.

### R12-4 · App terminology defaults are restaurant wording — **Low (pre-existing, newly conspicuous)** — **BUILT**
`lib/booking/terminology.ts` hardcodes `{ client: 'Guest', booking: 'Reservation', staff: 'Staff' }` and is **model-blind**, while the web resolves per booking model (`DEFAULT_TERMINOLOGY`) and now additionally discards stale table words on non-table models.

Impact is limited today: `venues.terminology` is `NOT NULL` with a default, and the migration repairs drifted rows per key, so live venues carry correct wording that the app's merge passes through. The divergence bites where terminology is absent from a payload, and for venues that change booking model later (the web's new `resolveWord` defends against that permanently; the app has nothing). Fixing means porting `mergeVenueTerminology` — model-aware defaults plus the stale-table-word rule.

Note this is **not** caused by this delta; it predates it. Flagged because the delta makes the app the only surface still assuming restaurant wording.

**Built as:** `DEFAULT_TERMINOLOGY` (per model) and `mergeVenueTerminology(model, raw)` ported into `lib/booking/terminology.ts`, including the stale-table-word rule; `VenueProvider` now calls it with the venue's own `booking_model` and its private hardcoded copy is gone. There were **two** hardcoded copies, not one — the provider's is the one that mattered, since it merges before any screen reads terminology. `area` is deliberately not ported (nothing in the app reads it). The model-blind `mergeTerminology` survives as the documented fallback for two title helpers whose non-appointment branch has no model to hand.

One consequence worth recording, because it changes on-screen copy. `newBookingActionLabel` decided "did the venue choose this word?" by comparing against `'Reservation'` alone — which only worked while that was every venue's default. With per-model defaults an appointments venue now carries `'Appointment'`, so that comparison would have read the default back as a deliberate choice and every such venue would have said "New appointment", making the deliberate "New booking" branch unreachable (the same trap the original comment warns about, inverted — the wizard also creates classes, events and resources, so the broad word is the accurate one). The check is now membership of the set of all model default booking words. One existing test expectation flipped with it and is annotated in place.

## 3. Method note

`40558f01` is a squash; `main` and `staging` are identical (`git diff --stat origin/main origin/staging` empty), so no branch ambiguity this time. Findings verified by reading the squashed diff against the app working tree at `3d26122` plus the uncommitted R11 work.
