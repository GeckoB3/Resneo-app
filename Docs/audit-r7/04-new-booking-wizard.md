## 04. New booking / booking wizard

**Parity:** Partial — the single-attendee, single-offering path reaches strong-to-full parity across all four surfaces, but the app cannot create the two booking shapes the web's appointment flow centres on (group bookings and multi-service visits), nor capture card payment in-flow.

The app ships a mature multi-model staff booking wizard (Appointment, Class, Event, Resource) under `app/(app)/booking/new.tsx` + `components/booking-wizard/*`. For the common case — one attendee booking one offering — it is strong-to-full: guest search/select-or-create, variants, add-ons, practitioner pick (incl. "Any available"), month-availability + slot picking, deposit toggle, returning-guest flag, compliance-409 admin override, linked-venue (`owner_venue_id`) bookings, and "Book another". The parity ceiling is set by *create capability*, not polish: the web's `AppointmentBookingFlow` is built around group bookings (up to 10 distinct attendees) and multi-service back-to-back visits, and the app's `ConfirmStep` always posts `party_size: 1` with a single anchor id. Secondary gaps are no in-app Stripe capture (app emails a payment link), no client-address fieldset for at-home services, no `?tab=` deep-link/reset-to-start, appointment-only rebook bootstrap, and no resource per-day availability dots. The Table/restaurant surface is an intentional scope exclusion (appointments-first redesign), though an orphaned `RestaurantWalkInForm.tsx` lingers. One candidate gap — the "Occasion" field — was refuted: the web does not collect it on appointment/class flows either.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| New-booking shell / surface tabs | `NewBookingPageClient.tsx`, `StaffSurfaceBookingStack.tsx` | `app/(app)/booking/new.tsx`, `BookingTypeTabs.tsx` | Strong | Both derive surfaces from `booking_model` + `enabled_models`; web adds a Table surface + `?tab=` URL sync + reset-on-reselect the app lacks. |
| Appointment booking (single service) | `AppointmentBookingFlow.tsx` | `ServiceBookingFlow.tsx` (+ Service/Practitioner/Variant/Addons/MonthDate/TimeSlot/GuestDetails/Confirm steps) | Strong | Full single-service create end-to-end; missing group, multi-service, in-flow payment, client-address. |
| Multi-service visit (one person, back-to-back) | `AppointmentBookingFlow.tsx` step `multi_service` | absent | Missing | App ends at a single service; `useGroupVisit` is read-only. |
| Group appointment (multiple attendees) | `AppointmentBookingFlow.tsx` `group_*` steps | absent | Missing | No group flow on any surface. |
| Class booking | `ClassBookingFlow.tsx` | `ClassBookingFlow.tsx`, `BookingFlowPrimitives.tsx` | Strong | Session calendar → spots stepper → guest → confirm; at parity for staff create. |
| Event ticket booking | `EventBookingFlow.tsx` | `EventBookingFlow.tsx`, `BookingFlowPrimitives.tsx` | Strong | Occurrence pick → per-ticket-type quantities → confirm; web differs only by public card capture. |
| Resource booking | `ResourceBookingFlow.tsx` | `ResourceBookingFlow.tsx`, `BookingFlowPrimitives.tsx` | Strong | Date → duration → start-time → guest → confirm; no per-day availability dots, no rebook bootstrap. |
| Guest details / select-or-create | `DetailsStep.tsx`, `StaffGuestContactFields.tsx` | `GuestDetailsStep.tsx`, `lib/queries/useGuests.ts` | Strong | Debounced guest search + manual entry + comments→`dietary_notes`; missing client-address fieldset. |
| Confirm + create + success | `AppointmentBookingFlow.tsx` `PaymentStep`, `StaffBookingConfirmationFooter.tsx` | `ConfirmStep.tsx`, `BookingFlowPrimitives.tsx`, `lib/queries/useCreateBooking.ts` | Strong | All four flows post one `POST /api/venue/bookings`; web captures card in-flow, app emails payment link. |
| Table / restaurant reservation + walk-in | `StaffSurfaceBookingStack.tsx` (`table_reservation`) | `RestaurantWalkInForm.tsx` (orphaned), `useCreateWalkIn.ts` | Missing | No table tab in `BookingTypeTabs`; walk-in form reachable from no route. Intentional exclusion. |

