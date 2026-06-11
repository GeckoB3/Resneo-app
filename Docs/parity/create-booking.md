# create-booking — parity ~28%

## App files
- C:\Resneo-app\app\(app)\booking\new.tsx
- C:\Resneo-app\components\booking-wizard\ServicePickerStep.tsx
- C:\Resneo-app\components\booking-wizard\VariantStep.tsx
- C:\Resneo-app\components\booking-wizard\AddonsStep.tsx
- C:\Resneo-app\components\booking-wizard\MonthDatePicker.tsx
- C:\Resneo-app\components\booking-wizard\TimeSlotStep.tsx
- C:\Resneo-app\components\booking-wizard\GuestDetailsStep.tsx
- C:\Resneo-app\components\booking-wizard\ConfirmStep.tsx
- C:\Resneo-app\components\booking-wizard\RestaurantWalkInForm.tsx
- C:\Resneo-app\components\booking-wizard\WizardStepIndicator.tsx
- C:\Resneo-app\lib\queries\useCreateBooking.ts
- C:\Resneo-app\lib\queries\useCreateWalkIn.ts
- C:\Resneo-app\lib\queries\useAppointmentCatalog.ts
- C:\Resneo-app\lib\queries\useMonthAvailability.ts
- C:\Resneo-app\lib\queries\useAppointmentAvailability.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\new\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\new\NewBookingPageClient.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\StaffSurfaceBookingStack.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\AppointmentBookingFlow.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\UnifiedBookingForm.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\WalkInModal.tsx
- C:\Resneo-app\_reference\Resneo\src\lib\booking\staff-booking-modal-options.ts
- C:\Resneo-app\_reference\Resneo\src\lib\booking\staff-rebook-bootstrap.ts
- C:\Resneo-app\_reference\Resneo\src\lib\booking\booking-flow-api.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\route.ts

## Summary
The app implements a 7-step linear wizard (Service → [Variant] → [Add-ons] → Date → Time → Guest → Confirm) for appointment-type venues, plus a separate quick walk-in form for restaurant/table venues (RestaurantWalkInForm). It POSTs to /api/venue/bookings with appointment fields and to /api/venue/bookings/walk-in for table walk-ins. The web reference (NewBookingPageClient + StaffSurfaceBookingStack) is a substantially richer multi-surface hub: it supports five booking models via tabbed navigation (Table reservation, Appointment, Class, Event, Resource), a mode-choice screen (single vs group booking), multi-service chaining, staff rebook bootstrap from guest history, deposit/compliance flows, custom duration popover with free-text entry, practitioner step (separate from service), time-slot grouping by period, dietary notes/occasion/special_requests on guest details, floor-plan/table assignment in the walk-in tab, phone number E164 normalisation with country selector, and a post-create confirmation screen with deposit payment handling. The app covers only the core appointment path; all secondary models and advanced features are absent or rudimentary.

## Recommendation
The create-booking wizard covers the core appointment path well but is missing roughly 72% of the web's feature surface. Priorities in order: (1) Fix the two critical bugs — the isAppointmentVenue check that silently excludes unified_scheduling secondary-model venues, and the TimeSlotStep slot extraction that may return zero results for unified_scheduling venues. (2) Add the post-create confirmation screen so staff see deposit/cancellation details before navigating away, and fix the async Alert race on Android. (3) Add dietary_notes, occasion, and special_requests to GuestDetailsStep and wire them through to the API — these are frequently captured at the counter and the backend already accepts them. (4) Extend the CreateBookingPayload type to include all supported fields (duration_minutes, require_deposit, override_compliance) and update the ConfirmStep to surface the require-deposit toggle and the compliance-override flow. (5) Add the staff rebook bootstrap so the 'Rebook' action on a booking detail pre-fills and skips ahead in the wizard. (6) Switch the catalog fetch to include_hidden=true so staff-only add-on groups are visible. (7) Add time-slot grouping by period, service descriptions, and the custom free-text duration entry to match web quality. Multi-service chaining and group booking mode are powerful but niche features that can follow in a later phase.

## Gaps (19)

