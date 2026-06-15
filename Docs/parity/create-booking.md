# create-booking — parity ~86%

> Re-audited 2026-06-15 against current source. The previous estimate (~28%) is badly obsolete —
> the wizard has been substantially rebuilt. The practitioner step, slot grouping, post-create
> confirmation, compliance override, require-deposit, returning-guest, custom duration, E164
> normalisation, and dietary/comments pass-through all ship now. One real feature gap remains
> (multi-service chaining) plus one latent routing bug; the rest is parity or out of scope.

## App files
- C:\Resneo-app\app\(app)\booking\new.tsx
- C:\Resneo-app\components\booking-wizard\WizardStepIndicator.tsx
- C:\Resneo-app\components\booking-wizard\ServicePickerStep.tsx
- C:\Resneo-app\components\booking-wizard\PractitionerStep.tsx
- C:\Resneo-app\components\booking-wizard\VariantStep.tsx
- C:\Resneo-app\components\booking-wizard\AddonsStep.tsx
- C:\Resneo-app\components\booking-wizard\StaffDurationControl.tsx
- C:\Resneo-app\components\booking-wizard\MonthDatePicker.tsx
- C:\Resneo-app\components\booking-wizard\TimeSlotStep.tsx
- C:\Resneo-app\components\booking-wizard\GuestDetailsStep.tsx
- C:\Resneo-app\components\booking-wizard\ConfirmStep.tsx
- C:\Resneo-app\components\booking-wizard\RestaurantWalkInForm.tsx
- C:\Resneo-app\lib\queries\useCreateBooking.ts
- C:\Resneo-app\lib\queries\useCreateWalkIn.ts
- C:\Resneo-app\lib\queries\useAppointmentCatalog.ts
- C:\Resneo-app\lib\queries\useMonthAvailability.ts
- C:\Resneo-app\lib\queries\useAppointmentAvailability.ts
- C:\Resneo-app\lib\phone\normalize.ts
- C:\Resneo-app\lib\rebook-bootstrap.ts
- C:\Resneo-app\lib\venue\venue-experience.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\new\NewBookingPageClient.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\StaffSurfaceBookingStack.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\AppointmentBookingFlow.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\UnifiedBookingForm.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\WalkInModal.tsx
- C:\Resneo-app\_reference\Resneo\src\lib\booking\staff-rebook-bootstrap.ts
- C:\Resneo-app\_reference\Resneo\src\lib\booking\booking-flow-api.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\route.ts

## Summary
The app implements a keyed (not index-based) appointment wizard whose ordered step list is **derived**
from the selection (new.tsx:199-211). The maximal flow is: **Service → Practitioner (if 2+ and not
prefilled) → Variant (if any) → Add-ons (if any) → Date → Time → Guest → Confirm**, with a separate
quick walk-in form for restaurant/table venues. It POSTs a single booking to /api/venue/bookings;
walk-ins POST to /api/venue/bookings/walk-in.

Nearly everything the prior brief flagged as missing now ships: a dedicated **PractitionerStep**
(with an "Any available" pooled row); **time-of-day slot grouping** (`groupSlotsByPeriod`,
Morning/Afternoon/Evening, empty sections filtered); a **post-create confirmation screen**
(`BookingConfirmationView` — service/practitioner/guest/date/time + deposit amount + cancellation
notice + a "View booking" button that defers navigation, killing the old async-Alert race);
**compliance 409 admin-override** ("Book anyway" re-submits with `override_compliance: true`); a
**require-deposit toggle**; a **returning-guest flag** (payload `returning_guest`); arbitrary
**custom duration** via **StaffDurationControl** (presets 15–120 plus a 5-min stepper clamped
15–840); **E164 phone normalisation** (`normalizePhone`, applied on the appointment path); and
**dietary/comments pass-through** ("Comments or requests" → folded into `dietary_notes` for the API).
`CreateBookingPayload` now carries every field (duration_minutes, dietary_notes, occasion,
special_requests, require_deposit, returning_guest, override_compliance). Extras beyond the brief
also landed: `include_hidden=true` staff catalog, rebook bootstrap hydration, a waitlist-join
fallback when no slots are free, and same-day min-notice slot filtering.

The one genuine feature gap left is **multi-service chaining** (consecutive services in one booking).
Group-booking mode and floor-plan/table assignment are out of scope. One latent bug remains: the
venue-type check in new.tsx ignores `enabled_models`.

## Recommendation
1. **Multi-service chaining (HIGH, the remaining feature gap)** — staff can't stack consecutive
   services (e.g. cut + colour) in one booking. There is no `create-multi-service` call and no
   multi-segment step anywhere (grep clean). This is a sizeable feature: add an "Add another
   service" affordance and a `segments[]` state, validate each via the slot endpoint, and POST to
   /api/booking/create-multi-service instead of /api/venue/bookings. Plan as its own phase.