**New-booking shell.** Both render a tab bar only when more than one surface is enabled (`new.tsx` line 218), defaulting to the primary model and honouring deep-link prefills (`?type=`/`practitionerId`/`time`/`intent` on the app; `?tab=` on web). The app correctly scopes the whole form to a linked owner venue via a `LinkedVenueContext` override (`new.tsx` lines 79-88) and blocks with a 403 when the venue is unresolved. The web persists the active tab to the URL and resets the entire stack when "New Booking" is re-selected (`handleTabChange` → `router.replace ?tab=`, `resetToStart`, `onNavReselect`, `resetKey`); the app keeps tab choice in local state only (`activeTab` useState, `new.tsx` line 135).

**Appointment flow.** Covers the core staff create end-to-end: service pick with per-booking custom duration, optional practitioner step (incl. pooled "Any available" rows when the flag is on and 2+ staff), variant + add-on selection, month availability with auto-advance to the first bookable day, slot picking with min-notice/same-day filtering, walk-in vs phone source, guest search/manual entry, review with deposit toggle + "Require deposit", `returning_guest`, `owner_venue_id`, comments→`dietary_notes`, compliance-409 "Book anyway (admin override)", and "Book another". What it cannot do vs the web: multi-service chaining, group booking, in-flow Stripe `PaymentStep`, and the client-address fieldset.

**Class / Event / Resource flows.** All three are strong for staff create. Class: choose class → month calendar of session dates (green dots from `selectedClass.dates`) → session pick → spots stepper (capped at remaining/10) → guest → confirm, sending `class_instance_id` + `party_size` + `dietary_notes`. Event: choose event → date → occurrence/time → per-ticket-type quantity steppers with remaining caps and live total → guest → confirm, sending `experience_event_id` + `ticket_lines` + summed `party_size`. Resource: choose resource → date → duration chips → start-time chips → guest → confirm, sending `resource_id` + `booking_end_time` + `party_size: 1`, with a `?resourceId=` deep-link prefill. Note: class/event `party_size>1` is one guest buying multiple seats, **not** distinct attendees.

**Confirm + create.** All four flows post to a single `POST /api/venue/bookings` (model inferred from the anchor id in `useCreateBooking.ts`), invalidate the bookings/dashboard/calendar/schedule/event/resource caches, render an inline success card with a deposit/payment-link notice and "View booking"/"Book another", and surface compliance-409 inline with an admin-override retry. The web collects card payment in-flow via the Stripe `PaymentStep` for online deposits/full payment; the app never collects card and shows "A payment link has been sent to the guest" (`ConfirmStep.tsx` line 138), relying on the backend to email `payment_url`.

### Gaps & deficiencies

#### Critical

- **Cannot create group bookings (multiple distinct attendees)** — _function · critical_
  - **Web:** `AppointmentBookingFlow` `group_*` steps let staff add up to 10 people, each with their own service/variant/practitioner/slot/add-ons, a group review card, and a single grouped create (`bookingCreateGroupUrl`) with per-person deposit classification.
  - **App:** Absent — every flow books exactly one attendee; `ConfirmStep` hardcodes `party_size: 1` and a single anchor id. `useGroupVisit.ts` is read-only (GET only).
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (Step union `'group_person_label'`…`'group_confirmation'` lines 415-416; group flow lines 2319-2349, 4130-4676; `bookingCreateGroupUrl` import line 34); `components/booking-wizard/ConfirmStep.tsx` (`party_size: 1`, line 222); `lib/queries/useGroupVisit.ts` (GET `/api/venue/bookings/list?group_booking_id=…`)
  - **Fix:** Add a group-booking path to `ServiceBookingFlow.tsx` (new `group_*` `StepKey`s) mirroring the web group steps, reusing `ServicePickerStep`/`PractitionerStep`/`VariantStep`/`AddonsStep`/`TimeSlotStep` per attendee. Add a `useCreateGroupBooking` mutation in `lib/queries` posting the web's group create endpoint and render a group review card. If the full group flow is too large, ship as a first increment a same-service/same-time party of N (collect N names).