### [HIGH] Separate Practitioner selection step — missing
- Backend: GET /api/booking/appointment-catalog (already exists)
- Web behaviour: Web AppointmentBookingFlow has a dedicated 'practitioner' step between service and slot steps. The user picks a specific staff member or 'Any available'. Calls GET /api/booking/appointment-catalog?venue_id=&include_hidden=true, then renders per-practitioner rows with prefetch logic.
- Mobile plan: The app collapses practitioner into the ServicePickerStep (chips for filter only). When a single-practitioner service is available there is no issue, but venues that want the user to choose a staff member before seeing dates lose that experience. Add a PractitionerStep.tsx component after ServicePickerStep when the service has 2+ practitioners and the 'any available' row is not auto-selected. Wire it into the new.tsx step array as 'practitioner' (conditionally inserted, as variants/addons already are).

### [HIGH] Multi-service (consecutive appointment chain) booking — missing
- Backend: POST /api/booking/create-multi-service, POST /api/booking/validate-appointment-slot
- Web behaviour: Web allows staff to stack multiple consecutive services in one booking (e.g. cut + colour). Uses POST /api/booking/create-multi-service with segments[], each with serviceId, variantId, addonIds, practitionerId, startTime, durationMinutes. Validates each segment via POST /api/booking/validate-appointment-slot before create.
- Mobile plan: Add a MultiServiceChainStep component after the time slot step (triggered by an 'Add another service' button). Maintain a multiServiceSegments array in new.tsx state. After final chain is built, POST to /api/booking/create-multi-service instead of /api/venue/bookings. This is a sizeable feature; consider as a follow-up phase.

### [HIGH] Staff rebook bootstrap (pre-fill from guest history) — missing
- Backend: none
- Web behaviour: Web reads a one-shot payload written to sessionStorage (key 'reserveNI_staffRebook_v1') when the user taps 'Rebook' on a booking detail. Payload contains surface, appointment.{serviceId, practitionerId, variantId, durationMinutes}, guest.{firstName, lastName, email, phone}, and an initial date. The new-booking page uses hydrateStaffRebookBootstrapOnce() to pre-select service/practitioner/duration and pre-fill guest details fields, then jumps directly to the slot step.
- Mobile plan: Add writeRebookBootstrap() helper in lib/rebook-bootstrap.ts using AsyncStorage. In the booking detail screen ([id].tsx), add a 'Rebook' action that writes the payload and navigates to /booking/new. In new.tsx, read and apply the payload on mount (after catalog loads) to preset selectedService, selectedVariant, durationOverride, and guest state, then advance stepIndex to the date/time step.

### [HIGH] Guest fields: dietary notes, occasion, special requests — missing
- Backend: POST /api/venue/bookings already accepts dietary_notes, occasion, special_requests
- Web behaviour: Web's DetailsStep (appointment flow) and WalkInModal both collect dietary_notes (max 500 chars), occasion (max 200 chars), and special_requests (max 500 chars). All three fields are sent in the POST /api/venue/bookings body as optional strings.
- Mobile plan: Extend GuestDetailsStep.tsx to add three optional Input fields for dietary_notes, occasion, and special_requests. Extend the GuestDetails type and CreateBookingPayload interface to include these fields. Pass them through ConfirmStep and into useCreateBooking payload.

### [HIGH] Post-create confirmation screen with deposit status — missing
- Backend: none
- Web behaviour: Web AppointmentBookingFlow shows a full 'confirmation' step after successful create with: booking summary, deposit required notice with amount, cancellation policy (refundNoticeHours), and a 'Done' button that calls onBookingCreated. App immediately navigates via router.replace('/booking/{id}') with only an Alert if a deposit link was sent.
- Mobile plan: Replace the Alert + immediate navigation in ConfirmStep with an inline confirmation view. Show service summary, guest name, date/time, deposit amount (if payment_url was returned), cancellation notice hours (returned by backend as cancellation_notice_hours in the response). Add a 'View booking' button that does router.replace('/booking/{id}'). This avoids destroying the wizard context before the staff member can see the result.

### [MEDIUM] Group booking mode (multiple attendees, same day) — missing
- Backend: POST /api/booking/create-group
- Web behaviour: Web shows a 'mode_choice' step with Single/Group options. Group mode collects each person's label, service, practitioner, and slot separately, then creates via POST /api/booking/create-group. Groups support deposit across all attendees.
- Mobile plan: Add a BookingModeStep (single/group) as the first step for appointment-plan venues. Group mode is a separate wizard flow; can be marked lower priority as it is relatively rare for staff counter ops but is flagged here for completeness.

