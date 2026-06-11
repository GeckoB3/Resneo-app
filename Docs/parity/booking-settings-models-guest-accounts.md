# Booking settings (models & guest accounts) — parity ~45%

## App files
- C:\Resneo-app\app\(app)\manage\booking-settings.tsx
- C:\Resneo-app\lib\queries\useVenueSettings.ts
- C:\Resneo-app\types\venue.ts
- C:\Resneo-app\providers\VenueProvider.tsx

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\SettingsView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\BookingTypesSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\RequireAccountLoginSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\FeatureFlagsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\AnyAvailablePractitionerConfigSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\WaitlistConfigSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\feature-flags\route.ts

## Summary
The app page covers the two sections the web's booking-settings tab exposes: (1) booking model toggles and (2) the guest sign-in toggle. It shows the primary model as a read-only Badge, lists the three non-primary secondary models (class_session, event_ticket, resource_booking, table_reservation) as Switches, and has a single explicit "Save changes" button that calls PATCH /api/venue with active_booking_models + require_account_login_for_bookings. The web's booking-settings tab contains a third major section — Feature Flags — that is entirely absent from the app. The web also uses a richer booking-types model for Appointments-plan venues (four peer models including unified_scheduling, with "Set up →" deep-link buttons per active model) and autosaves on every toggle change rather than waiting for an explicit save. The app's FUTURE_BOOKINGS error handling is correct and mirrors the web's guard logic.

## Recommendation
The most impactful gap is the entirely absent Feature Flags section, which on Appointments-plan venues controls three booking-flow behaviours that affect guests directly: any_available_practitioner (slot assignment strategy), guest_self_reschedule, and waitlist_v2 (with its notification-mode sub-setting). Priority 1 is to add a FeatureFlagsCard in booking-settings.tsx backed by a new useUpdateFeatureFlags hook calling GET/PATCH /api/venue/feature-flags. The any_available_practitioner calendar-order config can be a simplified version (priority/random radio only; full calendar drag-order can be deferred). Priority 2 is correcting the booking model panel for Appointments-plan venues to show all four peer models (not three secondaries + a pinned primary), matching the web's BookingTypesSection. Priority 3 is removing the render-phase side-effect bug in the seeded initializer pattern. The explicit save button is acceptable on mobile but autosaving per-toggle (matching the web) would remove the awkward scroll-to-save friction; this can be done incrementally for the require_account_login_for_bookings toggle first (lowest risk) and then the model toggles. Finally, add class_commerce_enabled to the AppointmentsFeatureFlagKey type even if its toggle is rendered as disabled/web-only on mobile, to keep the type layer in sync with the backend contract.

## Gaps (5)

### [CRITICAL] Feature Flags section (Optional Booking Features) — missing
- Backend: GET /api/venue/feature-flags, PATCH /api/venue/feature-flags
- Web behaviour: Web renders a FeatureFlagsSection card (only for Appointments-plan admins) with four toggles: any_available_practitioner, guest_self_reschedule, waitlist_v2, class_commerce_enabled. Each toggle calls PATCH /api/venue/feature-flags with the full merged flags payload. Enabling any_available_practitioner expands an inline sub-panel (priority vs random mode + calendar drag-order) that reads GET /api/venue/feature-flags for calendar list. Enabling waitlist_v2 expands a waitlist-mode radio group (notify_in_order, staff_choose, notify_all) and auto-seeds communication policies. GET /api/venue/feature-flags, PATCH /api/venue/feature-flags.
- Mobile plan: Add a new FeatureFlagsCard component inside booking-settings.tsx. Gate it on isAdmin && isAppointmentsPlanTier(venue.pricing_tier). Render four Switch rows using resolved flags from venue.feature_flags.resolved (already available in VenueBootstrap). Add a useUpdateFeatureFlags mutation hook in lib/queries/useVenueSettings.ts that calls PATCH /api/venue/feature-flags with Bearer JWT. For any_available_practitioner, show an expandable sub-section when enabled with two radio options (priority/random); the calendar priority list can be deferred behind a 'Configure' link to the web for now. For waitlist_v2, show a brief expandable mode selector (three radio options). Add class_commerce_enabled to the app's AppointmentsFeatureFlagKey union type in types/venue.ts.

### [HIGH] Appointments-plan peer booking model list (unified_scheduling as a peer model) — partial
- Backend: PATCH /api/venue
- Web behaviour: On Appointments-plan venues the web's BookingTypesSection shows all four models as peers — unified_scheduling (Appointments & services), event_ticket (Ticketed events), class_session (Classes & sessions), resource_booking (Resources & facilities) — with checkboxes and a 'Set up →' button per enabled model that deep-links to the relevant dashboard area (/dashboard/calendar, /dashboard/event-manager, etc.). PATCH /api/venue with active_booking_models array. The primary model is NOT pinned read-only; it is one of the four peer checkboxes.
- Mobile plan: Extend SECONDARY_MODELS in booking-settings.tsx to include unified_scheduling ('Appointments & services') as a peer model for Appointments-plan venues. Detect Appointments plan via isAppointmentPlanTier(venue.pricing_tier) (import the helper or inline the check: tier === 'light' || tier === 'plus' || tier === 'appointments'). When on Appointments plan, replace the static primaryRow + secondaries pattern with a flat list of all four models as Switches (none pinned read-only). Add 'Set up' navigation hints per active model (ExternalLink or router.push to the relevant app screen or a WebView fallback).