- **Cannot create multi-service (back-to-back) visits for one client** — _function · critical_
  - **Web:** After choosing the first slot, staff append additional consecutive services for the same client (`multi_service`/`append_variant`/`append_addons` steps); start times auto-recompute into a chain and one linked visit is created (`bookingCreateMultiServiceUrl`).
  - **App:** Absent — the appointment flow ends at a single service (`StepKey` union ends at `'confirm'`); there is no "add another service" affordance and the payload carries one `appointment_service_id`.
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (step `'multi_service'`; `recomputeMultiServiceChain` line 403; `bookingCreateMultiServiceUrl` line 1994); `components/booking-wizard/ServiceBookingFlow.tsx` (`StepKey` type line 37 ends at `'confirm'`); `components/booking-wizard/ConfirmStep.tsx` (single `appointment_service_id` line 229)
  - **Fix:** Introduce a `multi_service` review step in `ServiceBookingFlow.tsx` after slot selection that lists chosen segments and offers "Add another service" (re-entering service→variant→addons for the same practitioner), recomputing chained start times. Add a `useCreateMultiServiceBooking` mutation hitting the web's multi-service create endpoint and render a `MultiServiceSummaryCard`-equivalent using the existing `Card` primitives.

#### High

- **No in-app card/Stripe payment capture during booking** — _function · high_
  - **Web:** When an online deposit or full payment is required, the flow advances to a Stripe `PaymentStep` and collects the card before confirmation (appointment/class/event/resource).
  - **App:** Never collects payment; on success it shows "A payment link has been sent to the guest", relying on the backend emailing `payment_url`. Staff taking a phone booking cannot charge the card there and then.
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (`PaymentStep`, step `'payment'` lines 4049 & 4700, gated on `createResult.client_secret`); `components/booking-wizard/ConfirmStep.tsx` (payment-link notice line 138); `components/booking-wizard/BookingFlowPrimitives.tsx` ("A payment link has been sent to the guest")
  - **Fix:** If product wants payment-at-booking on mobile, integrate `@stripe/stripe-react-native` `PaymentSheet`: when `useCreateBooking` returns `client_secret` + `stripe_account_id`, present the sheet before showing the success card; otherwise keep the payment-link copy. Lower priority if the deposit-link model is the intended mobile UX, but document the divergence either way.

#### Medium

- **No client-address collection for at-home (`client_address`) services** — _function · medium_
  - **Web:** When a chosen service has `location_type='client_address'`, `DetailsStep` shows an address fieldset (line1/line2/town/postcode; line1+town+postcode required) and sends `client_address_*` on create — this applies to the appointment flow (`anyServiceNeedsClientAddress` over the selected service id).
  - **App:** Absent — the catalog/flow ignores `location_type`; no address fields are ever collected or sent, so mobile appointment bookings for at-home services lose the address.
  - **Evidence:** `_reference/Resneo/src/components/booking/DetailsStep.tsx` (`collectClientAddress` fieldset lines 291-298); `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (`anyServiceNeedsClientAddress` keyed on `svc.location_type==='client_address'` lines 1688-1697; `clientAddressPayloadFields` spread into create at lines 2007/2082/2133); `components/booking-wizard/GuestDetailsStep.tsx` + `components/booking-wizard/ConfirmStep.tsx` (no address handling)
  - **Fix:** Thread `location_type` through the `useAppointmentCatalog` types and, when the selected service is `client_address`, render an address fieldset in `GuestDetailsStep.tsx` and add `client_address_line1/line2/city/postcode` to the `ServiceBookingFlow` `ConfirmStep` `buildPayload` (mirror `clientAddressPayloadFields`).

- **No `?tab=` deep-link persistence or "reset to start" on re-entry** — _ui · medium_
  - **Web:** Active surface tab syncs to the URL (`?tab=appointment/class/…`), and re-selecting "New Booking" in the sidebar resets the whole stack (clears tab, rebook prefill, remounts) so each visit starts blank.
  - **App:** Accepts an initial `?type=` but tab choice lives only in component state (`activeTab` useState — not persisted or shareable), and there is no reset-to-start when navigating back to the booking tab, so stale wizard state can persist across opens.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/bookings/new/NewBookingPageClient.tsx` (`handleTabChange` `router.replace ?tab=` line 143; `resetToStart` line 122; `onNavReselect` line 133; `resetKey` line 158); `app/(app)/booking/new.tsx` (`activeTab` useState only, line 135 — no URL sync, no reselect reset)
  - **Fix:** In `app/(app)/booking/new.tsx`, write the active tab to a router param on change and key the flow subtree on a reset token cleared on screen focus (`useFocusEffect`) so returning to the tab starts fresh. Lower priority than the create-capability gaps.