### [MEDIUM] Staff require-deposit toggle — missing
- Backend: POST /api/venue/bookings already accepts require_deposit: boolean
- Web behaviour: Web AppointmentBookingFlow has a staffRequireDeposit checkbox (only for phone bookings, not walk-ins). When checked, sends require_deposit: true in the POST /api/venue/bookings body. Backend forces a Stripe PaymentIntent and sends a deposit link if Stripe is connected.
- Mobile plan: Add a Switch toggle 'Require deposit' in ConfirmStep (visible only for source='phone'). Wire to a requireDeposit state and include in the useCreateBooking payload.

### [MEDIUM] Custom duration: free-text entry (popover with 'Other minutes' input) — partial
- Backend: POST /api/venue/bookings already accepts duration_minutes
- Web behaviour: Web AppointmentBookingFlow shows a StaffCustomDurationPopover with 8 presets (15–120m) AND a free-text number input (min 15, max 840) so staff can enter any arbitrary duration. App only has 5 presets (30/45/60/90/120m) with no free-text option.
- Mobile plan: Extend the DURATION_PRESETS chip row in TimeSlotStep.tsx with a '+ Custom' chip that opens a Sheet with a numeric Input (min=15, max=840) and Confirm button. Replaces or supplements the current preset list.

### [MEDIUM] Restaurant walk-in: phone number field, E164 normalisation — partial
- Backend: POST /api/venue/bookings/walk-in validates E164 server-side
- Web behaviour: Web WalkInModal shows a PhoneWithCountryField with libphonenumber-js E164 normalisation (country inferred from venue currency, defaulting 'GB'). Validates the number before POST /api/venue/bookings/walk-in. App has a plain phone Input with no validation or normalisation.
- Mobile plan: Replace the plain phone Input in RestaurantWalkInForm with a component that applies normalizeToE164 validation (can reuse the lib/phone/e164 logic). Surface a field error if the number is invalid.

### [MEDIUM] Restaurant walk-in: cover/sitting duration selector — missing
- Backend: POST /api/venue/bookings/walk-in accepts duration_minutes
- Web behaviour: Web WalkInModal has a cover-time (sitting duration) slider/select (15–300 min, default auto-fetched from venue). Sends duration_minutes in POST /api/venue/bookings/walk-in. The server uses it for table availability and end-time calculation.
- Mobile plan: Add a duration selector (horizontal chip row with common values + custom input) to RestaurantWalkInForm, similar to TimeSlotStep's duration chips. Default to venue sitting duration if available, otherwise 90 min.

### [MEDIUM] Time-slot grouping by Morning / Afternoon / Evening — missing
- Backend: none
- Web behaviour: Web AppointmentBookingFlow groups available time slots into Morning (<12), Afternoon (12-17), and Evening (17+) sections with section headers. App renders all slots in a single flat wrapped grid.
- Mobile plan: Add a groupSlotsByPeriod() helper in TimeSlotStep.tsx (identical logic to web). Render three SectionHeader + slot-grid sections. Skip empty sections.

### [MEDIUM] Compliance pre-check acknowledgement (block_all override) — missing
- Backend: POST /api/venue/bookings returns {error: 'COMPLIANCE_REQUIREMENT_UNMET', message, details} on 409
- Web behaviour: Web AppointmentBookingFlow handles a 409 COMPLIANCE_REQUIREMENT_UNMET error from POST /api/venue/bookings. If the staff user is admin they can set override_compliance: true and re-submit. The error detail message is shown to staff.
- Mobile plan: In ConfirmStep, detect ApiError with status 409 and error code 'COMPLIANCE_REQUIREMENT_UNMET'. Show the server-supplied message plus a 'Book anyway (admin override)' button that re-submits with override_compliance: true. Gate the button based on whether the venue context indicates the user is an admin.

### [MEDIUM] Catalog uses public (unauthenticated) endpoint instead of staff endpoint — partial
- Backend: GET /api/booking/appointment-catalog already accepts include_hidden=true for authenticated staff sessions
- Web behaviour: Web AppointmentBookingFlow fetches appointmentCatalogUrl(venue.id, lockedPractitioner, isStaff=true) which adds ?include_hidden=true to GET /api/booking/appointment-catalog. This causes the backend to include addon groups marked hidden_from_online=true so staff can still select them. The app calls /api/booking/appointment-catalog without include_hidden.
- Mobile plan: In useAppointmentCatalog.ts, add an optional includeHidden: boolean parameter. When true, append &include_hidden=true and pass the accessToken in the request header. In new.tsx, pass includeHidden=true when appointmentVenue is true.