### [MEDIUM] Autosave on toggle (debounced, no explicit save button needed) — partial
- Backend: PATCH /api/venue
- Web behaviour: BookingTypesSection debounces 550ms and auto-persists to PATCH /api/venue whenever the draft diverges from the server state; RequireAccountLoginSection persists immediately on each toggle. Both report status via SettingsSaveStrip. No explicit 'Save' button exists on web. PATCH /api/venue.
- Mobile plan: The current explicit-save pattern is acceptable on mobile but creates a friction mismatch. Consider switching booking-type toggles to optimistic per-toggle PATCH calls (matching RequireAccountLoginSection pattern) and keeping a single combined payload only when multiple toggles change in quick succession (debounce 600ms). The require_account_login_for_bookings toggle should fire its own PATCH immediately on change rather than waiting for 'Save changes', matching the web. This removes the need for the 'Save changes' button entirely and eliminates the seeded/hasChanges state machine.

### [MEDIUM] class_commerce_enabled feature flag — missing
- Backend: PATCH /api/venue/feature-flags
- Web behaviour: Web exposes class_commerce_enabled in FLAG_META inside FeatureFlagsSection. Toggling it calls PATCH /api/venue/feature-flags. The flag enables 'Class packs, courses & memberships' (credit packs, courses, memberships) in the Classes dashboard. This is marked out-of-scope (classes are not the app's priority) but the flag type gap affects future completeness.
- Mobile plan: Add class_commerce_enabled to AppointmentsFeatureFlagKey union in types/venue.ts. When FeatureFlagsCard is built (see above), include it in the flag list but mark its description as 'Manage from web dashboard' with the toggle disabled on mobile, since the Classes UI is out of scope for the app.

### [LOW] Set up deep-link per enabled booking model — missing
- Backend: none
- Web behaviour: When a booking model is checked/enabled, web renders a 'Set up →' link beside it that navigates to the relevant dashboard section (unified_scheduling → /dashboard/calendar, event_ticket → /dashboard/event-manager, class_session → /dashboard/class-timetable, resource_booking → /dashboard/resource-timeline). PATCH /api/venue (save first if dirty).
- Mobile plan: For enabled models, add a small 'Manage →' pill or chevron button that routes to the corresponding app screen or opens the web dashboard URL in a browser. Map: unified_scheduling → /(app)/calendar, others → external link to web dashboard (classes/events/resources are out of scope for the app).

## Bugs spotted
- [medium] State initialization is performed as a render-phase side effect. Lines 50–58 call setSeeded(true), setModels(...), and setRequireLogin(...) directly inside the render function body (inside an if block, not inside useEffect or a lazy useState initializer). This violates React's rules about side effects during render, can cause double renders in React 18 Strict Mode, and risks stale state if venue updates after first mount without triggering a re-seed. Fix: replace the seeded pattern with lazy useState initializers — e.g., useState(() => venue?.active_booking_models?.length ? [...venue.active_booking_models] : [venue?.booking_model ?? 'practitioner_appointment']) — and use useEffect to resync if venue.id changes. (C:\Resneo-app\app\(app)\manage\booking-settings.tsx)
- [low] The app's AppointmentsFeatureFlagKey type (types/venue.ts line 21–24) is missing class_commerce_enabled, which is present in the web's ResolvedAppointmentsFeatureFlags and FLAG_META. If GET /api/venue ever returns class_commerce_enabled in the resolved flags object, the app's typed usage will silently ignore it and the feature_flags.resolved object won't expose it to UI code that iterates the typed keys. (C:\Resneo-app\types\venue.ts)
- [low] useUpdateVenue's UpdateVenueInput interface (lib/queries/useVenueSettings.ts) does not include embed_accent_colour, booking_page_config, timezone, or public_booking_area_mode, all of which PATCH /api/venue accepts. This means if other settings screens (e.g. booking-page settings) are ever added to the app, they cannot reuse this mutation hook without casting or extending it. Not a bug on this page specifically but a type coverage gap exposed while reviewing this page. (C:\Resneo-app\lib\queries\useVenueSettings.ts)

## Design notes
- The current explicit 'Save changes' button at the bottom of a scrollable card list requires the user to scroll down to find it after toggling items near the top. On tall phones with large OS fonts this is especially awkward. A sticky floating save bar (similar to the web's SettingsSaveStrip) positioned at the bottom of the safe-area would be more ergonomic, or switch to per-toggle autosave (matching web behaviour) to eliminate the button entirely.
- The primary booking model is currently displayed as a read-only Badge labelled 'Set by your plan — change it from the web dashboard.' For Appointments-plan venues this copy is inaccurate: the web allows changing the primary model in-app (it is one of four peer toggles). The messaging should be conditional on pricing tier.
- Switch components for booking model toggles have no visual separator between rows within the Card. Adding a subtle border-bottom on each row (except the last) would improve scanability on small screens.
- Error text is rendered as a plain Text with tone='danger' but is not wrapped in an accessible role='alert' — screen-reader users may not be notified when the error appears after a failed save.
- The 'Also offer on your booking page' card caption ('Switching a type on adds it to your public booking page; its catalogue is set up on the web dashboard.') correctly defers catalogue setup to the web, but could include a tappable link that opens the web dashboard settings URL in the system browser, reducing friction for admins who want to complete configuration immediately.