- **Rebook pre-fill only works for appointments, not class/event/resource** — _function · medium_
  - **Web:** `staffRebookBootstrap` pre-fills the picker for appointment **and** resource surfaces (and guest fields broadly), letting staff re-create a prior booking quickly.
  - **App:** Only `ServiceBookingFlow` consumes the rebook bootstrap (`readAndClearRebookBootstrap`); `ClassBookingFlow`/`EventBookingFlow`/`ResourceBookingFlow` only honour a `?guestId` guest prefill, not a full service/date/duration rebook. The rebook payload type carries only an `appointment` shape.
  - **Evidence:** `components/booking-wizard/ServiceBookingFlow.tsx` (`readAndClearRebookBootstrap` lines 215-293) vs `ResourceBookingFlow.tsx`/`ClassBookingFlow.tsx`/`EventBookingFlow.tsx` (only `useGuestDetail` `?guestId` prefill; 0 rebook refs); `lib/rebook-bootstrap.ts` (`RebookBootstrapPayload` has only `.appointment`, lines 25-36); `_reference/Resneo/src/components/booking/ResourceBookingFlow.tsx` (`staffRebookBootstrap`, 12 refs)
  - **Fix:** Extend `lib/rebook-bootstrap.ts` to carry resource/class/event selections and consume it in `ResourceBookingFlow.tsx` (pre-select resource + duration + date) at minimum, mirroring the web resource rebook; reuse the existing guarded-apply pattern from `ServiceBookingFlow`.

- **Table / restaurant reservation + walk-in surface absent (orphaned walk-in form exists)** — _function · medium_
  - **Web:** Restaurant-mode venues get a "Table" surface (table/area/covers selection, walk-in seating via `WalkInModal`, `UnifiedBookingForm`).
  - **App:** Absent from the wizard — no table tab in `BookingTypeTabs` and no table/walk-in form is reachable. A `RestaurantWalkInForm.tsx` component does exist and consumes `useCreateWalkIn`, but it is imported by no screen under `app/` (dead/orphaned UI), so there is no navigable walk-in surface.
  - **Evidence:** `_reference/Resneo/src/components/booking/StaffSurfaceBookingStack.tsx` (`table_reservation` → `UnifiedBookingForm`/`WalkInModal` lines 339-365); `components/booking-wizard/BookingTypeTabs.tsx` (`BookingFlowType` has no `table_reservation`, line 12); `components/booking-wizard/RestaurantWalkInForm.tsx` (uses `useCreateWalkIn` but unimported by any route — grep over `app/` returns 0 matches); `lib/queries/useCreateWalkIn.ts`
  - **Fix:** Intentional scope exclusion per the appointments-first redesign (4-tab nav, no restaurant). If `table_reservation` venues come into scope, wire the existing `RestaurantWalkInForm` + a table-picker step and a "Table" `BookingFlowType`; otherwise consider deleting the orphaned `RestaurantWalkInForm` to avoid dead code. Listed for completeness.

#### Low

- **Resource date step shows no per-day availability indicator** — _ui · low_
  - **Web:** Resource flow pre-loads a month availability calendar and highlights days that have at least one bookable slot (green) before duration/slot.
  - **App:** Resource date step passes `availableDates={null}` to `MonthDatePicker`, so every future day looks selectable; the user only discovers no-availability after picking duration + time.
  - **Evidence:** `components/booking-wizard/ResourceBookingFlow.tsx` (`MonthDatePicker availableDates={null}`, line 213 — vs `ClassBookingFlow` which passes its session dates for green dots); `_reference/Resneo/src/components/booking/ResourceBookingFlow.tsx` (`ResourceCalendarMonth` + `availableDates`)
  - **Fix:** Add a resource month-availability query (extend `lib/queries/useBookableOfferings` or a new `useResourceMonthAvailability` hitting the resource calendar endpoint) and pass its date set to `MonthDatePicker` in `ResourceBookingFlow.tsx`.