### [MEDIUM] Navigate to booking detail after creation with full cache invalidation — partial
- Backend: none
- Web behaviour: Web onCreated callback navigates to /dashboard/bookings (list). App navigates to /booking/{id} which is correct for mobile. However the app ConfirmStep does not invalidate queryKeys.bookings.detail(bookingId), only the list/dashboard keys, so the just-opened detail screen may load stale data if cached.
- Mobile plan: In useCreateBooking onSuccess callback, also call queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(response.booking_id) }) so the booking detail screen fetches fresh data.

### [LOW] Duration preset range mismatch (15m and 75/105m missing) — partial
- Backend: none
- Web behaviour: Web StaffCustomDurationPopover presets are [15, 30, 45, 60, 75, 90, 105, 120]. App TimeSlotStep has [30, 45, 60, 90, 120] — misses 15m, 75m, and 105m.
- Mobile plan: Update DURATION_PRESETS constant in TimeSlotStep.tsx to [15, 30, 45, 60, 75, 90, 105, 120] matching the web.

### [LOW] Restaurant walk-in: dietary notes, occasion fields — missing
- Backend: POST /api/venue/bookings/walk-in accepts dietary_notes, occasion (already deployed)
- Web behaviour: Web WalkInModal collects dietary_notes and occasion. POST /api/venue/bookings/walk-in accepts both.
- Mobile plan: Add optional dietary_notes and occasion Input fields to RestaurantWalkInForm. The useCreateWalkIn payload interface already defines both fields; just surface them in the UI.

### [LOW] Table/floor-plan assignment for restaurant walk-ins — missing
- Backend: POST /api/venue/bookings/walk-in accepts table_ids, area_id; requires GET /api/venue/availability and floor plan data
- Web behaviour: Web WalkInModal fetches table suggestions from the availability API and optionally renders a MiniFloorPlanPicker to assign a specific table or combination. Sends table_ids[] and area_id in the POST /api/venue/bookings/walk-in body.
- Mobile plan: Floor-plan rendering is complex and out-of-scope for mobile-first v1. A simpler approach: fetch table suggestions via the availability endpoint and show a list of table name chips the staff member can tap. Marked low priority per scope (table ops are secondary to appointments).

### [LOW] Service description display in service picker — missing
- Backend: GET /api/booking/appointment-catalog (description field already returned in catalog)
- Web behaviour: Web AppointmentBookingFlow shows ServiceCatalogDescription (description text, up to 3 lines) below each service name in the service step. App ServicePickerStep only shows name, duration, practitioner, and price — no description.
- Mobile plan: Pass service.description from the catalog into AppointmentServiceOption type. In ServicePickerStep, render a Text variant='caption' tone='muted' numberOfLines={2} below the service name if description is non-empty.

### [LOW] Venue catalog uses staff-only appointment-calendar endpoint for month availability — partial
- Backend: GET /api/venue/appointment-calendar (already deployed)
- Web behaviour: Web caches month availability per (practitioner, service, year, month, variantId, durationMinutes, addonIds) key and prefetches calendar months while the user is still on the practitioner step. App fetches on demand for the current month only with no ahead-of-time prefetch.
- Mobile plan: In MonthDatePicker, add a prefetch of the next month when the user navigates to the current month. Optionally, trigger prefetch of current month in useEffect when ServicePickerStep mounts (one request per practitioner offering the service).