2. **Fix the `enabled_models` routing bug (MEDIUM)** — new.tsx's local `isAppointmentVenue`
   (lines 65-73) checks only `pricing_tier` + `booking_model`; it does not consult
   `venue.enabled_models`. A shared, correct helper already exists — `isAppointmentExperience`
   (lib/venue/venue-experience.ts:19-29, which includes `enabledModels?.includes('unified_scheduling')`)
   and is used elsewhere (BookingDetailSheet.tsx:94) — but new.tsx doesn't import it. A table-first
   venue that enables appointments only as a secondary model is misrouted to the restaurant walk-in
   form. Swap the local check for the shared helper.

Lower priority: apply `normalizePhone` and add dietary/occasion inputs to RestaurantWalkInForm
(legacy table path), and show service descriptions in ServicePickerStep (VariantStep already shows
variant descriptions).

## Gaps (1)

### [HIGH] Multi-service (consecutive appointment chain) booking — missing
- Backend: POST /api/booking/create-multi-service, POST /api/booking/validate-appointment-slot
- Web behaviour: Web lets staff stack multiple consecutive services in one booking, each segment with its own service/variant/add-ons/practitioner/start/duration, validating each before create.
- App state: Confirmed absent — no `create-multi-service` / `validate-appointment-slot` / `multiServiceSegments` references anywhere in source (only Docs mention them). `useCreateBooking` posts a single booking.
- Mobile plan: Add an "Add another service" affordance after the time step; maintain a `segments[]` state; validate each segment; POST to /api/booking/create-multi-service. Sizeable — own phase.

## Out of scope
- **Group-booking mode** (single vs group choice). Web gates group authoring to `!isStaff`; the staff wizard is single-booking only. Read-only group **visit** display lives on the detail page (GroupVisitCards), not here.
- **Floor-plan / table assignment for walk-ins** (table_ids, area_id). `CreateWalkInPayload` defines the fields (useCreateWalkIn.ts:21-23) but the form never sets them; floor-plan rendering is out of scope for the appointments-first app.

## Partial (legacy walk-in path, low priority)
- **RestaurantWalkInForm phone is not E164-normalised** — the appointment path uses `normalizePhone` (ConfirmStep.tsx:211) but the restaurant walk-in form sends the raw phone (RestaurantWalkInForm.tsx:60). Reuse `normalizePhone` if this legacy path is kept.
- **RestaurantWalkInForm omits dietary_notes / occasion inputs** — the walk-in payload supports them but the form collects only party size / name / phone.

## Bugs spotted
- [medium] **`new.tsx` venue-type check ignores `enabled_models`.** The local `isAppointmentVenue` (new.tsx:65-73) checks `pricing_tier` + `booking_model` only. The shared `isAppointmentExperience` helper (lib/venue/venue-experience.ts:19-29) — which also checks `enabledModels?.includes('unified_scheduling')` and is used by BookingDetailSheet.tsx:94 — is **not** imported here. Effect: a table-first venue enabling appointments purely as a secondary (`unified_scheduling`) model falls through to RestaurantWalkInForm instead of the appointment wizard. Low blast radius, but it is the exact routing bug the old brief flagged and it is **not** fully fixed. Fix by adopting the shared helper. (C:\Resneo-app\app\(app)\booking\new.tsx)

All other bugs the previous brief listed are resolved:
- TimeSlotStep unified_scheduling slot extraction — now keeps slots where `!slot.service_id || slot.service_id === serviceId` (TimeSlotStep.tsx:182-186) — fixed.
- RestaurantWalkInForm importing `Text` from react-native — now imports from `@/components/ui/Text` (RestaurantWalkInForm.tsx:7) — fixed.
- ConfirmStep async Alert race on create — replaced by an inline `BookingConfirmationView` with navigation deferred to a "View booking" button (ConfirmStep.tsx:95-150, 268-275) — fixed.
- GuestDetailsStep query gating — query enabled and results both gated on `debouncedSearch.length >= 2` with a 280ms debounce (GuestDetailsStep.tsx:69-80) — addressed.
- CreateBookingPayload missing fields — interface now includes duration_minutes / dietary_notes / occasion / special_requests / require_deposit / returning_guest / override_compliance (useCreateBooking.ts:8-40) — fixed.

## Design notes
- The step machine is keyed (`StepKey`, new.tsx:41) with the ordered list derived at 199-211 and a prerequisite guard re-resolving the active key (369-379), so conditional steps (practitioner/variant/add-ons) insert cleanly.
- Time slots are grouped by period with section headers (`groupSlotsByPeriod`, TimeSlotStep.tsx:86-101); a waitlist-join fallback renders when no slots are free (TimeSlotStep.tsx:345-467).
- Custom duration is chosen at the service/variant step (StaffDurationControl), flowing as `durationOverride` into availability scoping and the payload — not at the time step.
- `normalizePhone` is deliberately a best-effort helper, not libphonenumber-js (documented in lib/phone/normalize.ts) — adequate for staff entry; revisit if strict validation is needed.
- Consider a dot-based WizardStepIndicator for the longest flows, pinning the Continue/Back buttons outside the ScrollView so they stay reachable with the keyboard open, and a 2-column service grid on wide screens.