- **No waitlist join when a day is fully booked** — _function · low_
  - **Web:** When no appointment slots are available and `waitlist_v2` is enabled, the *public* flow shows `AppointmentWaitlistJoin` so the guest can join the waitlist.
  - **App:** Absent — the empty time-slot state just tells the user to try another date.
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (`AppointmentWaitlistJoin` gated by `appointmentWaitlistEnabled && isPublicGuest`, line 3574; `isPublicGuest` line 548); `components/booking-wizard/TimeSlotStep.tsx` (empty state)
  - **Fix:** Web gates this to the public audience (`isPublicGuest`), so it is **not** part of the staff create flow — mirror only if staff-initiated waitlist adds are wanted. Documented as public-only; the staff flow lacks any waitlist affordance but the web staff flow does too.

### Investigated — not a gap

- **Missing "Occasion" field on appointment bookings** — False positive. The web does **not** collect "occasion" on appointment (or class) bookings. In `_reference/Resneo/src/components/booking/DetailsStep.tsx` the Occasion input renders only inside `{!useAppointmentFields && (...)}` (line 582), and `useAppointmentFields = isAppointment || isClass` (line 238); for the appointment variant occasion is explicitly sent as `undefined` (line 286). Occasion belongs to the restaurant/`table_reservation` surface only — which the app intentionally omits. The app is therefore already at parity for the appointment flow. (The `occasion` key in `CreateBookingPayload` at `lib/queries/useCreateBooking.ts` line 45 is just an unused type member mirroring the web's shared payload type.) Folded into the table/restaurant surface gap.

### Recommended work (ordered)

1. **Multi-service visit (critical, highest leverage).** Add a `multi_service` review step in `components/booking-wizard/ServiceBookingFlow.tsx` after slot selection (list segments + "Add another service" re-entering service→variant→addons), recompute chained start times, and add a `useCreateMultiServiceBooking` mutation in `lib/queries`. Smaller surface area than group; same client/guest throughout.
2. **Group appointment booking (critical).** Add `group_*` `StepKey`s to `ServiceBookingFlow.tsx` reusing the existing per-step components per attendee, plus a `useCreateGroupBooking` mutation and a group review card. If too large for one pass, ship a same-service/same-time party-of-N first (collect N names, one slot).
3. **In-flow Stripe capture (high) — product decision first.** If payment-at-booking is wanted on mobile, integrate `@stripe/stripe-react-native` `PaymentSheet` in `components/booking-wizard/ConfirmStep.tsx`, triggered when `useCreateBooking` returns `client_secret` + `stripe_account_id`; otherwise document the payment-link divergence and close.
4. **Client-address fieldset (medium).** Thread `location_type` through `useAppointmentCatalog` types; render an address fieldset in `GuestDetailsStep.tsx` for `client_address` services and add `client_address_*` to `ServiceBookingFlow` `ConfirmStep.buildPayload`.
5. **Tab persistence + reset-to-start (medium).** In `app/(app)/booking/new.tsx`, sync `activeTab` to a router param and key the flow subtree on a focus-cleared reset token (`useFocusEffect`).
6. **Extend rebook bootstrap to resource (medium).** Add resource (and optionally class/event) shapes to `lib/rebook-bootstrap.ts` and consume them in `ResourceBookingFlow.tsx`, reusing the guarded-apply pattern from `ServiceBookingFlow`.
7. **Resource month-availability dots (low).** Add a `useResourceMonthAvailability` query and pass its date set to `MonthDatePicker` in `ResourceBookingFlow.tsx` (replace `availableDates={null}`).
8. **Dead-code cleanup (low).** Either wire `components/booking-wizard/RestaurantWalkInForm.tsx` (+ `useCreateWalkIn`) into a navigable surface or delete the orphan to avoid confusion; revisit only if `table_reservation` venues come into scope.