## Bugs spotted
- [high] In TimeSlotStep.tsx (line 109), single-practitioner slots are filtered by serviceId AFTER extracting from singleQuery.data.practitioners, but singleQuery.data response format may not include a practitioners array keyed by id equal to practitionerId when practitionerId is a unified_calendars UUID. This works for practitioner_appointment venues but may silently return zero slots for unified_scheduling venues where the API response keys practitioners by calendar id rather than practitioner_id. (C:\Resneo-app\components\booking-wizard\TimeSlotStep.tsx)
- [high] In new.tsx, the isAppointmentVenue check (line 54-62) uses booking_model from venue context but also calls useAppointmentCatalog with venueId=null when not appointmentVenue. However if the catalog 404s for a restaurant venue the code falls through to RestaurantWalkInForm (isRestaurantCatalogFailure). This logic inverts: a restaurant venue that has appointment_services configured as a secondary model (unified_scheduling in enabled_models) will incorrectly skip the appointment wizard because APPOINTMENT_PLAN_TIERS and APPOINTMENT_MODELS only check booking_model, not enabled_models. The web checks both via isUnifiedSchedulingVenue() and enabledModels.includes('unified_scheduling'). (C:\Resneo-app\app\(app)\booking\new.tsx)
- [medium] In RestaurantWalkInForm.tsx, the component imports Text from react-native (line 1) directly rather than the theming-aware Text from @/components/ui/Text, which means typography and dark-mode colour tokens are bypassed for title, subtitle, and section labels in this form. (C:\Resneo-app\components\booking-wizard\RestaurantWalkInForm.tsx)
- [medium] In ConfirmStep.tsx, when the backend returns payment_url the app shows an Alert and then calls onSuccess(response.booking_id) (line 132-135). This means the wizard is torn down and router.replace fires before the staff member has seen the deposit alert, as Alert.alert is asynchronous on Android and does not block navigation. (C:\Resneo-app\components\booking-wizard\ConfirmStep.tsx)
- [low] In GuestDetailsStep.tsx (line 56), the guestsQuery is always active whenever debouncedSearch.length >= 2, even on the first keystroke after backspacing to 1 char. The results are correctly gated by debouncedSearch.length check on line 56, but the query fires unnecessarily and results are shown for a single-character search the moment debounce fires (because the 'results' variable is only computed at display time, not at query-enable time). (C:\Resneo-app\components\booking-wizard\GuestDetailsStep.tsx)
- [medium] In useCreateBooking.ts (line 19), the CreateBookingPayload interface does not include duration_minutes, dietary_notes, occasion, special_requests, override_compliance, or require_deposit fields — all supported by the POST /api/venue/bookings backend schema. The ConfirmStep currently passes durationOverride as the duration_minutes field in its mutate call (line 126), which works only because TypeScript does not enforce the interface at runtime, but this could be silently dropped if the payload is serialised differently. (C:\Resneo-app\lib\queries\useCreateBooking.ts)

## Design notes
- The WizardStepIndicator uses a segmented progress bar with a 'Step N of M · Label' caption. For long step sequences (7 steps including both optional variant and addons), the segments become very narrow on small screens. Consider showing a dot-based indicator or just the caption text for step counts above 5.
- The Back button in new.tsx is rendered below the active step content (line 319-321) with style={styles.backButton} inside the main View. On screens with keyboard open (GuestDetailsStep), the Back button can be hidden below the fold. It should be in the Screen header or a fixed-position bar at the bottom to remain accessible.
- TimeSlotStep renders all time slots as a uniform wrapped grid with no time-of-day grouping (morning/afternoon/evening). On busy days with 20+ slots, the user must scroll through all without context. Adding section headers matching the web grouping would improve scannability on mobile.
- ServicePickerStep renders service cards in a FlatList inside a flex:1 container. On iPad or large phones the cards are full-width and can look sparse. Consider a 2-column grid for screens wider than 600dp.
- RestaurantWalkInForm has an unconventional layout where the partyChipText style uses the heading typography token, making number chips quite large relative to the surrounding text. Consider using bodyMedium or label for the party size chips to match the visual weight of adjacent cards.
- The VariantStep radio controls use a custom circle + dot pattern rather than a native Radio group. There is no keyboard/accessibility grouping (aria-radiogroup equivalent). Use accessibilityRole='radiogroup' on the parent ScrollView and ensure each option's accessibilityLabel includes the service name for VoiceOver.
- MonthDatePicker uses an aspect ratio of 1.1 for each day cell. On narrow phones (360dp wide) this means cells are approximately 46x51dp, which is below the 48dp minimum touch target in the vertical direction. Change to aspectRatio: 1 and set minHeight: 44.
- The 'Continue' button in each step is placed inside the same ScrollView content as the step content (e.g. AddonsStep, VariantStep). As list content grows, the CTA scrolls off-screen rather than remaining pinned at the bottom. Extract the Continue button to a fixed-bottom position outside the ScrollView, using paddingBottom in the scroll container to avoid overlap.
